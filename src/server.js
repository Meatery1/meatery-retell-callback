import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import { Retell } from "retell-sdk";
import axios from "axios";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: "2mb" }));
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
    fields: "id,order_number,customer,phone,shipping_address,current_total_price,created_at,closed_at,fulfillments,fulfillment_status,source_name,tags,note"
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
    return [{
      order_id: o.id,
      order_number: o.order_number,
      phone,
      name: [o?.customer?.first_name, o?.customer?.last_name].filter(Boolean).join(" ") || "there",
      total: o.current_total_price,
      created_at: o.created_at,
      tags: (o.tags || "")
    }];
  });
}

// --- Retell: create an outbound phone call
async function placeConfirmationCall({ phone, customerName, orderNumber, agentId, fromNumberId, metadata }) {
  /*
    Minimal payload using Retell "Create Phone Call" API via SDK.
    The number must be bound to an outbound agent in Retell dashboard.
  */
  const vars = {
    customer_name: customerName,
    order_number: orderNumber
  };

  const result = await retell.calls.createPhoneCall({
    // Required
    to_number: phone,
    from_number_id: fromNumberId || process.env.RETELL_NUMBER_ID,
    agent_id: agentId || process.env.RETELL_AGENT_ID,
    // Optional runtime variables
    metadata: { source: "meatery-post-delivery", ...vars, ...(metadata || {}) },
    // Call config overrides for this call only
    amd: { enable: true }, // answering machine detection
  });
  return result;
}

// --- Routes ---
app.get("/health", (req, res) => res.json({ ok: true }));

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
        const r = await placeConfirmationCall({ phone: c.phone, customerName: c.name, orderNumber: c.order_number });
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
    // Optional: verify signature using RETELL_WEBHOOK_SECRET if provided by SDK in future; for now just parse
    const event = JSON.parse(req.body.toString());
    console.log("Retell Webhook:", event.type, event?.data?.call_id);
    try { appendJsonl(callsLogPath, { received_at: new Date().toISOString(), ...event }); } catch (_) {}
    res.status(200).send("ok");
  } catch (e) {
    console.error("Webhook parse error", e);
    res.status(400).send("bad-request");
  }
});

// Simple in-memory test endpoint to place a single call
app.post("/call", async (req, res) => {
  const { phone, name, orderNumber, agentId, fromNumberId, metadata } = req.body || {};
  if (!phone) return res.status(400).json({ error: "phone required" });
  try {
    const r = await placeConfirmationCall({ phone, customerName: name || "there", orderNumber, agentId, fromNumberId, metadata });
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

// Batch call with optional overrides
app.post("/call/batch", async (req, res) => {
  try {
    const { hours = 48, agentId, fromNumberId } = req.body || {};
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
        const r = await placeConfirmationCall({ phone: c.phone, customerName: c.name, orderNumber: c.order_number, agentId, fromNumberId });
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

const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`Meatery Retell server listening on :${port}`));
