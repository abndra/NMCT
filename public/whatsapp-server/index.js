/**
 * NMCT WhatsApp gateway + التسليم الفوري — ملف واحد مستقل تماماً (single file).
 * =============================================================================
 * لا يستورد أي ملف محلي (لا deliver.js ولا غيره) لكي لا يفشل النشر أبداً،
 * ولا يحتاج مفتاح Service Account: يتعامل مع Firebase عبر REST باستخدام
 * «سر قاعدة البيانات» (Database secret) + مفتاح الويب للتحقق من هوية المستخدم.
 *
 * Endpoints
 *   GET  /status                       -> { connected, status, autoDelivery }
 *   GET  /qr                           -> صفحة QR للربط
 *   POST /send    { to, message }      (Authorization: Bearer <TOKEN>)
 *   POST /deliver { idToken, orderId } (Authorization: Bearer <TOKEN>)
 *   POST /restart | POST /logout       (Authorization: Bearer <TOKEN>)
 *
 * متغيرات Railway:
 *   TOKEN               كلمة سر تخترعها (نفسها في لوحة تحكم الموقع)
 *   ADMIN_NUMBER        رقمك بصيغة دولية بدون + (مثال 9689xxxxxxx)
 *   SESSION_DIR         /data/session   (مع Volume على /data)
 *   FIREBASE_DB_SECRET  سر قاعدة البيانات (Project settings › Service accounts › Database secrets)
 *   FIREBASE_DB_URL     (اختياري — القيمة الافتراضية مضبوطة مسبقاً)
 *   FIREBASE_API_KEY    (اختياري — مفتاح الويب، مضبوط مسبقاً)
 *   STORE_NAME          (اختياري)
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
const ADMIN_NUMBER = (process.env.ADMIN_NUMBER || "").replace(/\D/g, "");
const SESSION_DIR = process.env.SESSION_DIR || "/data/session";
const STORE_NAME = process.env.STORE_NAME || "NMCT";

const DB_URL = (process.env.FIREBASE_DB_URL || "https://nmct-4d2a9-default-rtdb.firebaseio.com").replace(/\/$/, "");
const DB_SECRET = process.env.FIREBASE_DB_SECRET || "";
const API_KEY = process.env.FIREBASE_API_KEY || "AIzaSyB0AOQwMAblWOcw-xYeMvTXwrdm3aoFlC4";

const log = pino({ level: "info" });
let sock = null;
let lastQR = "";
let connected = false;
const jid = (n) => `${String(n).replace(/\D/g, "")}@s.whatsapp.net`;

/* ------------------------------- WhatsApp ------------------------------- */
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

/* --------------------- Firebase REST (بدون Admin SDK) -------------------- */
const deliveryReady = () => Boolean(DB_SECRET && DB_URL);
const deliveryError = () =>
  !DB_SECRET ? "FIREBASE_DB_SECRET not set" : !DB_URL ? "FIREBASE_DB_URL not set" : "";

const dbUrl = (path, params = "") =>
  `${DB_URL}/${String(path).replace(/^\/+/, "")}.json?auth=${encodeURIComponent(DB_SECRET)}${params}`;

async function dbGet(path) {
  const r = await fetch(dbUrl(path));
  if (!r.ok) throw new Error(`GET ${path} -> ${r.status} ${await r.text()}`);
  return r.json();
}
async function dbPatch(path, value) {
  const r = await fetch(dbUrl(path), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value),
  });
  if (!r.ok) throw new Error(`PATCH ${path} -> ${r.status} ${await r.text()}`);
  return r.json();
}
/** قراءة مع ETag لتنفيذ كتابة شرطية (compare-and-set) بديلاً عن المعاملة الذرّية. */
async function dbGetWithEtag(path) {
  const r = await fetch(dbUrl(path), { headers: { "X-Firebase-ETag": "true" } });
  if (!r.ok) throw new Error(`GET ${path} -> ${r.status}`);
  return { value: await r.json(), etag: r.headers.get("etag") || "" };
}
async function dbPutIfMatch(path, etag, value) {
  const r = await fetch(dbUrl(path), {
    method: "PUT",
    headers: { "Content-Type": "application/json", "if-match": etag },
    body: JSON.stringify(value),
  });
  if (r.status === 412) return false; // تغيّرت القيمة — القطعة أُخذت
  if (!r.ok) throw new Error(`PUT ${path} -> ${r.status} ${await r.text()}`);
  return true;
}

