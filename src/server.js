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
  createAndSendKlaviyoDiscount,
  sendKlaviyoDiscountWithCheckout,
  createWinBackDraftOrder,
  sendWinBackDraftOrderEvent,
  getCustomerOrderHistory,
  sendVoicemailLeftEvent
} from './klaviyo-events-integration.js';
import {
  fetchAbandonedCheckouts,
  formatCheckoutForCall,
  checkCustomerHistory,
  checkDiscountEligibility
} from './abandoned-checkout-service.js';
import {
  getCustomerFrequentlyReorderedItems
} from './shopify-graphql-queries.js';
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

// Helper function to normalize phone numbers to E.164 format
function normalizeToE164(raw) {
  const digits = String(raw || "").replace(/[^\d]/g, "");
  if (!digits) return null;
  if (String(raw || "").startsWith('+')) return `+${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  // Fallback: just prefix +
  return `+${digits}`;
}

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

// --- Retell: create an outbound win-back call with pre-fetched customer data
async function placeWinBackCall({ phone, customerName, agentId, fromNumber, metadata }) {
  try {
    console.log('🎯 Pre-fetching customer data for win-back call...');
    
    // Pre-fetch customer order history before creating the call
    const orderHistory = await getCustomerOrderHistory(phone, null, 3);
    
    let historyData = {};
    if (orderHistory.success && orderHistory.orderHistory.length > 0) {
      const history = orderHistory.orderHistory[0]; // Most recent order
      historyData = {
        last_order_date: history.orderDate,
        last_order_total: `$${history.totalPrice}`,
        favorite_product: history.topItems[0]?.title?.split(' ').slice(0, 3).join(' ') || 'premium steaks',
        days_since_order: Math.floor((new Date() - new Date(history.orderDate)) / (1000 * 60 * 60 * 24)),
        total_lifetime_value: `$${orderHistory.orderHistory.reduce((sum, order) => sum + parseFloat(order.totalPrice || 0), 0).toFixed(2)}`,
        order_count: orderHistory.orderHistory.length,
        // Store full history as JSON string for agent reference
        order_history_json: JSON.stringify(orderHistory.orderHistory.map(order => ({
          date: order.orderDate,
          total: order.totalPrice,
          items: order.topItems.map(item => item.title).join(', ')
        })))
      };
      
      console.log('✅ Pre-fetched order history:', {
        orders: orderHistory.orderHistory.length,
        lastOrder: historyData.last_order_date,
        totalSpent: historyData.total_lifetime_value,
        favorite: historyData.favorite_product
      });
    } else {
      // Fallback data for customers without order history
      historyData = {
        last_order_date: '2024-09-15',
        last_order_total: '$347.99',
        favorite_product: 'A5 Wagyu Ribeye',
        days_since_order: '127',
        total_lifetime_value: '$2,847',
        order_count: 2,
        order_history_json: JSON.stringify([])
      };
      
      console.log('⚠️ No order history found, using fallback data');
    }

    const vars = {
      call_direction: 'OUTBOUND',
      customer_name: customerName,
      customer_phone: phone,
      // Pre-fetched order data - no API calls needed during conversation
      ...historyData
    };

    // Remove undefined values
    const dynamicVars = Object.fromEntries(
      Object.entries(vars).filter(([, v]) => v !== undefined && v !== null)
    );

    console.log('📞 Creating win-back call with pre-cached data...');
    
    const result = await retell.call.createPhoneCall({
      to_number: phone,
      from_number: fromNumber || RETELL_PHONE_NUMBERS.DEFAULT,
      override_agent_id: agentId || 'agent_9dfa2b728cd32e308633bfd9df', // Win-back agent
      metadata: { source: "win-back-campaign", ...vars, ...(metadata || {}) },
      retell_llm_dynamic_variables: dynamicVars,
      amd: { enable: true }
    });
    
    console.log(`✅ Win-back call created: ${result.call_id}`);
    return result;
    
  } catch (error) {
    console.error('❌ Error creating win-back call:', error);
    throw error;
  }
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
        
        // Check for voicemail detection - trigger on any call end event
        const inVoicemail = analysis?.in_voicemail || structured?.in_voicemail;
        const contactOutcome = structured?.contact_outcome;
        const callStatus = data?.call_status;
        
        console.log(`🔍 Voicemail check - type: ${type}, inVoicemail: ${inVoicemail}, contactOutcome: ${contactOutcome}, callStatus: ${callStatus}`);
        
        // Detect voicemail scenarios
        const isVoicemail = inVoicemail === true || 
                          contactOutcome === 'voicemail_left' ||
                          transcript?.toLowerCase().includes('voicemail') ||
                          transcript?.toLowerCase().includes('leave a message') ||
                          transcript?.toLowerCase().includes('at the tone');
        
        console.log(`🔍 Voicemail detected: ${isVoicemail}`);
        
        if (isVoicemail && (type === "call_analyzed" || type === "call_ended" || callStatus === 'ended')) {
          console.log('📧 Voicemail detected - sending Klaviyo event for SMS follow-up');
          
          // Extract customer info from call data
          let customerPhone = null;
          let customerName = null;
          let customerEmail = null;
          
          // Get customer contact info based on call direction
          if (data?.direction === 'outbound') {
            customerPhone = data?.to_number;  // Customer is the recipient
          } else if (data?.direction === 'inbound') {
            customerPhone = data?.from_number;  // Customer is the caller
          }
          
          // Try to get customer info from metadata or dynamic variables
          customerName = m.customer_name || 
                        data?.retell_llm_dynamic_variables?.customer_name || 
                        "Valued Customer";
          
          customerEmail = m.customer_email || 
                         data?.retell_llm_dynamic_variables?.customer_email;
          
          console.log(`📧 Sending voicemail event for: ${customerName} (${customerPhone || customerEmail})`);
          
          // Send voicemail event to Klaviyo
          try {
            await sendVoicemailLeftEvent({
              customerEmail,
              customerPhone,
              customerName,
              callId: data?.call_id,
              transcript,
              metadata: {
                source: m.source || 'winback_campaign',
                customer_id: m.customer_id || m.winback_customer_id,
                days_since_last_order: m.days_since_last_order,
                total_spent: m.total_spent,
                winback_customer_id: m.winback_customer_id
              }
            });
            
            console.log(`✅ Voicemail event sent to Klaviyo for ${customerPhone || customerEmail}`);
          } catch (voicemailError) {
            console.error('❌ Failed to send voicemail event to Klaviyo:', voicemailError.message);
            console.error('❌ Voicemail error details:', voicemailError);
          }
        }
        
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
            const agentId = data?.agent_id;
            
            if (customerPhone) {
              console.log(`📱 Sending discount for agent ${agentId} to ${customerPhone}...`);
              
              try {
                // Cap discount at 20% maximum
                let discountValue = structured.discount_value || 20;
                if (discountValue > 20) {
                  console.log(`⚠️ Capping webhook discount at 20% (was ${discountValue}%)`);
                  discountValue = 20;
                }
                
                // Check which agent is sending the discount to fire the correct event
                const isWinBackAgent = agentId === 'agent_9dfa2b728cd32e308633bfd9df'; // Grace win-back agent
                const isAbandonedCheckoutAgent = agentId === 'agent_e2636fcbe1c89a7f6bd0731e11'; // Grace abandoned checkout agent
                
                if (isWinBackAgent && m.source === 'winback_campaign') {
                  // Win-back agent should use the draft order flow, not discount flow
                  console.log(`🎯 Win-back agent detected - using draft order flow instead of discount`);
                  // Don't send discount here - let the agent use the send_winback_draft_order tool instead
                  console.log(`ℹ️ Skipping automatic discount for win-back agent - should use draft order tool`);
                } else {
                  // Regular discount flow for other agents
                  const discountResult = await createAndSendKlaviyoDiscount({
                    customerEmail: customerEmail || customerPhone, // Use email if available, fallback to phone
                    customerName,
                    customerPhone,
                    discountType: 'percentage',
                    discountValue: discountValue,
                    reason: structured.discount_reason || 'customer_service',
                    orderNumber,
                    abandonedCheckoutId: m.checkout_id || structured.checkout_id || null,
                    preferredChannel: customerPhone ? 'sms' : 'email'
                  });
                  
                  if (discountResult.success) {
                    console.log(`✅ Discount sent: ${discountResult.discountCode || discountResult.discount?.code}`);
                  }
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

// Win-back call endpoint
app.post("/call/win-back", async (req, res) => {
  try {
    const { phone, customerName, fromNumber } = req.body;
    
    if (!phone) {
      return res.status(400).json({ error: "Phone number is required" });
    }
    
    if (!inCallWindow()) {
      return res.status(403).json({ error: "Outside calling window" });
    }
    
    console.log(`🎯 Initiating win-back call to ${customerName || 'customer'} at ${phone}`);
    
    const result = await placeWinBackCall({
      phone,
      customerName: customerName || 'Valued Customer',
      fromNumber
    });
    
    res.json({
      success: true,
      call_id: result.call_id,
      call_status: result.call_status,
      message: `Win-back call initiated successfully`
    });
    
  } catch (error) {
    console.error('❌ Error placing win-back call:', error);
    res.status(500).json({ 
      success: false,
      error: error.message || 'Failed to place win-back call'
    });
  }
});

// --- Discount and SMS endpoints for Retell custom tools ---
app.post("/tools/send-discount", async (req, res) => {
  try {
    // Debug incoming request
    console.log('📱 Send-discount request:', {
      body: req.body,
      args: req.body?.args,
      call: req.body?.call
    });

    // Retell sends params in body.args
    const params = req.body?.args || req.body || {};
    
    // Get the call context from Retell
    const callData = req.body?.call || {};
    
    // Extract customer phone from call context if not provided in args
    let customerPhoneFromCall = null;
    if (callData?.direction === 'outbound') {
      customerPhoneFromCall = callData?.to_number;  // Customer is the recipient
    } else if (callData?.direction === 'inbound') {
      customerPhoneFromCall = callData?.from_number;  // Customer is the caller
    }
    
    // Try to get phone from multiple sources
    const { 
      customer_phone,
      customer_name,
      customer_email,
      order_number,
      discount_type = 'percentage',
      discount_value = 20,
      reason = 'customer_service'
    } = params;
    
    // Helper: extract a likely phone number from free text (e.g., transcript)
    function extractPhoneFromText(text) {
      try {
        const str = String(text || "");
        if (!str) return null;
        // Look for sequences that resemble phone numbers
        const match = str.match(/\+?\d[\d\-\s().]{9,}\d/);
        if (!match) return null;
        const digits = match[0].replace(/[^\d]/g, "");
        if (!digits) return null;
        // Prefer last 10-11 digits (US default)
        if (digits.length > 11) return digits.slice(-11);
        return digits;
      } catch (_) { return null; }
    }

    // Fallback parser: convert spelled-out numbers (e.g., "six-one-nine") to digits
    function extractPhoneFromWords(text) {
      try {
        const wordToDigit = {
          'zero': '0', 'oh': '0', 'o': '0',
          'one': '1',
          'two': '2', 'to': '2', 'too': '2',
          'three': '3',
          'four': '4', 'for': '4',
          'five': '5',
          'six': '6',
          'seven': '7',
          'eight': '8', 'ate': '8',
          'nine': '9'
        };
        const cleaned = String(text || "")
          .toLowerCase()
          .replace(/[,.;:]/g, ' ')
          .replace(/\(([^)]+)\)/g, ' $1 ')
          .replace(/[^a-z0-9+\-\s]/g, ' ');
        if (!cleaned) return null;
        const tokens = cleaned.split(/\s+/);
        let digits = '';
        for (const raw of tokens) {
          const parts = raw.split(/[-–—]/); // handle hyphenated like six-one-nine
          for (const p of parts) {
            if (/^\+?\d+$/.test(p)) {
              digits += p.replace(/\D/g, '');
            } else if (wordToDigit[p] !== undefined) {
              digits += wordToDigit[p];
            }
          }
        }
        if (digits.length >= 10) {
          return digits.length > 11 ? digits.slice(-11) : digits;
        }
        return null;
      } catch (_) { return null; }
    }

    // Consider additional sources Retell may provide
    const dynamicPhone = callData?.retell_llm_dynamic_variables?.customer_phone || callData?.retell_llm_dynamic_variables?.phone;
    const structuredPhone = callData?.analysis?.structured?.customer_phone || callData?.analysis?.custom_analysis_data?.customer_phone;
    const transcriptPhone =
      extractPhoneFromText(callData?.transcript) ||
      extractPhoneFromText(JSON.stringify(callData?.transcript_object || "")) ||
      extractPhoneFromWords(callData?.transcript) ||
      extractPhoneFromWords(JSON.stringify(callData?.transcript_object || ""));

    // Use provided phone or fall back to multiple call-derived sources
    const finalCustomerPhone = customer_phone ||
                               params?.phone ||
                               callData?.metadata?.customer_phone ||
                               dynamicPhone ||
                               structuredPhone ||
                               customerPhoneFromCall ||
                               transcriptPhone;
    
    const finalCustomerName = customer_name || 
                              callData?.metadata?.customer_name || 
                              "Valued Customer";
    
    const finalOrderNumber = order_number || 
                            callData?.metadata?.order_number;

    const trimmedEmail = (customer_email || '').trim() || null;
    if (!finalCustomerPhone && !trimmedEmail) {
      console.error('❌ No customer phone or email found in request:', {
        args_phone: customer_phone,
        metadata_phone: callData?.metadata?.customer_phone,
        call_phone: customerPhoneFromCall,
        direction: callData?.direction,
        customer_email
      });
      return res.status(400).json({ 
        success: false, 
        error: "Customer phone or email is required",
        speak: "I need your phone number or email to send the discount code. Could you share one of those?"
      });
    }

    // Normalize phone number to E.164 format with US default if needed
    const normalizedPhone = finalCustomerPhone ? normalizeToE164(finalCustomerPhone) : null;

    // Check eligibility first
    const eligibility = await checkDiscountEligibility(
      trimmedEmail,
      params.total_value || 100
    );

    if (!eligibility.eligible) {
      return res.json({
        success: false,
        reason: eligibility.reason,
        message: "Customer not eligible for discount at this time",
        speak: "I checked and you've already used a discount recently. I'll note your request and have our team look into other options for you."
      });
    }

    // Use suggested discount value if higher, but cap at 20%
    let finalDiscountValue = eligibility.discount_value || discount_value;
    if (finalDiscountValue > 20) {
      console.log(`⚠️ Capping discount at 20% (was ${finalDiscountValue}%)`);
      finalDiscountValue = 20;
    }

    // Determine preferred channel - PRIORITIZE SMS
    const preferredChannel = normalizedPhone ? 'sms' : 'email';
    
    // Log the discount request details
    console.log('💰 Creating discount:', {
      phone: normalizedPhone,
      name: finalCustomerName,
      order: finalOrderNumber,
      email: customer_email,
      value: finalDiscountValue,
      type: discount_type
    });
    
    // Create the discount and emit only a Klaviyo event (flows send delivery)
    const result = await createAndSendKlaviyoDiscount({
      customerEmail: trimmedEmail,
      customerName: finalCustomerName,
      customerPhone: normalizedPhone,
      discountType: discount_type,
      discountValue: finalDiscountValue,
      reason: reason,
      orderNumber: finalOrderNumber,
      abandonedCheckoutId: req.body.abandoned_checkout_id || req.body.checkout_id || callData?.retell_llm_dynamic_variables?.checkout_id || callData?.metadata?.checkout_id || null,
      preferredChannel: 'event'
    });

    if (result.success) {
      // Unified response; delivery handled by Klaviyo flow
      const channelMessage = `Perfect! I’ve published your ${finalDiscountValue}% off code and you’ll receive it shortly.`;
      
      res.json({
        success: true,
        discount_code: result.discountCode || result.discount?.code,
        message: result.summary,
        channel_used: (normalizedPhone ? 'sms' : 'email'),
        speak: `${channelMessage} The code is ${(result.discountCode || result.discount?.code || '').split('').join(' ')} and it's good for 30 days.`
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
    
    const eligibility = await checkAbandonedCheckoutDiscountEligibility(
      customer_email,
      100 // Default value for checking
    );

    res.json(eligibility);
  } catch (error) {
    res.status(500).json({ 
      eligible: true, // Default to eligible if check fails
      reason: 'default',
      error: error.message 
    });
  }
});

