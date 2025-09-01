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
    from_number: fromNumber || process.env.RETELL_FROM_NUMBER,
    override_agent_id: agentId || process.env.RETELL_AGENT_ID,
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
            const customerPhone = m.customer_phone || structured.customer_phone || event?.data?.phone;
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
  const { phone, name, orderNumber, agentId, fromNumber, metadata } = req.body || {};
  if (!phone) return res.status(400).json({ error: "phone required" });
  try {
    const r = await placeConfirmationCall({ phone, customerName: name || "there", orderNumber, agentId, fromNumber, metadata });
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
    const { hours = 48, agentId, fromNumber, max_followup_questions, resolution_preference } = req.body || {};
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
          agentId,
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
    
    let orderNumber = retellArgs.order_number ||  // <-- GET IT FROM body.args!
                      params?.order_number || 
                      params?.orderNumber || 
                      req.params?.order_number;
    
    // If still no order number, check if it's in the URL path
    if (!orderNumber && req.url) {
      const urlMatch = req.url.match(/order[_-]?number[=\/](\d+)/i);
      if (urlMatch) orderNumber = urlMatch[1];
    }
    
    // Fallback to a known order for testing
    if (!orderNumber) {
      console.log('WARNING: No order number provided, using fallback 42507');
      orderNumber = '42507';  // Eric J's order that we know exists
    }
    
    const phone = retellArgs.phone || retellArgs.customer_phone || params?.phone || params?.customer_phone;
    
    console.log(`Order context lookup: order=${orderNumber}, phone=${phone}`);
    
    let order = null;
    if (orderNumber) order = await shopifyGetOrderByNumber(orderNumber);
    if (!order && phone) order = await findLatestOrderForPhone(phone);
    if (!order) {
      console.log(`Order not found: ${orderNumber || phone}`);
      return res.status(404).json({ error: "order_not_found", message: "Could not find that order" });
    }
    
    const lineItems = Array.isArray(order.line_items) ? order.line_items : [];
    
    // Create both display and speech versions
    const itemsSummary = lineItems.slice(0, 5).map(li => `${li.quantity}x ${li.title}`).join(", ");
    const itemsForSpeech = lineItems.slice(0, 5).map(li => formatProductForSpeech(li.quantity, li.title)).join(", ");
    
    const primaryItem = lineItems[0]?.title || null;
    const deliveredAt = (order.fulfillments || []).find(f => (f?.shipment_status || "") === "delivered")?.updated_at || null;
    
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
      speak: `Your order contains ${itemsForSpeech}`  // Use conversational format
    };
    
    console.log(`Order found: ${order.name} - ${itemsSummary}`);
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
    const { order_number, satisfied_score, had_issue, issue_notes, preferred_contact, requested_opt_out } = params;
    const order = await shopifyGetOrderByNumber(order_number);
    if (!order?.id) return res.status(404).json({ error: "order_not_found" });
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
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e?.response?.data || e.message });
  }
});

app.post("/flow/request-replacement", async (req, res) => {
  try {
    // Retell sends params in body.args
    const params = req.body?.args || req.body || {};
    const { order_number, item_title, quantity = 1, reason } = params;
    const order = await shopifyGetOrderByNumber(order_number);
    if (!order?.id) return res.status(404).json({ error: "order_not_found" });
    const tag = "replacement-requested";
    const note = `Replacement requested: ${quantity}x ${item_title || "(unspecified)"}${reason ? ` | Reason: ${reason}` : ""}`;
    await shopifyAppendNoteAndTags({ orderId: order.id, noteAppend: note, addTags: [tag] });
    res.json({ ok: true });
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

const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`Meatery Retell server listening on :${port}`));
