/**
 * NMCT WhatsApp gateway — Baileys (normal WhatsApp via QR, no Business API, no per-message cost).
 *
 * Endpoints
 *   GET  /status            -> { connected, status }
 *   GET  /qr                -> HTML page with the pairing QR code
 *   POST /send  { to, message }  (Authorization: Bearer <TOKEN>)
 *
 * Also listens to incoming messages: replying "قبول <رقم الطلب>" / "رفض <رقم الطلب>"
 * (or just "قبول" / "رفض" to answer the last order sent to you) updates the order
 * in Firebase Realtime Database and delivers the digital codes to the customer.
 */
import express from "express";
import pino from "pino";
import { rm } from "node:fs/promises";
import qrcode from "qrcode";
import {
  default as makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
} from "@whiskeysockets/baileys";

const TOKEN = process.env.TOKEN || "change-me";
const PORT = process.env.PORT || 3000;
const DB_URL = (process.env.FIREBASE_DB_URL || "").replace(/\/$/, "");
const ADMIN_NUMBER = (process.env.ADMIN_NUMBER || "").replace(/\D/g, "");
const SESSION_DIR = process.env.SESSION_DIR || "/data/session";

const log = pino({ level: "info" });
let sock = null;
let lastQR = "";
let connected = false;
/** last order announced to the admin, so a bare "قبول" still works */
let lastOrderNo = "";

const jid = (n) => `${String(n).replace(/\D/g, "")}@s.whatsapp.net`;

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
  const { version } = await fetchLatestBaileysVersion();
  sock = makeWASocket({ version, auth: state, logger: pino({ level: "silent" }) });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (u) => {
    if (u.qr) lastQR = u.qr;
    if (u.connection === "open") {
      connected = true;
      lastQR = "";
      log.info("WhatsApp connected");
    }
    if (u.connection === "close") {
      connected = false;
      const code = u.lastDisconnect?.error?.output?.statusCode;
      log.warn({ code }, "connection closed");
      if (code !== DisconnectReason.loggedOut) setTimeout(start, 3000);
    }
  });

  sock.ev.on("messages.upsert", async ({ messages }) => {
    for (const m of messages) {
      if (m.key.fromMe || !m.message) continue;
      const from = (m.key.remoteJid || "").split("@")[0];
      if (ADMIN_NUMBER && !from.endsWith(ADMIN_NUMBER.slice(-8))) continue;
      const text = (
        m.message.conversation ||
        m.message.extendedTextMessage?.text ||
        ""
      ).trim();
      await handleAdminReply(text, m.key.remoteJid);
    }
  });
}

/* ------------------------- Firebase REST helpers ------------------------- */
const fb = {
  async get(path) {
    const r = await fetch(`${DB_URL}/${path}.json`);
    return r.ok ? await r.json() : null;
  },
  async patch(path, body) {
    await fetch(`${DB_URL}/${path}.json`, { method: "PATCH", body: JSON.stringify(body) });
  },
};

async function findOrderByNo(orderNo) {
  const orders = (await fb.get("orders")) || {};
  const wanted = String(orderNo).replace(/\D/g, "");
  for (const [id, o] of Object.entries(orders)) {
    const no = String(o.orderNo ?? o.number ?? id).replace(/\D/g, "");
    if (no && wanted && no.endsWith(wanted)) return { id, ...o };
  }
  return null;
}

/** Pull one code per unit, decrement stock, mark order accepted. */
async function fulfill(order) {
  const delivered = [];
  for (const item of order.items || []) {
    const qty = Math.max(1, Number(item.qty) || 1);
    const product = await fb.get(`products/${item.id}`);
    if (!product) continue;
    const update = {
      stock: Math.max(0, (Number(product.stock) || 0) - qty),
      soldCount: (Number(product.soldCount) || 0) + qty,
    };
    if (product.digital) {
      const pool = Array.isArray(product.codes) ? [...product.codes] : [];
      for (let i = 0; i < qty; i++) {
        const code = pool.shift();
        if (!code) break;
        delivered.push({ productId: item.id, productName: item.name, code });
      }
      update.codes = pool;
      update.stock = pool.length;
    }
    await fb.patch(`products/${item.id}`, update);
  }
  await fb.patch(`orders/${order.id}`, {
    status: "accepted",
    accepted: true,
    updatedAt: Date.now(),
    ...(delivered.length ? { deliveredCodes: delivered, deliveredAt: Date.now() } : {}),
  });
  return delivered;
}