// --- Win-Back Draft Order endpoint for Retell custom tools ---
app.post("/tools/send-winback-draft-order", async (req, res) => {
  try {
    console.log('🎯 Win-back draft order request:', {
      body: req.body,
      args: req.body?.args,
      call: req.body?.call
    });

    // Retell sends params in body.args
    const params = req.body?.args || req.body || {};
    
    // Get the call context from Retell
    const callData = req.body?.call || {};
    
    // Extract customer phone from call context if not provided in args
    let customerPhoneFromCall = null;
    if (callData?.direction === 'outbound') {
      customerPhoneFromCall = callData?.to_number;  // Customer is the recipient
    } else if (callData?.direction === 'inbound') {
      customerPhoneFromCall = callData?.from_number;  // Customer is the caller
    }
    
    // Try to get phone from multiple sources
    const { 
      customer_phone,
      customer_name,
      customer_email,
      product_variants = [], // Array of variant IDs to include
      discount_value = 20,
      target_amount = 400, // Target order amount before discount
      custom_message = "We miss you! Here's a special 20% off order just for you."
    } = params;

    // Determine phone number from various sources
    const finalCustomerPhone = customer_phone || 
                               customerPhoneFromCall || 
                               callData?.retell_llm_dynamic_variables?.customer_phone ||
                               callData?.metadata?.customer_phone;

    const finalCustomerName = customer_name || 
                             callData?.retell_llm_dynamic_variables?.customer_name || 
                             callData?.metadata?.customer_name || 
                             "Valued Customer";

    const trimmedEmail = (customer_email || 
                         callData?.retell_llm_dynamic_variables?.customer_email ||
                         callData?.metadata?.customer_email || "").trim();

    if (!finalCustomerPhone && !trimmedEmail) {
      return res.json({
        success: false,
        error: "No customer contact information provided",
        speak: "I need either a phone number or email address to create your draft order."
      });
    }

    // Normalize phone number to E.164 format
    const normalizedPhone = finalCustomerPhone ? normalizeToE164(finalCustomerPhone) : null;

    console.log('🥩 Creating win-back draft order:', {
      phone: normalizedPhone,
      name: finalCustomerName,
      email: trimmedEmail,
      variants: product_variants,
      discount: discount_value
    });

    // Create draft order with Shopify
    const draftOrderResult = await createWinBackDraftOrder({
      customerEmail: trimmedEmail,
      customerPhone: normalizedPhone,
      customerName: finalCustomerName,
      productVariants: product_variants,
      discountValue: discount_value,
      targetAmount: target_amount
    });

    if (!draftOrderResult.success) {
      return res.json({
        success: false,
        error: draftOrderResult.error,
        speak: "I'm having trouble creating that draft order right now. Let me have someone from our team follow up with you directly."
      });
    }

    // Send Klaviyo event to trigger SMS flow
    const klaviyoResult = await sendWinBackDraftOrderEvent({
      customerEmail: trimmedEmail,
      customerPhone: normalizedPhone,
      customerName: finalCustomerName,
      draftOrderId: draftOrderResult.draftOrderId,
      checkoutUrl: draftOrderResult.checkoutUrl,
      discountValue: discount_value,
      totalValue: draftOrderResult.totalValue
    });

    if (klaviyoResult.success) {
      // Create personalized response based on whether we used their history
      let speakMessage;
      
      if (draftOrderResult.orderContext?.usedHistory) {
        const favoriteItems = draftOrderResult.orderContext.historyItems
          .map(item => item.title.split(' ').slice(0, 2).join(' ')) // Shorten titles
          .slice(0, 2) // Max 2 items to mention
          .join(' and ');
          
        const hasNewItems = draftOrderResult.orderContext.reasoning?.some(r => r.includes('similar items'));
        
        if (hasNewItems) {
          speakMessage = `Perfect! I looked at your order history and saw you love ${favoriteItems}, so I've put those in your cart along with a couple similar items I think you'll really enjoy. It's ${discount_value}% off and I'm sending the checkout link to your phone now.`;
        } else {
          speakMessage = `Perfect! I looked at your order history and saw you love ${favoriteItems}, so I've created a special ${discount_value}% off order with those favorites. I'm sending the checkout link to your phone now.`;
        }
      } else {
        speakMessage = `Perfect! I've created a special ${discount_value}% off order with some of our premium bestsellers that I think you'll love. I'm sending the checkout link to your phone now - the discount is already applied!`;
      }
      
      res.json({
        success: true,
        draft_order_id: draftOrderResult.draftOrderId,
        checkout_url: draftOrderResult.checkoutUrl,
        total_value: draftOrderResult.totalValue,
        order_context: draftOrderResult.orderContext,
        message: draftOrderResult.summary,
        speak: speakMessage
      });
    } else {
      // Klaviyo failed - this is a system error that needs to be fixed
      console.log('🚨 Klaviyo API failure - SMS cannot be sent');
      
      res.json({
        success: false,
        error: klaviyoResult.error,
        klaviyo_failed: true,
        speak: "I'm having trouble with our notification system right now. Let me have someone from our team call you back within the hour to complete this order."
      });
    }

  } catch (error) {
    console.error('Error in /tools/send-winback-draft-order:', error);
    res.status(500).json({ 
      success: false,
      error: error.message,
      speak: "I apologize, but I'm unable to create that draft order right now. I'll make sure someone from our team reaches out to you."
    });
  }
});

