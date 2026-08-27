/**
 * NMCT WhatsApp gateway — Baileys (normal WhatsApp via QR, no Business API, no per-message cost).
 *
 * Endpoints
 *   GET  /status            -> { connected, status }
 *   GET  /qr                -> HTML page with the pairing QR code
 *   POST /send  { to, message }  (Authorization: Bearer <TOKEN>)
 *
 * Outgoing notifications only — incoming admin replies are ignored.
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
import { initDelivery, deliveryReady, deliveryError, handleDeliver } from "./deliver.js";

const TOKEN = process.env.TOKEN || "change-me";
const PORT = process.env.PORT || 3000;
const ADMIN_NUMBER = (process.env.ADMIN_NUMBER || "").replace(/\D/g, "");
const SESSION_DIR = process.env.SESSION_DIR || "/data/session";

const log = pino({ level: "info" });
let sock = null;
let lastQR = "";
let connected = false;
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
    autoDelivery: deliveryReady(),
    autoDeliveryError: deliveryReady() ? "" : deliveryError(),
  }),
);

/** التسليم الفوري للطلبات المدفوعة من الرصيد (يتحقق من هوية المشتري بنفسه). */
app.post("/deliver", auth, (req, res) =>
  handleDeliver(req, res, { send, adminNumber: ADMIN_NUMBER, log }).catch((e) => {
    log.error(e);
    if (!res.headersSent) res.status(500).json({ error: String(e?.message || e) });
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

initDelivery(log);
app.listen(PORT, () => log.info(`HTTP on :${PORT}`));
start().catch((e) => log.error(e));
