import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import { Retell } from "retell-sdk";
import axios from "axios";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { 
  createAndSendDiscount, 
  checkDiscountEligibility 
} from './discount-sms-service.js';
import {
  fetchAbandonedCheckouts,
  formatCheckoutForCall,
  checkCustomerHistory,
  checkDiscountEligibility as checkAbandonedCheckoutDiscountEligibility
} from './abandoned-checkout-service.js';
import {
  initializeEmailService,
  sendRefundTicket,
  sendReplacementTicket,
  sendSupportTicket
} from './email-service.js';

// Import the improvement system
import { runImprovementLoop } from './prompt-improvement-loop.js';

// Import centralized Retell configuration
import { 
  RETELL_AGENTS, 
  RETELL_PHONE_NUMBERS, 
  getAgentConfig, 
  getAllAgents,
  getAgentsByFunction,
  refreshAgentDiscovery,
  CURRENT_CONFIG
} from './retell-config.js';

dotenv.config();

const app = express();
app.use(cors());
// Use JSON parser for all routes except the webhook
app.use((req, res, next) => {
  if (req.path === '/webhooks/retell') {
    next();
  } else {
    bodyParser.json({ limit: "2mb" })(req, res, next);
  }
});
// Also ensure URL encoded params are parsed (but not for webhook)
app.use((req, res, next) => {
  if (req.path === '/webhooks/retell') {
    next();
  } else {
    bodyParser.urlencoded({ extended: true })(req, res, next);
  }
});
app.use(express.static("public"));

const retell = new Retell({ apiKey: process.env.RETELL_API_KEY });
const publicBaseUrl = process.env.PUBLIC_BASE_URL || ""; // e.g., https://your-ngrok-domain.ngrok.io

// Use centralized agent configuration instead of hardcoded IDs
const DEFAULT_AGENT_ID = RETELL_AGENTS.DEFAULT; // Nick's post-delivery agent
const GRACE_AGENT_ID = RETELL_AGENTS.GRACE_ABANDONED_CHECKOUT; // Grace's abandoned checkout agent

// --- Data paths ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.join(__dirname, "..", "data");
const dncPath = path.join(dataDir, "dnc.json");
const callsLogPath = path.join(dataDir, "calls.log.jsonl");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(dncPath)) fs.writeFileSync(dncPath, JSON.stringify({ phones: [] }, null, 2));

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (_) {
    return fallback;
  }
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function appendJsonl(file, obj) {
  fs.appendFileSync(file, JSON.stringify(obj) + "\n");
}

// --- Helpers ---
function inCallWindow(now = new Date()) {
  const tz = process.env.CALL_WINDOW_LOCAL_TZ || "America/Los_Angeles";
  const start = process.env.CALL_WINDOW_START || "09:00";
  const end = process.env.CALL_WINDOW_END || "19:30";
  const fmt = (d) => d.toLocaleString("en-US", { timeZone: tz });
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const local = new Date(fmt(now));
  const begin = new Date(local); begin.setHours(sh, sm, 0, 0);
  const finish = new Date(local); finish.setHours(eh, em, 0, 0);
  return local >= begin && local <= finish;
}