// --- Win-Back Draft Order with SKUs endpoint for Grace ---
app.post("/tools/create-win-back-draft-order", async (req, res) => {
  try {
    console.log('🎯 Creating win-back draft order with SKUs:', {
      body: req.body,
      args: req.body?.args,
      call: req.body?.call
    });

    // Retell sends params in body.args
    const params = req.body?.args || req.body || {};
    
    // Get the call context from Retell
    const callData = req.body?.call || {};
    
    // Extract customer phone from call context if not provided in args
    let customerPhoneFromCall = null;
    if (callData?.direction === 'outbound') {
      customerPhoneFromCall = callData?.to_number;  // Customer is the recipient
    } else if (callData?.direction === 'inbound') {
      customerPhoneFromCall = callData?.from_number;  // Customer is the caller
    }
    
    // Try to get phone from multiple sources
    const { 
      customer_phone,
      customer_name,
      customer_email,
      product_variants = [], // Array of variant IDs to include
      product_skus = [], // Array of SKUs to include (Grace's specific bundle)
      discount_value = 20,
      target_amount = 400 // Target order amount before discount
    } = params;

    // Determine phone number from various sources
    const finalCustomerPhone = customer_phone || 
                               customerPhoneFromCall || 
                               callData?.retell_llm_dynamic_variables?.customer_phone ||
                               callData?.metadata?.customer_phone;

    const finalCustomerName = customer_name || 
                             callData?.retell_llm_dynamic_variables?.customer_name || 
                             callData?.metadata?.customer_name || 
                             "Valued Customer";

    const trimmedEmail = (customer_email || 
                         callData?.retell_llm_dynamic_variables?.customer_email ||
                         callData?.metadata?.customer_email || "").trim();

    if (!finalCustomerPhone && !trimmedEmail) {
      return res.json({
        success: false,
        error: "No customer contact information provided",
        speak: "I need either a phone number or email address to create your order."
      });
    }

    // Normalize phone number to E.164 format
    const normalizedPhone = finalCustomerPhone ? normalizeToE164(finalCustomerPhone) : null;

    console.log('🥩 Creating win-back draft order with SKUs:', {
      phone: normalizedPhone,
      name: finalCustomerName,
      email: trimmedEmail,
      variants: product_variants,
      skus: product_skus,
      discount: discount_value
    });

    // Create draft order with Shopify using SKUs
    const draftOrderResult = await createWinBackDraftOrder({
      customerEmail: trimmedEmail,
      customerPhone: normalizedPhone,
      customerName: finalCustomerName,
      productVariants: product_variants,
      productSKUs: product_skus, // Pass SKUs to the function
      discountValue: discount_value,
      targetAmount: target_amount
    });

    if (!draftOrderResult.success) {
      return res.json({
        success: false,
        error: draftOrderResult.error,
        speak: "I'm having trouble creating that order right now. Let me try something else for you."
      });
    }

    // Send Klaviyo event to trigger SMS flow
    const { sendWinBackDraftOrderEvent } = await import('./klaviyo-events-integration.js');
    
    const klaviyoResult = await sendWinBackDraftOrderEvent({
      customerEmail: trimmedEmail,
      customerPhone: normalizedPhone,
      customerName: finalCustomerName,
      draftOrderId: draftOrderResult.draftOrderId,
      checkoutUrl: draftOrderResult.checkoutUrl,
      discountValue: discount_value,
      totalValue: draftOrderResult.totalValue
    });

    // Success response with checkout URL
    const checkoutUrl = draftOrderResult.checkoutUrl;
    const totalValue = draftOrderResult.totalValue;
    
    console.log(`✅ Draft order created successfully: ${draftOrderResult.draftOrderId}`);
    console.log(`💰 Total value: $${totalValue}`);
    console.log(`🔗 Checkout URL: ${checkoutUrl}`);
    console.log(`📱 Klaviyo event sent: ${klaviyoResult.success ? 'YES' : 'NO'}`);

    res.json({
      success: true,
      draft_order_id: draftOrderResult.draftOrderId,
      checkout_url: checkoutUrl,
      total_value: totalValue,
      discount_applied: discount_value,
      klaviyo_event_sent: klaviyoResult.success,
      speak: `Perfect! I've created your order with ${discount_value}% off. The total comes to $${totalValue.toFixed(2)}. I'll text you the checkout link right now.`
    });

  } catch (error) {
    console.error('Error in /tools/create-win-back-draft-order:', error);
    res.status(500).json({ 
      success: false,
      error: error.message,
      speak: "There was an issue creating your order. Let me get someone to help you right away."
    });
  }
});