/** التحقق من هوية المستخدم عبر Identity Toolkit (لا يحتاج مفتاح خدمة). */
async function verifyIdToken(idToken) {
  const r = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(API_KEY)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    },
  );
  if (!r.ok) return "";
  const data = await r.json().catch(() => ({}));
  return data?.users?.[0]?.localId || "";
}

/* --------------------------- منطق التسليم الفوري --------------------------- */
const money = (n) => `${(Number(n) || 0).toFixed(2)} ر.ع`;
const DEMO_CODE_RE = /^(ESIM3|ESIM30|IOSP|ACC)-\d{3,5}-\d{3}$/i;
const IMG_RE = /^https?:\/\/\S+\.(png|jpe?g|webp|gif|svg)(\?\S*)?$/i;

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const isAdmin = async (uid) => (await dbGet("admins/" + uid)) === true;

/** يحجز قطعة واحدة من المخزون بكتابة شرطية حتى لا تُباع مرتين. */
async function claimUnit(productId, unitId, order) {
  const path = `stock/${productId}/${unitId}`;
  const { value, etag } = await dbGetWithEtag(path);
  if (!value || value.status !== "available" || !etag) return null;
  const next = {
    ...value,
    status: "sold",
    orderId: order.id,
    orderNumber: order.orderNumber || 0,
    buyerUid: order.uid || "",
    buyerName: order.customerName || order.username || "",
    buyerEmail: order.email || "",
    soldAt: Date.now(),
  };
  return (await dbPutIfMatch(path, etag, next)) ? next : null;
}

/** يسحب أكواداً من مصفوفة product.codes بكتابة شرطية. */
async function claimCodes(productId, count) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const { value, etag } = await dbGetWithEtag(`products/${productId}/codes`);
    const pool = shuffle(
      (Array.isArray(value) ? value : []).filter((c) => c && !DEMO_CODE_RE.test(String(c).trim())),
    );
    if (!pool.length || !etag) return [];
    const taken = pool.splice(0, count);
    if (await dbPutIfMatch(`products/${productId}/codes`, etag, pool)) return taken;
  }
  return [];
}

async function allocate(order) {
  const delivered = [];
  const missing = [];

  for (const item of order.items || []) {
    const qty = Math.max(1, Number(item.qty) || 1);
    const productId = item.id;
    let handed = 0;

    const units = (await dbGet("stock/" + productId)) || {};
    const available = shuffle(
      Object.entries(units)
        .filter(([, u]) => u && u.status === "available")
        .map(([id, u]) => ({ id, ...u })),
    );
    for (const u of available) {
      if (handed >= qty) break;
      const claimed = await claimUnit(productId, u.id, order);
      if (!claimed) continue;
      handed++;
      delivered.push({
        productId,
        productName: item.name,
        code: claimed.code || "",
        image: claimed.image || "",
        kind: claimed.kind || (claimed.image ? "image" : "code"),
        unitId: u.id,
      });
    }

    const product = (await dbGet("products/" + productId)) || {};

    if (handed < qty && product.digital) {
      for (const code of await claimCodes(productId, qty - handed)) {
        handed++;
        const isImage = IMG_RE.test(code);
        delivered.push({
          productId,
          productName: item.name,
          code: isImage ? "" : code,
          image: isImage ? code : "",
          kind: isImage ? "image" : "code",
        });
      }
    }

    if (handed < qty && product.deliveryText) {
      for (let i = handed; i < qty; i++) {
        handed++;
        delivered.push({
          productId,
          productName: item.name,
          code: String(product.deliveryText),
          kind: "text",
        });
      }
    }

    if (handed < qty) missing.push({ productId, productName: item.name, qty: qty - handed });

    // تحديث العدّادات العامة (لا تحتوي بيانات سرية)
    const fresh = (await dbGet("stock/" + productId)) || {};
    const availableCount = Object.values(fresh).filter((u) => u && u.status === "available").length;
    const codesNow = await dbGet(`products/${productId}/codes`);
    const codesLeft = Array.isArray(codesNow) ? codesNow.length : 0;
    const updates = { soldCount: (Number(product.soldCount) || 0) + handed };
    if (Object.keys(fresh).length) {
      updates.stock = availableCount;
      updates.availableUnitCount = availableCount;
      updates.unitCount = Object.keys(fresh).length;
    } else if (product.digital) {
      updates.stock = codesLeft;
    } else {
      updates.stock = Math.max(0, (Number(product.stock) || 0) - handed);
    }
    await dbPatch("products/" + productId, updates);
  }

  return { delivered, missing };
}