async function handleAdminReply(text, adminJid) {
  const accept = /^(قبول|قبل|accept|ok)\b/i.test(text);
  const reject = /^(رفض|رفض الطلب|reject|no)\b/i.test(text);
  if (!accept && !reject) return;

  const num = (text.match(/\d{3,}/) || [])[0] || lastOrderNo;
  if (!num) return void send(adminJid, "أرسل: قبول <رقم الطلب> أو رفض <رقم الطلب>");

  const order = await findOrderByNo(num);
  if (!order) return void send(adminJid, `لم أجد طلباً بالرقم ${num}`);

  if (accept) {
    const codes = await fulfill(order);
    if (order.phone) {
      const body = codes.length
        ? [`✅ تم قبول طلبك رقم #${num}`, "", ...codes.map((c) => `• ${c.productName}: ${c.code}`), "", "شكراً لثقتك بـ NMCT 💚"]
        : [`✅ تم قبول طلبك رقم #${num}`, "سيتم التواصل معك لإتمام التسليم.", "", "NMCT 💚"];
      await send(jid(order.phone), body.join("\n"));
    }
    await send(adminJid, `تم قبول الطلب #${num}${codes.length ? ` وإرسال ${codes.length} كود للعميل` : ""} ✅`);
  } else {
    await fb.patch(`orders/${order.id}`, {
      status: "rejected",
      rejected: true,
      updatedAt: Date.now(),
    });
    if (order.phone) await send(jid(order.phone), `❌ نعتذر، تم رفض طلبك رقم #${num}. للاستفسار راسلنا.`);
    await send(adminJid, `تم رفض الطلب #${num} ❌`);
  }
}

async function send(to, message) {
  if (!sock || !connected) throw new Error("not connected");
  await sock.sendMessage(to.includes("@") ? to : jid(to), { text: message });
}

/* --------------------------------- HTTP --------------------------------- */
const app = express();
app.use(express.json({ limit: "1mb" }));
app.use((_, res, next) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  next();
});
app.options("*", (_, res) => res.sendStatus(204));

const auth = (req, res, next) =>
  req.headers.authorization === `Bearer ${TOKEN}` ? next() : res.status(401).json({ error: "unauthorized" });

app.get("/status", (req, res) =>
  res.json({
    connected,
    status: connected ? "connected" : lastQR ? "waiting-qr" : "connecting",
    qr: connected ? "" : lastQR,
  }),
);

app.get("/qr", async (_, res) => {
  if (connected) return res.send("<h2 style='font-family:sans-serif'>✅ متصل بالفعل</h2>");
  if (!lastQR) return res.send("<h2 style='font-family:sans-serif'>جاري التحضير… حدّث الصفحة</h2>");
  const img = await qrcode.toDataURL(lastQR);
  res.send(`<body style="background:#0b0b0b;color:#b6ff3a;text-align:center;font-family:sans-serif">
    <h2>امسح الكود من واتساب › الأجهزة المرتبطة</h2><img src="${img}" width="320"/>
    <p>تتحدث الصفحة تلقائياً</p><script>setTimeout(()=>location.reload(),15000)</script></body>`);
});

/** Reconnects the socket while keeping the paired session. */
app.post("/restart", auth, async (_, res) => {
  try {
    try {
      sock?.end?.(new Error("restart"));
    } catch {}
    connected = false;
    lastQR = "";
    await start();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

/** Drops the pairing so a fresh QR is generated. */
app.post("/logout", auth, async (_, res) => {
  try {
    try {
      await sock?.logout();
    } catch {}
    await rm(SESSION_DIR, { recursive: true, force: true });
    connected = false;
    lastQR = "";
    setTimeout(() => start().catch((e) => log.error(e)), 500);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});


app.post("/send", auth, async (req, res) => {
  const { to, message } = req.body || {};
  if (!to || !message) return res.status(400).json({ error: "to and message are required" });
  try {
    await send(String(to), String(message));
    res.json({ ok: true });
  } catch (e) {
    res.status(503).json({ error: String(e.message || e) });
  }
});

app.listen(PORT, () => log.info(`HTTP on :${PORT}`));
start().catch((e) => log.error(e));