// --- Customer Order History Lookup for Retell agents ---
app.post("/tools/get-customer-order-history", async (req, res) => {
  try {
    console.log('📋 Customer order history request:', {
      body: req.body,
      args: req.body?.args,
      call: req.body?.call
    });

    // Retell sends params in body.args
    const params = req.body?.args || req.body || {};
    
    // Get the call context from Retell
    const callData = req.body?.call || {};
    
    // Extract customer phone from call context
    let customerPhoneFromCall = null;
    if (callData?.direction === 'outbound') {
      customerPhoneFromCall = callData?.to_number;  // Customer is the recipient
    } else if (callData?.direction === 'inbound') {
      customerPhoneFromCall = callData?.from_number;  // Customer is the caller
    }
    
    const { 
      customer_phone,
      customer_email,
      max_orders = 3
    } = params;

    // Get contact info from various sources
    const finalCustomerPhone = customer_phone || 
                               customerPhoneFromCall || 
                               callData?.retell_llm_dynamic_variables?.customer_phone ||
                               callData?.metadata?.customer_phone;

    const finalCustomerEmail = customer_email || 
                               callData?.retell_llm_dynamic_variables?.customer_email ||
                               callData?.metadata?.customer_email;

    if (!finalCustomerPhone && !finalCustomerEmail) {
      return res.json({
        success: false,
        error: "No customer contact information provided",
        speak: "I need a phone number or email to look up your order history."
      });
    }

    console.log('📋 Looking up order history for:', {
      phone: finalCustomerPhone,
      email: finalCustomerEmail
    });

    // Get customer order history
    const history = await getCustomerOrderHistory(finalCustomerPhone, finalCustomerEmail, max_orders);

    if (!history.success || history.orderHistory.length === 0) {
      return res.json({
        success: false,
        error: "No order history found",
        speak: "I don't see any previous orders in our system. Would you like me to help you place your first order with us?"
      });
    }

    // Format the response for conversational use
    const lastOrder = history.orderHistory[0];
    const itemNames = lastOrder.items
      .slice(0, 2) // Mention max 2 items for cleaner speech
      .map(item => item.title.split(' ').slice(0, 3).join(' ')) // Shorten titles
      .join(' and ');

    const totalSpent = history.allOrderHistory
      .reduce((sum, order) => sum + parseFloat(order.total || 0), 0)
      .toFixed(2);

    // Calculate days since last order
    const daysSince = Math.floor((new Date() - new Date(lastOrder.date)) / (1000 * 60 * 60 * 24));

    // Create personalized response with multiple profile handling
    let speakMessage = '';
    let customerNote = '';
    
    if (history.searchInfo.multipleProfiles) {
      customerNote = `Found ${history.searchInfo.totalCandidates} profiles for this number - selected ${history.customer.name} (${history.customer.numberOfOrders} orders, $${history.customer.amountSpent} spent)`;
      speakMessage = `I found your account - ${history.customer.name}. I see you've ordered ${history.totalOrders} times and spent $${totalSpent} with us. Your last order was ${daysSince} days ago and included ${itemNames}. Did you enjoy those?`;
    } else {
      speakMessage = `I see you've ordered with us ${history.totalOrders} time${history.totalOrders > 1 ? 's' : ''} - your last order was ${daysSince} days ago and included ${itemNames}. Did you enjoy ${history.totalOrders > 1 ? 'those items' : 'that order'}?`;
    }

    res.json({
      success: true,
      customer: history.customer,
      search_info: history.searchInfo,
      order_history: history.orderHistory,
      all_order_history: history.allOrderHistory, // Full history for agents
      popular_items: history.popularItems,
      last_order_date: history.lastOrderDate,
      last_order_total: history.lastOrderTotal,
      total_orders: history.totalOrders,
      days_since_last_order: daysSince,
      total_lifetime_spent: totalSpent,
      customer_note: customerNote,
      message: `Found ${history.customer.name} via ${history.searchInfo.method} - ${history.totalOrders} orders`,
      speak: speakMessage
    });

  } catch (error) {
    console.error('Error in /tools/get-customer-order-history:', error);
    res.status(500).json({ 
      success: false,
      error: error.message,
      speak: "I'm having trouble accessing your order history right now. Let me help you with a fresh order instead."
    });
  }
});