function customerMessage(order, codes) {
  const lines = [
    `✅ *تم تنفيذ طلبك — ${STORE_NAME}*`,
    `🆔 رقم الطلب: ${String(order.orderNumber || "").padStart(8, "0")}`,
    `💰 المدفوع من الرصيد: ${money(order.total)}`,
    "━━━━━━━━━━━━━━",
    "📦 *تفاصيل التسليم:*",
  ];
  codes.forEach((c, i) => {
    lines.push(`${i + 1}. ${c.productName}`);
    if (c.image) lines.push(`   🖼️ ${c.image}`);
    else if (c.code) lines.push(`   🔑 ${c.code}`);
  });
  lines.push("━━━━━━━━━━━━━━", "تجدها أيضاً في صفحة «طلباتي». شكراً لثقتك 💚");
  return lines.join("\n");
}

function adminMessage(order, codes, missing) {
  return [
    `⚡ *تسليم فوري تم تلقائياً — ${STORE_NAME}*`,
    `🆔 ${String(order.orderNumber || "").padStart(8, "0")}`,
    `👤 ${order.customerName || "-"} — ${order.phone || "-"}`,
    `💰 ${money(order.total)} (من الرصيد)`,
    `📦 عدد العناصر المُسلَّمة: ${codes.length}`,
    ...(missing.length
      ? [
          "⚠️ *نقص في المخزون:*",
          ...missing.map((m) => `  • ${m.productName} × ${m.qty}`),
          "أكمل التسليم يدوياً من لوحة التحكم.",
        ]
      : []),
  ].join("\n");
}

async function handleDeliver(req, res) {
  if (!deliveryReady())
    return res.status(501).json({ error: "delivery-not-configured", detail: deliveryError() });

  const { idToken, orderId } = req.body || {};
  if (!idToken || !orderId) return res.status(400).json({ error: "idToken and orderId required" });

  const uid = await verifyIdToken(String(idToken));
  if (!uid) return res.status(401).json({ error: "invalid-token" });

  const orderPath = "orders/" + String(orderId);
  const raw = await dbGet(orderPath);
  if (!raw) return res.status(404).json({ error: "order-not-found" });
  const order = { id: String(orderId), ...raw };

  if (order.uid !== uid && !(await isAdmin(uid)))
    return res.status(403).json({ error: "not-your-order" });
  if (!order.paidFromWallet || order.paid !== true)
    return res.status(400).json({ error: "order-not-paid-from-wallet" });
  if (order.rejected === true || order.status === "rejected")
    return res.status(400).json({ error: "order-rejected" });
  if (Array.isArray(order.deliveredCodes) && order.deliveredCodes.length)
    return res.json({ ok: true, codes: order.deliveredCodes, alreadyDelivered: true });

  let delivered, missing;
  try {
    ({ delivered, missing } = await allocate(order));
  } catch (e) {
    log.error("[deliver] allocation failed: " + String(e?.message || e));
    return res.status(500).json({ error: "allocation-failed" });
  }
  if (!delivered.length) return res.status(409).json({ error: "out-of-stock", missing });

  const now = Date.now();
  const history = Array.isArray(order.statusHistory) ? order.statusHistory : [];
  await dbPatch(orderPath, {
    deliveredCodes: delivered,
    deliveredAt: now,
    status: missing.length ? "pending" : "delivered",
    statusText: missing.length ? "مدفوع — جاري إكمال التسليم" : "تم التسليم",
    accepted: true,
    autoDelivered: true,
    updatedAt: now,
    statusHistory: [...history, { status: missing.length ? "pending" : "delivered", at: now }],
  });

  try {
    if (order.phone) await send(String(order.phone), customerMessage(order, delivered));
  } catch (e) {
    log.warn("[deliver] customer notify failed: " + String(e?.message || e));
  }
  try {
    if (ADMIN_NUMBER) await send(ADMIN_NUMBER, adminMessage(order, delivered, missing));
  } catch {
    /* ignore */
  }

  return res.json({ ok: true, codes: delivered, missing });
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

app.get("/status", (_, res) =>
  res.json({
    connected,
    status: connected ? "connected" : lastQR ? "waiting-qr" : "connecting",
    qr: connected ? "" : lastQR,
    autoDelivery: deliveryReady(),
    autoDeliveryError: deliveryError(),
  }),
);

app.post("/deliver", auth, (req, res) =>
  handleDeliver(req, res).catch((e) => {
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

/** إعادة اتصال مع الحفاظ على الجلسة. */
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

/** فصل الربط لتوليد QR جديد. */
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

log.info(deliveryReady() ? "[deliver] auto-delivery ready (REST)" : "[deliver] disabled: " + deliveryError());
app.listen(PORT, () => log.info(`HTTP on :${PORT}`));
start().catch((e) => log.error(e));