async function fetchRecentDeliveredOrders({ hours = 48 } = {}) {
  // Pull orders fulfilled/shipped within the last N hours that include a phone number
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  const url = `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/2024-10/orders.json`;
  const params = {
    status: "any",
    financial_status: "paid",
    updated_at_min: since,
    fields: "id,order_number,customer,phone,shipping_address,current_total_price,created_at,closed_at,fulfillments,fulfillment_status,source_name,tags,note,line_items"
  };
  const res = await axios.get(url, {
    headers: { "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_TOKEN },
    params
  });
  const orders = res.data.orders || [];
  // Filter: delivered (has fulfillment tracking status delivered OR fulfillment_status == fulfilled) and has a phone to call
  return orders.flatMap((o) => {
    const phone = (o.phone || o?.customer?.phone || o?.shipping_address?.phone || "").trim();
    if (!phone) return [];
    const delivered = (o.fulfillment_status === "fulfilled") || (o.fulfillments || []).some(f => {
      const ss = f?.shipment_status || ""; // delivered, in_transit, etc
      return ss === "delivered"; // ensure post-delivery confirmation
    });
    if (!delivered) return [];
    const lineItems = Array.isArray(o.line_items) ? o.line_items : [];
    const primaryItem = lineItems[0]?.title || null;
    const itemsSummary = lineItems.slice(0, 5).map(li => `${li.quantity}x ${li.title}`).join(", ");
    const itemsForSpeech = lineItems.slice(0, 5).map(li => formatProductForSpeech(li.quantity, li.title)).join(", ");
    const deliveredAt = (o.fulfillments || []).find(f => (f?.shipment_status || "") === "delivered")?.updated_at || null;
    return [{
      order_id: o.id,
      order_number: o.order_number,
      phone,
      name: [o?.customer?.first_name, o?.customer?.last_name].filter(Boolean).join(" ") || "there",
      total: o.current_total_price,
      created_at: o.created_at,
      tags: (o.tags || ""),
      primary_item: primaryItem,
      items_summary: itemsForSpeech,  // Use conversational format for speech
      items_display: itemsSummary,     // Keep original format for display
      delivered_at: deliveredAt
    }];
  });
}

// --- Shopify helpers ---
async function shopifyGetOrderByNumber(orderNumber) {
  let num = String(orderNumber || "").trim();
  if (!num) return null;
  
  // Try different formats since Shopify can be picky
  const formats = [
    num,                           // As provided
    num.startsWith("#") ? num : `#${num}`,  // With #
    num.replace("#", ""),          // Without #
  ];
  
  for (const format of formats) {
    try {
      const url = `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/2024-10/orders.json`;
      const r = await axios.get(url, { 
        headers: { "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_TOKEN }, 
        params: { name: format, status: 'any' } 
      });
      const orders = r.data?.orders || [];
      if (orders.length > 0) {
        console.log(`Found order with format: ${format}`);
        return orders[0];
      }
    } catch (e) {
      // Try next format
    }
  }
  
  // If not found by name, try by order_number field
  try {
    const url = `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/2024-10/orders.json`;
    const r = await axios.get(url, { 
      headers: { "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_TOKEN }, 
      params: { status: 'any', limit: 250 } 
    });
    const orders = r.data?.orders || [];
    const match = orders.find(o => 
      String(o.order_number) === num || 
      String(o.name).replace("#", "") === num.replace("#", "")
    );
    if (match) {
      console.log(`Found order by searching: ${match.name}`);
      return match;
    }
  } catch (e) {
    console.error('Order search error:', e.message);
  }
  
  return null;
}

async function shopifyAppendNoteAndTags({ orderId, noteAppend, addTags = [] }) {
  if (!orderId) return null;
  // Fetch current order to merge tags and note
  const getUrl = `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/2024-10/orders/${orderId}.json`;
  const get = await axios.get(getUrl, { headers: { "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_TOKEN } });
  const order = get.data?.order || {};
  const existingTags = String(order.tags || "").split(", ").filter(Boolean);
  const mergedTags = Array.from(new Set([...existingTags, ...addTags.filter(Boolean)])).join(", ");
  const existingNote = String(order.note || "");
  const newNote = noteAppend ? (existingNote ? `${existingNote}\n${noteAppend}` : noteAppend) : existingNote;
  const putUrl = `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/2024-10/orders/${orderId}.json`;
  const payload = { order: { id: orderId, tags: mergedTags, note: newNote } };
  const res = await axios.put(putUrl, payload, { headers: { "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_TOKEN } });
  return res.data?.order || null;
}

async function findLatestOrderForPhone(phoneRaw) {
  const phone = String(phoneRaw || "").replace(/[^\d+]/g, "");
  if (!phone) return null;
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const url = `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/2024-10/orders.json`;
  const params = {
    status: "any",
    financial_status: "paid",
    updated_at_min: since,
    fields: "id,name,order_number,customer,phone,shipping_address,current_total_price,created_at,closed_at,fulfillments,fulfillment_status,tags,note,line_items"
  };
  const r = await axios.get(url, { headers: { "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_TOKEN }, params });
  const orders = r.data?.orders || [];
  const match = orders
    .filter((o) => {
      const p = (o.phone || o?.customer?.phone || o?.shipping_address?.phone || "").replace(/[^\d+]/g, "");
      return p && phone.endsWith(p.slice(-10)); // loose match on last 10 digits
    })
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
  return match || null;
}

// --- Retell: create an outbound phone call
async function placeConfirmationCall({ phone, customerName, orderNumber, agentId, fromNumber, metadata }) {
  /*
    Minimal payload using Retell "Create Phone Call" API via SDK.
    The number must be bound to an outbound agent in Retell dashboard.
  */
  const vars = {
    call_direction: 'OUTBOUND',  // Critical: Tell agent this is an outbound call
    customer_name: customerName,
    order_number: orderNumber,
    customer_phone: phone,  // Add phone for Shopify tool lookups
    primary_item: metadata?.primary_item,
    items_summary: metadata?.items_summary,
    delivered_at: metadata?.delivered_at,
    max_followup_questions: metadata?.max_followup_questions,
    resolution_preference: metadata?.resolution_preference
  };

  // Remove undefined values so we only pass concrete variables
  const dynamicVars = Object.fromEntries(
    Object.entries(vars).filter(([, v]) => v !== undefined && v !== null)
  );

  const result = await retell.call.createPhoneCall({
    // Required
    to_number: phone,
    from_number: fromNumber || RETELL_PHONE_NUMBERS.DEFAULT,
    override_agent_id: agentId || DEFAULT_AGENT_ID, // Use provided agent or default
    // Optional runtime variables
    metadata: { source: "meatery-post-delivery", ...vars, ...(metadata || {}) },
    // Inject variables for prompt interpolation in Retell LLM / conversation flow
    retell_llm_dynamic_variables: dynamicVars,
    // Call config overrides for this call only
    amd: { enable: true }, // answering machine detection
  });
  return result;
}

// --- Routes ---
app.get("/health", (req, res) => res.json({ ok: true }));

// --- Prompt Improvement Loop ---
app.post("/improve-prompt", async (req, res) => {
  try {
    const { runImprovementLoop } = await import('./prompt-improvement-loop.js');
    const result = await runImprovementLoop();
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ---- Retell Agent management ----
app.get("/agents", async (_req, res) => {
  try {
    const list = await retell.agent.list();
    res.json(list);
  } catch (e) {
    res.status(500).json({ error: e?.response?.data || e.message });
  }
});

// Get configured agents (from our dynamic configuration)
app.get("/agents/configured", async (_req, res) => {
  try {
    const agents = getAllAgents();
    res.json({
      agents,
      total: Object.keys(agents).length,
      config: CURRENT_CONFIG
    });
  } catch (e) {
    res.status(500).json({ error: e?.response?.data || e.message });
  }
});

// Get agents by function type
app.get("/agents/by-function/:functionType", async (req, res) => {
  try {
    const { functionType } = req.params;
    const agents = getAgentsByFunction(functionType);
    res.json({
      functionType,
      agents,
      count: Object.keys(agents).length
    });
  } catch (e) {
    res.status(500).json({ error: e?.response?.data || e.message });
  }
});

// Refresh agent discovery from Retell API
app.post("/agents/discover", async (_req, res) => {
  try {
    console.log('🔍 Refreshing agent discovery from Retell API...');
    const result = await refreshAgentDiscovery();
    
    if (result.success) {
      console.log(`✅ Agent discovery complete: ${result.discovered} discovered, ${result.total} total`);
      res.json({
        success: true,
        message: `Discovered ${result.discovered} agents, ${result.total} total configured`,
        ...result
      });
    } else {
      console.error('❌ Agent discovery failed:', result.error);
      res.status(500).json({
        success: false,
        error: result.error
      });
    }
  } catch (e) {
    console.error('❌ Agent discovery error:', e.message);
    res.status(500).json({ error: e?.response?.data || e.message });
  }
});

app.get("/agents/:id", async (req, res) => {
  try {
    const data = await retell.agent.retrieve(req.params.id);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e?.response?.data || e.message });
  }
});

app.patch("/agents/:id", async (req, res) => {
  try {
    const body = req.body || {};
    // If caller asks to set webhook to our app, compose it
    if (body.$setWebhookToApp === true) {
      body.webhook_url = publicBaseUrl ? `${publicBaseUrl}/webhooks/retell` : null;
      delete body.$setWebhookToApp;
    }
    const data = await retell.agent.update(req.params.id, body);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e?.response?.data || e.message });
  }
});

// Sync defaults from local file to a given agent
app.post("/agents/:id/sync-defaults", async (req, res) => {
  try {
    const defaultsPath = path.join(__dirname, "agent-defaults.json");
    const payload = JSON.parse(fs.readFileSync(defaultsPath, "utf8"));
    if (req.body?.overrideWebhookToApp === true) {
      payload.webhook_url = publicBaseUrl ? `${publicBaseUrl}/webhooks/retell` : null;
    }
    const data = await retell.agent.update(req.params.id, payload);
    res.json({ ok: true, agent: data });
  } catch (e) {
    res.status(500).json({ error: e?.response?.data || e.message });
  }
});

// Manually trigger calls for last N hours (default 48)
app.post("/tasks/call-recent", async (req, res) => {
  try {
    if (!inCallWindow()) return res.status(403).json({ error: "Outside calling window" });
    const hours = Number(req.body?.hours || 48);
    const candidates = await fetchRecentDeliveredOrders({ hours });
    const dnc = new Set(readJson(dncPath, { phones: [] }).phones);
    const results = [];
    for (const c of candidates) {
      const hasOptOutTag = String(c.tags || "").toLowerCase().includes("no call") || String(c.tags || "").toLowerCase().includes("do not call");
      if (dnc.has(c.phone) || hasOptOutTag) {
        results.push({ ok: false, to: c.phone, order_number: c.order_number, skipped: true, reason: "opted_out" });
        continue;
      }
      try {
        const r = await placeConfirmationCall({
          phone: c.phone,
          customerName: c.name,
          orderNumber: c.order_number,
          metadata: { primary_item: c.primary_item, items_summary: c.items_summary, delivered_at: c.delivered_at }
        });
        results.push({ ok: true, call_id: r.call_id, to: c.phone, order_number: c.order_number });
      } catch (err) {
        results.push({ ok: false, to: c.phone, error: err?.response?.data || err.message });
      }
    }
    res.json({ count: results.length, results });
  } catch (e) {
    res.status(500).json({ error: e?.response?.data || e.message });
  }
});

// Retell webhook receiver (call_started / call_ended / call_analyzed)
app.post("/webhooks/retell", express.raw({ type: "application/json" }), (req, res) => {
  try {
    // Debug what we're receiving
    if (!req.body || req.body.length === 0) {
      console.log("Retell Webhook: Empty body received (possible health check)");
      return res.status(200).send("ok");
    }
    
    // Parse the raw body
    let event;
    if (Buffer.isBuffer(req.body)) {
      const bodyStr = req.body.toString();
      // Check if it's actually JSON
      if (!bodyStr.trim().startsWith('{') && !bodyStr.trim().startsWith('[')) {
        console.log("Retell Webhook: Non-JSON body received:", bodyStr.substring(0, 100));
        return res.status(200).send("ok");
      }
      event = JSON.parse(bodyStr);
    } else if (typeof req.body === 'string') {
      event = JSON.parse(req.body);
    } else if (typeof req.body === 'object' && req.body !== null) {
      // Body is already parsed (shouldn't happen with our middleware fix, but just in case)
      event = req.body;
    } else {
      console.error('Invalid request body type:', typeof req.body);
      throw new Error('Invalid request body type');
    }
    
    // Debug logging to see what we're getting
    if (!event || typeof event !== 'object') {
      console.error("Webhook received invalid event:", event);
      return res.status(400).send("invalid-event");
    }
    
    // Handle both old and new Retell webhook formats
    let type, data;
    if (event.type && event.data) {
      // Old format: {type: "call_started", data: {...}}
      type = event.type;
      data = event.data;
      console.log("Retell Webhook (old format):", type, data?.call_id || 'no-call-id');
    } else if (event.event && event.call) {
      // New format: {event: "call_started", call: {...}}
      type = event.event;
      data = event.call;
      console.log("Retell Webhook:", type, data?.call_id || 'no-call-id');
    } else {
      console.log("Retell Webhook: Unknown format -", JSON.stringify(event).substring(0, 200));
      return res.status(200).send("ok");
    }
    
    try { appendJsonl(callsLogPath, { received_at: new Date().toISOString(), type, data }); } catch (_) {}
    // Best-effort Shopify side-effects
    (async () => {
      try {
        const m = data?.metadata || {};
        const analysis = data?.analysis || data?.call_analysis || {};
        const structured = analysis?.structured || analysis?.custom_analysis_data || {};
        const transcript = data?.transcript || "";
        const orderNumber = m.order_number || structured.order_number;
        
        // Check if discount should be sent
        if (type === "call_analyzed" || type === "call_ended") {
          const shouldSendDiscount = 
            transcript.includes("sending that discount code") ||
            transcript.includes("text you a") ||
            transcript.includes("10% off") ||
            (structured.send_discount_sms === true);
          
          if (shouldSendDiscount) {
            // Determine correct customer phone based on call direction
            let customerPhoneFromCall = null;
            if (data?.direction === 'outbound') {
              customerPhoneFromCall = data?.to_number;  // Customer is the recipient
            } else if (data?.direction === 'inbound') {
              customerPhoneFromCall = data?.from_number;  // Customer is the caller
            }
            
            const customerPhone = m.customer_phone || structured.customer_phone || customerPhoneFromCall;
            const customerName = m.customer_name || structured.customer_name || "Valued Customer";
            const customerEmail = m.customer_email || structured.customer_email;
            
            if (customerPhone) {
              console.log(`📱 Sending discount SMS to ${customerPhone}...`);
              
              try {
                // Cap discount at 15% maximum
                let discountValue = structured.discount_value || 10;
                if (discountValue > 15) {
                  console.log(`⚠️ Capping webhook discount at 15% (was ${discountValue}%)`);
                  discountValue = 15;
                }
                
                const discountResult = await createAndSendDiscount({
                  customerPhone,
                  customerName,
                  customerEmail,
                  discountType: 'percentage',
                  discountValue: discountValue,
                  reason: structured.discount_reason || 'customer_service',
                  orderNumber
                });
                
                if (discountResult.success) {
                  console.log(`✅ Discount sent: ${discountResult.discount.code}`);
                }
              } catch (err) {
                console.error(`❌ Failed to send discount:`, err.message);
              }
            }
          }
        }
        if (!orderNumber) return;
        const order = await shopifyGetOrderByNumber(orderNumber);
        if (!order?.id) return;
        const addTags = [];
        const notes = [];
        const satisfiedScore = structured.satisfied_score ?? event?.data?.satisfied_score;
        const hadIssue = structured.had_issue ?? event?.data?.had_issue;
        const issueNotes = structured.issue_notes ?? event?.data?.issue_notes;
        const preferredContact = structured.preferred_contact ?? event?.data?.preferred_contact;
        if (typeof satisfiedScore === "number") notes.push(`Post-delivery satisfaction: ${satisfiedScore}/10`);
        if (hadIssue) { addTags.push("post-delivery-issue"); notes.push(`Issue: ${issueNotes || "(details pending)"}`); }
        if (preferredContact) notes.push(`Preferred contact: ${preferredContact}`);
        if (notes.length || addTags.length) {
          await shopifyAppendNoteAndTags({ orderId: order.id, noteAppend: notes.join(" | "), addTags });
        }
        if (structured.requested_opt_out === true || event?.data?.requested_opt_out === true) {
          const phone = m.customer_phone || order?.phone || order?.shipping_address?.phone || order?.customer?.phone;
          if (phone) {
            const data = readJson(dncPath, { phones: [] });
            if (!data.phones.includes(phone)) { data.phones.push(phone); writeJson(dncPath, data); }
          }
        }
      } catch (_) { /* ignore webhook side-effect errors */ }
    })();
    res.status(200).send("ok");
  } catch (e) {
    console.error("Webhook parse error:", e.message);
    console.error("Request body type:", typeof req.body);
    if (req.body) {
      console.error("Body sample:", Buffer.isBuffer(req.body) ? req.body.toString().substring(0, 100) : JSON.stringify(req.body).substring(0, 100));
    }
    res.status(400).send("bad-request");
  }
});

// Simple in-memory test endpoint to place a single call
app.post("/call", async (req, res) => {
  const { phone, name, orderNumber, fromNumber, metadata } = req.body || {};
  if (!phone) return res.status(400).json({ error: "phone required" });
  try {
    const r = await placeConfirmationCall({ phone, customerName: name || "there", orderNumber, fromNumber, metadata });
    res.json(r);
  } catch (e) {
    res.status(500).json({ error: e?.response?.data || e.message });
  }
});

// Preview candidates without calling
app.get("/candidates", async (req, res) => {
  try {
    const hours = Number(req.query?.hours || 48);
    const candidates = await fetchRecentDeliveredOrders({ hours });
    const dnc = new Set(readJson(dncPath, { phones: [] }).phones);
    const filtered = candidates.filter(c => {
      const hasOptOutTag = String(c.tags || "").toLowerCase().includes("no call") || String(c.tags || "").toLowerCase().includes("do not call");
      return !dnc.has(c.phone) && !hasOptOutTag;
    });
    res.json({ total: candidates.length, callable: filtered.length, candidates: filtered });
  } catch (e) {
    res.status(500).json({ error: e?.response?.data || e.message });
  }
});

// --- Shopify data endpoints: shop, products, customers, orders ---
app.get("/shopify/shop", async (_req, res) => {
  try {
    const url = `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/2024-10/shop.json`;
    const r = await axios.get(url, { headers: { "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_TOKEN } });
    res.json(r.data);
  } catch (e) {
    res.status(500).json({ error: e?.response?.data || e.message });
  }
});

app.get("/shopify/products", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query?.limit || 50), 250);
    const page_info = req.query?.page_info;
    const base = `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/2024-10/products.json`;
    const headers = { headers: { "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_TOKEN } };
    if (page_info) {
      const r = await axios.get(`${base}?limit=${limit}&page_info=${encodeURIComponent(page_info)}`, headers);
      res.json({ products: r.data.products || [], link: r.headers?.link || null });
    } else {
      const r = await axios.get(base, { ...headers, params: { limit } });
      res.json({ products: r.data.products || [], link: r.headers?.link || null });
    }
  } catch (e) {
    res.status(500).json({ error: e?.response?.data || e.message });
  }
});

app.get("/shopify/products/:id", async (req, res) => {
  try {
    const url = `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/2024-10/products/${req.params.id}.json`;
    const r = await axios.get(url, { headers: { "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_TOKEN } });
    res.json(r.data);
  } catch (e) {
    res.status(500).json({ error: e?.response?.data || e.message });
  }
});

app.get("/shopify/customers", async (req, res) => {
  try {
    const email = String(req.query?.email || "").trim();
    const id = String(req.query?.id || "").trim();
    if (id) {
      const url = `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/2024-10/customers/${id}.json`;
      const r = await axios.get(url, { headers: { "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_TOKEN } });
      return res.json(r.data);
    }
    if (email) {
      const url = `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/2024-10/customers/search.json`;
      const r = await axios.get(url, { headers: { "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_TOKEN }, params: { query: `email:${email}` } });
      return res.json({ customers: r.data.customers || [] });
    }
    const url = `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/2024-10/customers.json`;
    const r = await axios.get(url, { headers: { "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_TOKEN }, params: { limit: 50 } });
    res.json({ customers: r.data.customers || [] });
  } catch (e) {
    res.status(500).json({ error: e?.response?.data || e.message });
  }
});

app.get("/shopify/orders", async (req, res) => {
  try {
    const params = {
      status: req.query?.status || "any",
      financial_status: req.query?.financial_status,
      fulfillment_status: req.query?.fulfillment_status,
      created_at_min: req.query?.created_at_min,
      updated_at_min: req.query?.updated_at_min,
      limit: Math.min(Number(req.query?.limit || 50), 250),
      fields: req.query?.fields
    };
    const url = `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/2024-10/orders.json`;
    const r = await axios.get(url, { headers: { "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_TOKEN }, params });
    res.json({ orders: r.data.orders || [] });
  } catch (e) {
    res.status(500).json({ error: e?.response?.data || e.message });
  }
});

app.get("/shopify/orders/:id", async (req, res) => {
  try {
    const url = `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/2024-10/orders/${req.params.id}.json`;
    const r = await axios.get(url, { headers: { "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_TOKEN } });
    res.json(r.data);
  } catch (e) {
    res.status(500).json({ error: e?.response?.data || e.message });
  }
});

// Lookup order by order number (Shopify "name" field). Provide order_number like 1234 or #1234.
app.get("/shopify/order-by-number", async (req, res) => {
  try {
    const order = await shopifyGetOrderByNumber(req.query?.order_number);
    res.json({ orders: order ? [order] : [] });
  } catch (e) {
    res.status(500).json({ error: e?.response?.data || e.message });
  }
});

// Batch call with optional overrides
app.post("/call/batch", async (req, res) => {
  try {
    const { hours = 48, fromNumber, max_followup_questions, resolution_preference } = req.body || {};
    if (!inCallWindow()) return res.status(403).json({ error: "Outside calling window" });
    const candidates = await fetchRecentDeliveredOrders({ hours });
    const dnc = new Set(readJson(dncPath, { phones: [] }).phones);
    const results = [];
    for (const c of candidates) {
      const hasOptOutTag = String(c.tags || "").toLowerCase().includes("no call") || String(c.tags || "").toLowerCase().includes("do not call");
      if (dnc.has(c.phone) || hasOptOutTag) {
        results.push({ ok: false, to: c.phone, order_number: c.order_number, skipped: true, reason: "opted_out" });
        continue;
      }
      try {
        const r = await placeConfirmationCall({
          phone: c.phone,
          customerName: c.name,
          orderNumber: c.order_number,
          fromNumber,
          metadata: {
            primary_item: c.primary_item,
            items_summary: c.items_summary,
            delivered_at: c.delivered_at,
            max_followup_questions,
            resolution_preference
          }
        });
        results.push({ ok: true, call_id: r.call_id, to: c.phone, order_number: c.order_number });
      } catch (err) {
        results.push({ ok: false, to: c.phone, error: err?.response?.data || err.message });
      }
    }
    res.json({ count: results.length, results });
  } catch (e) {
    res.status(500).json({ error: e?.response?.data || e.message });
  }
});

// --- Discount and SMS endpoints for Retell custom tools ---
app.post("/tools/send-discount", async (req, res) => {
  try {
    // Retell sends params in body.args
    const params = req.body?.args || req.body || {};
    const { 
      customer_phone,
      customer_name,
      customer_email,
      order_number,
      discount_type = 'percentage',
      discount_value = 10,
      reason = 'customer_service'
    } = params;

    if (!customer_phone) {
      return res.status(400).json({ 
        success: false, 
        error: "Customer phone number is required" 
      });
    }

    // Check eligibility first
    const eligibility = await checkDiscountEligibility({
      customerEmail: customer_email,
      customerPhone: customer_phone,
      orderNumber: order_number
    });

    if (!eligibility.eligible) {
      return res.json({
        success: false,
        reason: eligibility.reason,
        message: "Customer not eligible for discount at this time",
        speak: "I checked and you've already used a discount recently. I'll note your request and have our team look into other options for you."
      });
    }

    // Use suggested discount value if higher, but cap at 15%
    let finalDiscountValue = eligibility.discount_value || discount_value;
    if (finalDiscountValue > 15) {
      console.log(`⚠️ Capping discount at 15% (was ${finalDiscountValue}%)`);
      finalDiscountValue = 15;
    }

    // Create and send the discount
    const result = await createAndSendDiscount({
      customerPhone: customer_phone,
      customerName: customer_name || 'Valued Customer',
      customerEmail: customer_email,
      discountType: discount_type,
      discountValue: finalDiscountValue,
      reason: reason,
      orderNumber: order_number
    });

    if (result.success) {
      res.json({
        success: true,
        discount_code: result.discount.code,
        message: result.summary,
        speak: `Perfect! I've just texted you a ${finalDiscountValue}% off discount code to use on your next order. You should receive it within a few seconds. The code is ${result.discount.code.split('').join(' ')} and it's good for 30 days.`
      });
    } else {
      res.json({
        success: false,
        error: result.error,
        speak: "I'm having trouble creating that discount code right now. Let me have someone from our team follow up with you directly."
      });
    }

  } catch (error) {
    console.error('Error in /tools/send-discount:', error);
    res.status(500).json({ 
      success: false,
      error: error.message,
      speak: "I apologize, but I'm unable to process that discount right now. I'll make sure someone from our team reaches out to you."
    });
  }
});

app.post("/tools/check-discount-eligibility", async (req, res) => {
  try {
    const { customer_phone, customer_email, order_number } = req.body;
    
    const eligibility = await checkDiscountEligibility({
      customerEmail: customer_email,
      customerPhone: customer_phone,
      orderNumber: order_number
    });

    res.json(eligibility);
  } catch (error) {
    res.status(500).json({ 
      eligible: true, // Default to eligible if check fails
      reason: 'default',
      error: error.message 
    });
  }
});

// --- Helper function to format product titles conversationally ---
function formatProductForSpeech(quantity, title) {
  // Convert quantity to words for small numbers
  const numberWords = {
    1: 'one', 2: 'two', 3: 'three', 4: 'four', 5: 'five',
    6: 'six', 7: 'seven', 8: 'eight', 9: 'nine', 10: 'ten'
  };
  
  const qtyWord = numberWords[quantity] || quantity;
  
  // Clean up the product title for natural speech
  let cleanTitle = title
    .replace(/\|/g, '') // Remove pipe symbols
    .replace(/\s+/g, ' ') // Normalize spaces
    .replace(/(\d+)-(\d+)oz/gi, '$1 to $2 ounces') // "8-9oz" -> "8 to 9 ounces"
    .replace(/(\d+)oz/gi, '$1 ounces') // "8oz" -> "8 ounces"
    .replace(/MS (\d+)\+?/gi, 'marbling score $1') // "MS 9+" -> "marbling score 9"
    .replace(/BMS (\d+)/gi, 'marbling score $1') // "BMS 11" -> "marbling score 11"
    .replace(/A5/g, 'A-five') // "A5" -> "A-five"
    .trim();
  
  // Handle pluralization
  if (quantity === 1) {
    return `${qtyWord} ${cleanTitle}`;
  } else {
    // Simple pluralization for common meat terms
    if (cleanTitle.match(/steak|chop|roast|ribeye|strip|filet/i) && !cleanTitle.match(/steaks|chops|roasts|ribeyes|strips|filets/i)) {
      cleanTitle = cleanTitle.replace(/(steak|chop|roast|ribeye|strip|filet)/gi, '$1s');
    }
    return `${qtyWord} ${cleanTitle}`;
  }
}

// --- Flow function endpoints for Conversation Flow nodes ---
// Support both GET and POST for Retell custom tools
async function handleOrderContext(req, res) {
  try {
    // Accept params from either query (GET) or body (POST)
    const params = req.method === 'GET' ? req.query : req.body;
    
    // Debug what we're receiving
    console.log('Order context request:', {
      method: req.method,
      body: req.body,
      query: req.query,
      headers: req.headers['content-type'],
      url: req.url
    });
    
    // RETELL SENDS PARAMETERS IN body.args NOT IN params!
    // The structure is: body: { call: {...}, name: 'tool_name', args: { order_number: '42507' } }
    const retellArgs = req.body?.args || {};
    
    // Try to get the call object for phone context
    const callData = req.body?.call || {};
    
    let orderNumber = retellArgs.order_number ||  // <-- GET IT FROM body.args!
                      params?.order_number || 
                      params?.orderNumber || 
                      req.params?.order_number;
    
    // If still no order number, check if it's in the URL path
    if (!orderNumber && req.url) {
      const urlMatch = req.url.match(/order[_-]?number[=\/](\d+)/i);
      if (urlMatch) orderNumber = urlMatch[1];
    }
    
    // Determine the customer's phone number based on call direction
    // For outbound calls: customer phone is to_number
    // For inbound calls: customer phone is from_number
    const direction = callData?.direction || 'unknown';
    let customerPhoneFromCall = null;
    
    if (direction === 'outbound') {
      // Outbound: we called the customer, so customer is to_number
      customerPhoneFromCall = callData?.to_number;
      console.log(`Outbound call detected, using to_number: ${customerPhoneFromCall}`);
    } else if (direction === 'inbound') {
      // Inbound: customer called us, so customer is from_number
      customerPhoneFromCall = callData?.from_number;
      console.log(`Inbound call detected, using from_number: ${customerPhoneFromCall}`);
    }
    
    // Get phone from various sources - prioritize correct call direction phone
    let phone = retellArgs.phone || 
                retellArgs.customer_phone || 
                retellArgs.phone_number ||
                params?.phone || 
                params?.customer_phone ||
                customerPhoneFromCall ||  // Use the correctly determined phone from call
                callData?.metadata?.customer_phone;
    
    console.log(`Order context lookup: order=${orderNumber}, phone=${phone}, direction=${direction}`);
    
    let order = null;
    let lookupMethod = '';
    
    // First try order number if provided
    if (orderNumber) {
      order = await shopifyGetOrderByNumber(orderNumber);
      if (order) lookupMethod = 'order_number';
    }
    
    // If no order found and we have a phone, try phone lookup
    if (!order && phone) {
      console.log(`No order found by number, trying phone lookup: ${phone}`);
      order = await findLatestOrderForPhone(phone);
      if (order) lookupMethod = 'phone';
    }
    
    if (!order) {
      console.log(`Order not found: order=${orderNumber}, phone=${phone}, direction=${direction}`);
      return res.json({ 
        speak: "I'm having trouble finding your order. Can you provide your order number? It should be a 5-digit number.",
        error: "order_not_found",
        message: "Could not find order. Please provide order number."
      });
    }
    
    console.log(`Order found via ${lookupMethod}: #${order.order_number} for ${order.customer?.first_name || 'customer'}`);
    
    
    const lineItems = Array.isArray(order.line_items) ? order.line_items : [];
    
    // Create both display and speech versions
    const itemsSummary = lineItems.slice(0, 5).map(li => `${li.quantity}x ${li.title}`).join(", ");
    const itemsForSpeech = lineItems.slice(0, 5).map(li => formatProductForSpeech(li.quantity, li.title)).join(", ");
    
    const primaryItem = lineItems[0]?.title || null;
    const deliveredAt = (order.fulfillments || []).find(f => (f?.shipment_status || "") === "delivered")?.updated_at || null;
    
    // Build response with context about how we found it
    let speakPrefix = '';
    if (lookupMethod === 'phone') {
      speakPrefix = `I found your most recent order, number ${order.order_number}. `;
    } else {
      speakPrefix = '';
    }
    
    const response = {
      ok: true,
      order_id: order.id,
      order_number: order.order_number,
      customer_name: [order?.customer?.first_name, order?.customer?.last_name].filter(Boolean).join(" ") || "there",
      customer_phone: order?.phone || order?.shipping_address?.phone || order?.customer?.phone || null,
      items_summary: itemsForSpeech,  // Use conversational format for speech
      items_display: itemsSummary,     // Keep original format for display
      primary_item: primaryItem,
      delivered_at: deliveredAt,
      lookup_method: lookupMethod,     // How we found the order
      speak: speakPrefix + `Your order contains ${itemsForSpeech}`  // Use conversational format
    };
    
    console.log(`Order found: ${order.name} - ${itemsSummary} (via ${lookupMethod})`);
    res.json(response);
  } catch (e) {
    console.error('Order context error:', e.message);
    res.status(500).json({ error: e?.response?.data || e.message });
  }
}

app.get("/flow/order-context", handleOrderContext);
app.post("/flow/order-context", handleOrderContext);

app.post("/flow/capture-feedback", async (req, res) => {
  try {
    // Retell sends params in body.args
    const params = req.body?.args || req.body || {};
    const { order_number, phone, customer_phone, satisfied_score, had_issue, issue_notes, preferred_contact, requested_opt_out } = params;
    
    let order = null;
    let lookupMethod = '';
    
    // First try order number if provided
    if (order_number) {
      order = await shopifyGetOrderByNumber(order_number);
      if (order) lookupMethod = 'order_number';
    }
    
    // If no order found and we have a phone, try phone lookup
    if (!order && (phone || customer_phone)) {
      const phoneNumber = phone || customer_phone;
      console.log(`No order found by number, trying phone lookup: ${phoneNumber}`);
      order = await findLatestOrderForPhone(phoneNumber);
      if (order) lookupMethod = 'phone';
    }
    
    if (!order) {
      console.log(`Order not found: order_number=${order_number}, phone=${phone || customer_phone}`);
      return res.status(404).json({ 
        error: "order_not_found",
        speak: "I'm having trouble finding your order. Let me try a different approach to locate it."
      });
    }
    
    console.log(`Order found via ${lookupMethod}: #${order.order_number} for ${order.customer?.first_name || 'customer'}`);
    
    const addTags = [];
    const notes = [];
    if (typeof satisfied_score === "number") notes.push(`Post-delivery satisfaction: ${satisfied_score}/10`);
    if (had_issue) { addTags.push("post-delivery-issue"); notes.push(`Issue: ${issue_notes || "(details pending)"}`); }
    if (preferred_contact) notes.push(`Preferred contact: ${preferred_contact}`);
    await shopifyAppendNoteAndTags({ orderId: order.id, noteAppend: notes.join(" | "), addTags });
    if (requested_opt_out === true) {
      const phone = order?.phone || order?.shipping_address?.phone || order?.customer?.phone;
      if (phone) {
        const data = readJson(dncPath, { phones: [] });
        if (!data.phones.includes(phone)) { data.phones.push(phone); writeJson(dncPath, data); }
      }
    }
    res.json({ 
      ok: true,
      order_number: order.order_number,
      lookup_method: lookupMethod
    });
  } catch (e) {
    res.status(500).json({ error: e?.response?.data || e.message });
  }
});

app.post("/flow/request-replacement", async (req, res) => {
  try {
    // Retell sends params in body.args
    const params = req.body?.args || req.body || {};
    const { order_number, phone, customer_phone, item_title, quantity = 1, reason, issue_type } = params;
    
    console.log('🔍 Replacement request - Debug info:');
    console.log('   order_number:', order_number);
    console.log('   phone:', phone);
    console.log('   customer_phone:', customer_phone);
    console.log('   params:', JSON.stringify(params, null, 2));
    
    let order = null;
    let lookupMethod = '';
    
    // First try order number if provided
    if (order_number) {
      console.log('   Trying order number lookup:', order_number);
      order = await shopifyGetOrderByNumber(order_number);
      if (order) {
        lookupMethod = 'order_number';
        console.log('   ✅ Order found via order number');
      } else {
        console.log('   ❌ Order not found via order number');
      }
    }
    
    // If no order found and we have a phone, try phone lookup
    if (!order && (phone || customer_phone)) {
      const phoneNumber = phone || customer_phone;
      console.log(`   No order found by number, trying phone lookup: ${phoneNumber}`);
      order = await findLatestOrderForPhone(phoneNumber);
      if (order) {
        lookupMethod = 'phone';
        console.log('   ✅ Order found via phone lookup:', order.order_number);
      } else {
        console.log('   ❌ Order not found via phone lookup');
      }
    }
    
    if (!order) {
      console.log(`   ❌ Final result: Order not found`);
      console.log(`   order_number=${order_number}, phone=${phone || customer_phone}`);
      return res.status(404).json({ 
        error: "order_not_found",
        speak: "I'm having trouble finding your order. Let me try a different approach to locate it."
      });
    }
    
    console.log(`   ✅ Order found via ${lookupMethod}: #${order.order_number} for ${order.customer?.first_name || 'customer'}`);
    
    // Extract customer information - MUST get email for CC requirement
    const customerName = [order?.customer?.first_name, order?.customer?.last_name].filter(Boolean).join(" ") || "Valued Customer";
    const customerEmail = order?.customer?.email || order?.email || order?.contact_email || order?.billing_address?.email;
    const customerPhone = order?.phone || order?.shipping_address?.phone || order?.customer?.phone || order?.billing_address?.phone;
    
    // Log warning if no email found
    if (!customerEmail) {
      console.error(`❌ CRITICAL: No customer email found for order #${order.order_number} - Customer CANNOT be CC'd on ticket`);
    }
    
    // Send email ticket to Commslayer
    try {
      await sendReplacementTicket({
        orderNumber: order.order_number,
        customerName,
        customerEmail,
        customerPhone,
        itemTitle: item_title || "(unspecified)",
        quantity,
        reason,
        issueType: issue_type
      });
      console.log(`✅ Replacement ticket emailed for order #${order.order_number}`);
    } catch (emailError) {
      console.error(`⚠️ Failed to send replacement email ticket:`, emailError.message);
      // Continue even if email fails - we'll still update Shopify
    }
    
    // Also update Shopify with tags and notes
    const tag = "replacement-requested";
    const note = `Replacement requested: ${quantity}x ${item_title || "(unspecified)"}${reason ? ` | Reason: ${reason}` : ""} | Ticket filed with support team`;
    await shopifyAppendNoteAndTags({ orderId: order.id, noteAppend: note, addTags: [tag] });
    
    res.json({ 
      ok: true,
      order_number: order.order_number,
      lookup_method: lookupMethod,
      speak: customerEmail 
        ? "I've filed a priority ticket with our support team for your replacement. You'll receive a copy of this ticket at your email, and they'll contact you within 24 hours with shipping details."
        : "I've filed a priority ticket with our support team for your replacement. To ensure you receive updates, can you please provide your email address?",
      ticket_filed: true,
      customer_email_found: !!customerEmail,
      needs_email: !customerEmail
    });
  } catch (e) {
    console.error('❌ Replacement endpoint error:', e.message);
    res.status(500).json({ error: e?.response?.data || e.message });
  }
});

// Endpoint to update customer email if collected during call
app.post("/flow/update-customer-email", async (req, res) => {
  try {
    const params = req.body?.args || req.body || {};
    const { order_number, phone, customer_phone, customer_email } = params;
    
    if (!customer_email || !customer_email.includes('@')) {
      return res.status(400).json({ 
        error: "Invalid email address",
        speak: "I didn't catch that email correctly. Could you repeat it please?"
      });
    }
    
    let order = null;
    let lookupMethod = '';
    
    // First try order number if provided
    if (order_number) {
      order = await shopifyGetOrderByNumber(order_number);
      if (order) lookupMethod = 'order_number';
    }
    
    // If no order found and we have a phone, try phone lookup
    if (!order && (phone || customer_phone)) {
      const phoneNumber = phone || customer_phone;
      console.log(`No order found by number, trying phone lookup: ${phoneNumber}`);
      order = await findLatestOrderForPhone(phoneNumber);
      if (order) lookupMethod = 'phone';
    }
    
    if (!order) {
      console.log(`Order not found: order_number=${order_number}, phone=${phone || customer_phone}`);
      return res.status(404).json({ 
        error: "order_not_found",
        speak: "I'm having trouble finding your order. Let me try a different approach to locate it."
      });
    }
    
    console.log(`Order found via ${lookupMethod}: #${order.order_number} for ${order.customer?.first_name || 'customer'}`);
    
    // Update Shopify order note with the email
    const note = `Customer email provided during call: ${customer_email}`;
    await shopifyAppendNoteAndTags({ orderId: order.id, noteAppend: note, addTags: ["email-collected"] });
    
    console.log(`✅ Customer email collected for order #${order.order_number}: ${customer_email}`);
    
    res.json({ 
      ok: true,
      order_number: order.order_number,
      lookup_method: lookupMethod,
      speak: "Perfect, I've got your email. You'll receive a confirmation of this ticket shortly.",
      email_collected: true,
      customer_email: customer_email
    });
  } catch (e) {
    res.status(500).json({ error: e?.response?.data || e.message });
  }
});

// New endpoint for refund requests
app.post("/flow/request-refund", async (req, res) => {
  try {
    // Retell sends params in body.args
    const params = req.body?.args || req.body || {};
    const { order_number, phone, customer_phone, items, reason, preferred_resolution = 'refund' } = params;
    
    let order = null;
    let lookupMethod = '';
    
    // First try order number if provided
    if (order_number) {
      order = await shopifyGetOrderByNumber(order_number);
      if (order) lookupMethod = 'order_number';
    }
    
    // If no order found and we have a phone, try phone lookup
    if (!order && (phone || customer_phone)) {
      const phoneNumber = phone || customer_phone;
      console.log(`No order found by number, trying phone lookup: ${phoneNumber}`);
      order = await findLatestOrderForPhone(phoneNumber);
      if (order) lookupMethod = 'phone';
    }
    
    if (!order) {
      console.log(`Order not found: order_number=${order_number}, phone=${phone || customer_phone}`);
      return res.status(404).json({ 
        error: "order_not_found",
        speak: "I'm having trouble finding your order. Let me try a different approach to locate it."
      });
    }
    
    console.log(`Order found via ${lookupMethod}: #${order.order_number} for ${order.customer?.first_name || 'customer'}`);
    
    // Extract customer information - MUST get email for CC requirement
    const customerName = [order?.customer?.first_name, order?.customer?.last_name].filter(Boolean).join(" ") || "Valued Customer";
    const customerEmail = order?.customer?.email || order?.email || order?.contact_email || order?.billing_address?.email;
    const customerPhone = order?.phone || order?.shipping_address?.phone || order?.customer?.phone || order?.billing_address?.phone;
    
    // Log warning if no email found
    if (!customerEmail) {
      console.error(`❌ CRITICAL: No customer email found for order #${order.order_number} - Customer CANNOT be CC'd on ticket`);
    }
    
    // Send email ticket to Commslayer
    try {
      await sendRefundTicket({
        orderNumber: order.order_number,
        customerName,
        customerEmail,
        customerPhone,
        items: items || "All items in order",
        reason,
        preferredResolution: preferred_resolution
      });
      console.log(`✅ Refund ticket emailed for order #${order.order_number}`);
    } catch (emailError) {
      console.error(`⚠️ Failed to send refund email ticket:`, emailError.message);
      // Continue even if email fails - we'll still update Shopify
    }
    
    // Also update Shopify with tags and notes
    const tag = "refund-requested";
    const note = `Refund requested: ${items || "All items"}${reason ? ` | Reason: ${reason}` : ""} | Ticket filed with support team`;
    await shopifyAppendNoteAndTags({ orderId: order.id, noteAppend: note, addTags: [tag] });
    
    res.json({ 
      ok: true,
      order_number: order.order_number,
      lookup_method: lookupMethod,
      speak: customerEmail 
        ? "I've filed a priority ticket with our support team for your refund. You'll receive a copy of this ticket at your email, and they'll process this within 24 hours."
        : "I've filed a priority ticket with our support team for your refund. To ensure you receive updates, can you please provide your email address?",
      ticket_filed: true,
      customer_email_found: !!customerEmail,
      needs_email: !customerEmail
    });
  } catch (e) {
    res.status(500).json({ error: e?.response?.data || e.message });
  }
});

// Opt-out management
app.post("/opt-out", (req, res) => {
  try {
    const phone = String(req.body?.phone || "").trim();
    if (!phone) return res.status(400).json({ error: "phone required" });
    const data = readJson(dncPath, { phones: [] });
    if (!data.phones.includes(phone)) data.phones.push(phone);
    writeJson(dncPath, data);
    res.json({ ok: true, count: data.phones.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/dnc", (_req, res) => {
  const data = readJson(dncPath, { phones: [] });
  res.json(data);
});

// Simple summary from webhook log
app.get("/calls/summary", (_req, res) => {
  try {
    if (!fs.existsSync(callsLogPath)) return res.json({ totalEvents: 0, byType: {}, avgSatisfaction: null, issues: 0 });
    const lines = fs.readFileSync(callsLogPath, "utf8").split(/\n/).filter(Boolean);
    const byType = {};
    let total = 0; let satSum = 0; let satCount = 0; let issues = 0;
    for (const line of lines) {
      try {
        const evt = JSON.parse(line);
        total++;
        byType[evt.type] = (byType[evt.type] || 0) + 1;
        const s = evt?.data?.analysis?.structured?.satisfied_score || evt?.data?.satisfied_score || evt?.satisfied_score;
        if (typeof s === "number") { satSum += s; satCount++; }
        const hadIssue = evt?.data?.analysis?.structured?.had_issue ?? evt?.data?.had_issue ?? evt?.had_issue;
        if (hadIssue) issues++;
      } catch (_) { /* ignore */ }
    }
    res.json({ totalEvents: total, byType, avgSatisfaction: satCount ? (satSum / satCount) : null, issues });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 🚀 IMPROVEMENT SYSTEM ENDPOINTS
app.get("/improve-agent/status", (req, res) => {
  try {
    const now = new Date();
    const pst = new Date(now.toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
    const nextRun = new Date(pst);
    nextRun.setHours(2, 0, 0, 0);
    
    // If it's already past 2 AM today, next run is tomorrow
    if (pst.getHours() >= 2) {
      nextRun.setDate(nextRun.getDate() + 1);
    }
    
    const timeUntilNext = nextRun.getTime() - pst.getTime();
    
    res.json({
      scheduler_active: true,
      next_run: nextRun.toISOString(),
      next_run_pst: nextRun.toLocaleString("en-US", { timeZone: "America/Los_Angeles" }),
      time_until_next: {
        hours: Math.floor(timeUntilNext / (1000 * 60 * 60)),
        minutes: Math.floor((timeUntilNext % (1000 * 60 * 60)) / (1000 * 60))
      },
      current_time_pst: pst.toISOString(),
      schedule: "Daily at 2:00 AM PST"
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/improve-agent", async (req, res) => {
  try {
    console.log('🔄 Manual improvement trigger requested');
    const result = await runImprovementLoop();
    res.json({ 
      ok: true, 
      message: 'Improvement loop completed',
      result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error in manual improvement:', error);
    res.status(500).json({ 
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// 🧪 Test email endpoint
app.post("/test-improvement-email", async (req, res) => {
  try {
    console.log('📧 Test improvement email requested');
    
    // Import the email function
    const { sendDailyImprovementSummary } = await import('./email-service.js');
    
    const testSummaryData = {
      analysis_date: new Date().toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles' }),
      calls_analyzed: 25,
      success_rate: '72.0',
      improvements_made: true,
      new_sections_added: {
        "VOICEMAIL DETECTION": "Added comprehensive voicemail detection to prevent failed calls",
        "DISCOUNT HANDLING": "Enhanced responses for discount requests with professional guidance"
      },
      priority_fixes: [
        "Implement voicemail detection",
        "Handle discount requests professionally",
        "Improve call success rate"
      ],
      expected_improvement: "15-20% increase in success rate",
      next_analysis_time: new Date(Date.now() + (24 * 60 * 60 * 1000)).toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }),
      status: 'Test email - improvements applied successfully'
    };
    
    const emailResult = await sendDailyImprovementSummary(testSummaryData);
    
    res.json({ 
      ok: true, 
      message: 'Test improvement email sent',
      emailResult,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error sending test email:', error);
    res.status(500).json({ 
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Return the most recent webhook events from our JSONL log
app.get("/calls/recent-log", (req, res) => {
  try {
    const limit = Math.min(Number(req.query?.limit || 25), 200);
    if (!fs.existsSync(callsLogPath)) return res.json({ events: [] });
    const lines = fs.readFileSync(callsLogPath, "utf8").split(/\n/).filter(Boolean);
    const slice = lines.slice(-limit);
    const events = [];
    for (const line of slice) {
      try { events.push(JSON.parse(line)); } catch (_) { /* skip bad line */ }
    }
    res.json({ events });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Abandoned Checkout Recovery Endpoints ---

// Batch process abandoned checkouts
app.post("/call/abandoned-checkout", async (req, res) => {
  try {
    if (!inCallWindow()) {
      return res.status(403).json({ error: "Outside calling window" });
    }
    
    const { hours = 24, minValue = 50, maxCalls = 10 } = req.body || {};
    
    const result = await processAbandonedCheckouts({ hours, minValue, maxCalls });
    
    res.json({
      success: true,
      message: `Processed ${result.processed} abandoned checkouts`,
      ...result
    });
    
  } catch (error) {
    console.error('Abandoned checkout call error:', error);
    res.status(500).json({ 
      error: error.message,
      details: "Failed to process abandoned checkouts"
    });
  }
});

// Individual abandoned checkout call
app.post("/call/abandoned-checkout/single", async (req, res) => {
  try {
    if (!inCallWindow()) {
      return res.status(403).json({ error: "Outside calling window" });
    }
    
    const { checkoutId, phone, customerName, itemsSummary, totalPrice, currency, email } = req.body;
    
    if (!phone || !itemsSummary) {
      return res.status(400).json({ error: "Missing required fields: phone, itemsSummary" });
    }
    
    const result = await placeAbandonedCheckoutCall({
      checkoutId,
      phone,
      customerName: customerName || 'there',
      itemsSummary,
      totalPrice: totalPrice || 0,
      currency: currency || 'USD',
      email
    });
    
    res.json({ success: true, ...result });
    
  } catch (error) {
    console.error('Single abandoned checkout call error:', error);
    res.status(500).json({ 
      error: error.message,
      details: "Failed to place abandoned checkout call"
    });
  }
});

// Helper function to process abandoned checkouts (imported from service)
async function processAbandonedCheckouts({ hours = 24, minValue = 50, maxCalls = 10 } = {}) {
  try {
    console.log('🔄 Processing abandoned checkouts...\n');
    
    const checkouts = await fetchAbandonedCheckouts({ hours, minValue });
    console.log(`Found ${checkouts.length} abandoned checkouts\n`);
    
    if (checkouts.length === 0) {
      console.log('✅ No abandoned checkouts to process');
      return { processed: 0, calls_placed: 0, skipped: 0 };
    }
    
    const results = [];
    let callsPlaced = 0;
    let skipped = 0;
    
    for (const checkout of checkouts.slice(0, maxCalls)) {
      try {
        const formatted = formatCheckoutForCall(checkout);
        
        if (callsPlaced >= maxCalls) {
          console.log(`⏸️ Reached maximum call limit (${maxCalls})`);
          break;
        }
        
        const result = await placeAbandonedCheckoutCall(formatted);
        
        if (result.skipped) {
          skipped++;
          results.push({ ...formatted, result });
        } else {
          callsPlaced++;
          results.push({ ...formatted, result });
        }
        
        // Rate limiting - wait between calls
        await new Promise(resolve => setTimeout(resolve, 2000));
        
      } catch (error) {
        console.error(`❌ Error processing checkout ${checkout.id}:`, error.message);
        results.push({ ...formatCheckoutForCall(checkout), error: error.message });
      }
    }
    
    console.log(`\n📊 Summary:`);
    console.log(`   Total found: ${checkouts.length}`);
    console.log(`   Calls placed: ${callsPlaced}`);
    console.log(`   Skipped: ${skipped}`);
    console.log(`   Errors: ${results.filter(r => r.error).length}`);
    
    return {
      processed: checkouts.length,
      calls_placed: callsPlaced,
      skipped: skipped,
      results
    };
    
  } catch (error) {
    console.error('❌ Error processing abandoned checkouts:', error.message);
    throw error;
  }
}

// Helper function to place individual abandoned checkout calls (imported from service)
async function placeAbandonedCheckoutCall({
  checkoutId,
  phone,
  customerName,
  itemsSummary,
  totalPrice,
  currency = 'USD',
  email = null
}) {
  try {
    // Check if customer has recent successful orders
    const { hasRecentOrders, lastOrderDate } = await checkCustomerHistory(phone, email);
    
    if (hasRecentOrders) {
      console.log(`⚠️ Skipping ${phone} - customer has recent successful orders`);
      return { skipped: true, reason: 'recent_successful_orders', lastOrderDate };
    }
    
    // Format phone number
    const toNumber = phone.startsWith('+') ? phone : `+1${phone.replace(/\D/g, '')}`;
    
    console.log(`📞 Placing Abandoned Checkout Recovery Call`);
    console.log(`==========================================\n`);
    console.log(`To: ${toNumber}`);
    console.log(`Customer: ${customerName}`);
    console.log(`Items: ${itemsSummary}`);
    console.log(`Total: ${currency} ${totalPrice}\n`);
    
    const call = await retell.call.createPhoneCall({
      from_number: RETELL_PHONE_NUMBERS.GRACE_ABANDONED_CHECKOUT,
      to_number: toNumber,
      override_agent_id: GRACE_AGENT_ID, // Grace's agent ID
      
      // Dynamic variables for the abandoned checkout agent
      retell_llm_dynamic_variables: {
        call_direction: 'OUTBOUND',
        customer_name: customerName,
        items_summary: itemsSummary,
        total_price: totalPrice,
        currency: currency,
        checkout_id: checkoutId,
        customer_phone: phone,
        customer_email: email,
        is_abandoned_checkout: true
      },
      
      metadata: {
        source: 'abandoned_checkout_recovery',
        checkout_id: checkoutId,
        customer_phone: phone,
        customer_name: customerName,
        items_summary: itemsSummary,
        total_price: totalPrice,
        currency: currency,
        customer_email: email
      }
    });
    
    console.log('✅ Abandoned checkout recovery call initiated!\n');
    console.log(`Call ID: ${call.call_id}`);
    console.log(`Status: ${call.call_status}\n`);
    
    return { success: true, call_id: call.call_id, call_status: call.call_status };
    
  } catch (error) {
    console.error('❌ Failed to place abandoned checkout call:', error.message);
    throw error;
  }
}

const port = process.env.PORT || 8080;

// 🚀 AUTOMATED IMPROVEMENT SYSTEM
// Runs daily at 2 AM PST to analyze calls and optimize the agent
function startImprovementScheduler() {
  console.log('📅 Starting automated improvement scheduler...');
  
  // Calculate time until next 2 AM PST
  const now = new Date();
  const pst = new Date(now.toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
  const nextRun = new Date(pst);
  nextRun.setHours(2, 0, 0, 0);
  
  // If it's already past 2 AM today, schedule for tomorrow
  if (pst.getHours() >= 2) {
    nextRun.setDate(nextRun.getDate() + 1);
  }
  
  const timeUntilNext = nextRun.getTime() - pst.getTime();
  
  console.log(`⏰ Next improvement run: ${nextRun.toLocaleString("en-US", { timeZone: "America/Los_Angeles" })}`);
  console.log(`   (in ${Math.round(timeUntilNext / (1000 * 60 * 60))} hours and ${Math.round((timeUntilNext % (1000 * 60 * 60)) / (1000 * 60))} minutes)`);
  
  // Schedule the first run
  setTimeout(async () => {
    console.log('🔄 Running scheduled improvement loop...');
    try {
      await runImprovementLoop();
      console.log('✅ Scheduled improvement completed successfully');
    } catch (error) {
      console.error('❌ Error in scheduled improvement:', error);
    }
    
    // Then schedule to run every 24 hours
    setInterval(async () => {
      console.log('🔄 Running scheduled improvement loop...');
      try {
        await runImprovementLoop();
        console.log('✅ Scheduled improvement completed successfully');
      } catch (error) {
        console.error('❌ Error in scheduled improvement:', error);
      }
    }, 24 * 60 * 60 * 1000); // 24 hours in milliseconds
    
  }, timeUntilNext);
}

app.listen(port, () => {
  console.log(`Meatery Retell server listening on :${port}`);
  
  // Start the improvement scheduler
  startImprovementScheduler();
});