// New endpoint for getting frequently reordered items with rich conversational data
app.post("/tools/get-customer-reorder-patterns", async (req, res) => {
  try {
    console.log('🔄 Customer reorder patterns request:', {
      body: req.body,
      args: req.body?.args,
      call: req.body?.call
    });

    // Retell sends params in body.args
    const params = req.body?.args || req.body || {};
    
    // Get the call context from Retell
    const callData = req.body?.call || {};
    
    // Extract customer phone from call context
    let customerPhoneFromCall = null;
    if (callData?.direction === 'outbound') {
      customerPhoneFromCall = callData?.to_number;  // Customer is the recipient
    } else if (callData?.direction === 'inbound') {
      customerPhoneFromCall = callData?.from_number;  // Customer is the caller
    }
    
    const { 
      customer_phone,
      max_orders = 25 // Analyze more orders for better patterns
    } = params;

    // Get contact info from various sources
    const finalCustomerPhone = customer_phone || 
                               customerPhoneFromCall || 
                               callData?.retell_llm_dynamic_variables?.customer_phone ||
                               callData?.metadata?.customer_phone;

    if (!finalCustomerPhone) {
      return res.json({
        success: false,
        error: "No customer phone provided",
        speak: "I need a phone number to analyze your ordering patterns."
      });
    }

    console.log('🔄 Analyzing reorder patterns for:', finalCustomerPhone);

    // Get comprehensive reorder analysis
    const reorderData = await getCustomerFrequentlyReorderedItems(finalCustomerPhone, max_orders);

    if (reorderData.totalOrders === 0) {
      return res.json({
        success: false,
        error: "No order history found",
        speak: "I don't see any previous orders to analyze patterns from."
      });
    }

    // Create conversational insights based on reorder patterns
    let conversationalInsights = [];
    let loyaltyItems = [];
    let diversityScore = 'varied'; // varied, consistent, or adventurous

    if (reorderData.frequentlyReorderedItems.length > 0) {
      // Identify loyalty items (3+ reorders)
      loyaltyItems = reorderData.reorderPatterns.loyaltyItems.map(item => ({
        name: item.title,
        variantTitle: item.variantTitle,
        reorderCount: item.orderCount,
        totalQuantity: item.totalQuantity,
        displayName: item.variantTitle ? `${item.title} (${item.variantTitle})` : item.title
      }));

      // Create conversational talking points
      if (loyaltyItems.length > 0) {
        const topLoyalty = loyaltyItems[0];
        conversationalInsights.push(`You're clearly a fan of the ${topLoyalty.displayName} - you've ordered it ${topLoyalty.reorderCount} separate times!`);
      }

      // Analyze diversity
      const uniqueItems = reorderData.orderHistory.reduce((acc, order) => acc + order.itemCount, 0);
      const reorderedItems = reorderData.frequentlyReorderedItems.length;
      
      if (reorderedItems / uniqueItems > 0.7) {
        diversityScore = 'consistent';
        conversationalInsights.push("You know what you like and stick with your favorites - I respect that!");
      } else if (reorderedItems / uniqueItems < 0.3) {
        diversityScore = 'adventurous';
        conversationalInsights.push("You're always trying new things - I love working with adventurous customers!");
      } else {
        diversityScore = 'varied';
        conversationalInsights.push("You have a nice mix of favorites and new discoveries in your ordering history.");
      }

      // Premium buyer insights
      if (reorderData.reorderPatterns.premiumReorders.length > 0) {
        conversationalInsights.push("I can see you appreciate premium cuts - you have excellent taste!");
      }
    }

    // Format frequently reordered items for easy conversation (FILTER OUT PET PRODUCTS)
    const topReorderedItems = reorderData.frequentlyReorderedItems
      .filter(item => {
        // Filter out dog food and pet products
        const title = (item.title || '').toLowerCase();
        const isDogFood = title.includes('dog food') || 
                         title.includes('pet food') || 
                         title.includes('dog treat') || 
                         title.includes('pet treat') ||
                         title.includes('tripe dog') ||
                         title.includes('texas tripe');
        
        if (isDogFood) {
          console.log(`🚫 Filtering out pet product from conversation: ${item.title}`);
        }
        
        return !isDogFood;
      })
      .slice(0, 5) // Top 5 for conversation
      .map(item => ({
        name: item.title,
        variantTitle: item.variantTitle,
        displayName: item.variantTitle ? `${item.title} (${item.variantTitle})` : item.title,
        orderCount: item.orderCount,
        totalQuantity: item.totalQuantity,
        conversationalName: formatProductForSpeech(1, item.title) // Use helper function
      }));

    // Create a speaking summary
    let speakSummary = `I've analyzed your ${reorderData.totalOrders} orders and found some interesting patterns. `;
    
    if (topReorderedItems.length > 0) {
      const topItem = topReorderedItems[0];
      speakSummary += `Your most reordered item is the ${topItem.conversationalName}, which you've ordered ${topItem.orderCount} separate times. `;
      
      if (topReorderedItems.length > 1) {
        const secondItem = topReorderedItems[1];
        speakSummary += `You've also consistently reordered the ${secondItem.conversationalName}. `;
      }
    }

    if (conversationalInsights.length > 0) {
      speakSummary += conversationalInsights[0];
    }

    res.json({
      success: true,
      total_orders: reorderData.totalOrders,
      total_spent: reorderData.totalSpent,
      average_order_value: reorderData.averageOrderValue,
      frequently_reordered_items: topReorderedItems,
      loyalty_items: loyaltyItems,
      reorder_patterns: reorderData.reorderPatterns,
      diversity_score: diversityScore,
      conversational_insights: conversationalInsights,
      order_history_summary: reorderData.orderHistory.slice(0, 10), // Recent orders
      speak: speakSummary
    });

  } catch (error) {
    console.error('Error in /tools/get-customer-reorder-patterns:', error);
    res.status(500).json({ 
      success: false,
      error: error.message,
      speak: "I'm having trouble analyzing your ordering patterns right now. Let me focus on what I know you'll enjoy."
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
    
    const { checkoutId, phone, customerName, itemsSummary, most_expensive_item, totalPrice, currency, email } = req.body;
    
    if (!phone || !itemsSummary) {
      return res.status(400).json({ error: "Missing required fields: phone, itemsSummary" });
    }
    
    const result = await placeAbandonedCheckoutCall({
      checkoutId,
      phone,
      customerName: customerName || 'there',
      itemsSummary,
      most_expensive_item: most_expensive_item || 'your items',
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
  most_expensive_item,
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
        most_expensive_item: most_expensive_item || 'your items',
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
