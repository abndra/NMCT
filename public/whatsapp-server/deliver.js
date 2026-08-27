/**
 * التسليم الفوري الآمن للطلبات المدفوعة من الرصيد.
 * -------------------------------------------------
 * لا يُسمح للمتصفح بقراءة المخزون (stock) لأن ذلك يسرّب الأكواد،
 * لذلك يتم السحب من المخزون هنا على السيرفر باستخدام Firebase Admin.
 *
 * متغيرات البيئة المطلوبة:
 *   FIREBASE_DB_URL           = https://<project>-default-rtdb.firebaseio.com
 *   FIREBASE_SERVICE_ACCOUNT  = محتوى ملف مفتاح الخدمة (JSON) أو نفسه بصيغة base64
 *
 * إن لم تُضبط هذه المتغيرات يبقى السيرفر يعمل للواتساب فقط،
 * ويردّ /deliver بالحالة 501 فيتم التسليم يدوياً من لوحة التحكم كما كان.
 */
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getDatabase } from "firebase-admin/database";

let db = null;
let auth = null;
let initError = "";

function parseServiceAccount(raw) {
  const value = String(raw || "").trim();
  if (!value) return null;
  const json = value.startsWith("{")
    ? value
    : Buffer.from(value, "base64").toString("utf8");
  return JSON.parse(json);
}

export function initDelivery(log) {
  try {
    const sa = parseServiceAccount(process.env.FIREBASE_SERVICE_ACCOUNT);
    const databaseURL = process.env.FIREBASE_DB_URL;
    if (!sa || !databaseURL) {
      initError = "FIREBASE_SERVICE_ACCOUNT / FIREBASE_DB_URL not set";
      log?.warn?.("[deliver] auto-delivery disabled: " + initError);
      return false;
    }
    const app = getApps()[0] || initializeApp({ credential: cert(sa), databaseURL });
    db = getDatabase(app);
    auth = getAuth(app);
    log?.info?.("[deliver] auto-delivery ready");
    return true;
  } catch (e) {
    initError = String(e?.message || e);
    log?.error?.("[deliver] init failed: " + initError);
    return false;
  }
}

export const deliveryReady = () => Boolean(db && auth);
export const deliveryError = () => initError;

const money = (n) => `${(Number(n) || 0).toFixed(2)} ر.ع`;

async function isAdmin(uid) {
  const snap = await db.ref("admins/" + uid).get();
  return snap.val() === true;
}

/** يسحب قطعة واحدة من المخزون بمعاملة ذرّية حتى لا تُباع مرتين. */
async function claimUnit(productId, unitId, order) {
  const res = await db.ref(`stock/${productId}/${unitId}`).transaction((cur) => {
    if (!cur || cur.status !== "available") return; // abort
    return {
      ...cur,
      status: "sold",
      orderId: order.id,
      orderNumber: order.orderNumber || 0,
      buyerUid: order.uid || "",
      buyerName: order.customerName || order.username || "",
      buyerEmail: order.email || "",
      soldAt: Date.now(),
    };
  });
  return res.committed ? res.snapshot.val() : null;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const DEMO_CODE_RE = /^(ESIM3|ESIM30|IOSP|ACC)-\d{3,5}-\d{3}$/i;
const IMG_RE = /^https?:\/\/\S+\.(png|jpe?g|webp|gif|svg)(\?\S*)?$/i;

/** يسلّم كل عناصر الطلب: مخزون بالقطع، ثم أكواد المنتج الرقمي، ثم نص التسليم. */
async function allocate(order) {
  const delivered = [];
  const missing = [];

  for (const item of order.items || []) {
    const qty = Math.max(1, Number(item.qty) || 1);
    const productId = item.id;
    let handed = 0;

    const unitsSnap = await db.ref("stock/" + productId).get();
    const units = unitsSnap.exists() ? unitsSnap.val() || {} : {};
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

    const pRef = db.ref("products/" + productId);
    const product = (await pRef.get()).val() || {};

    if (handed < qty && product.digital) {
      const remaining = qty - handed;
      const taken = [];
      await pRef.child("codes").transaction((cur) => {
        const pool = shuffle(
          (Array.isArray(cur) ? cur : []).filter((c) => c && !DEMO_CODE_RE.test(String(c).trim())),
        );
        taken.length = 0;
        for (let i = 0; i < remaining && pool.length; i++) taken.push(pool.shift());
        return pool;
      });
      for (const code of taken) {
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

    // العدّادات العامة (لا تحتوي بيانات سرية)
    const freshSnap = await db.ref("stock/" + productId).get();
    const fresh = freshSnap.exists() ? freshSnap.val() || {} : {};
    const availableCount = Object.values(fresh).filter((u) => u && u.status === "available").length;
    const codesSnap = await pRef.child("codes").get();
    const codesLeft = Array.isArray(codesSnap.val()) ? codesSnap.val().length : 0;
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
    await pRef.update(updates);
  }

  return { delivered, missing };
}

function customerMessage(order, codes, storeName) {
  const lines = [
    `✅ *تم تنفيذ طلبك — ${storeName}*`,
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

function adminMessage(order, codes, missing, storeName) {
  return [
    `⚡ *تسليم فوري تم تلقائياً — ${storeName}*`,
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

/**
 * POST /deliver { idToken, orderId }
 * يتحقق من هوية المشتري ومن أن الطلب مدفوع من الرصيد قبل أي قراءة للمخزون.
 */
export async function handleDeliver(req, res, { send, adminNumber, log }) {
  if (!deliveryReady())
    return res.status(501).json({ error: "delivery-not-configured", detail: initError });

  const { idToken, orderId } = req.body || {};
  if (!idToken || !orderId) return res.status(400).json({ error: "idToken and orderId required" });

  let uid = "";
  try {
    uid = (await auth.verifyIdToken(String(idToken))).uid;
  } catch {
    return res.status(401).json({ error: "invalid-token" });
  }

  const orderRef = db.ref("orders/" + String(orderId));
  const snap = await orderRef.get();
  if (!snap.exists()) return res.status(404).json({ error: "order-not-found" });
  const order = { id: String(orderId), ...(snap.val() || {}) };

  if (order.uid !== uid && !(await isAdmin(uid)))
    return res.status(403).json({ error: "not-your-order" });
  if (!order.paidFromWallet || order.paid !== true)
    return res.status(400).json({ error: "order-not-paid-from-wallet" });
  if (order.rejected === true || order.status === "rejected")
    return res.status(400).json({ error: "order-rejected" });
  if (Array.isArray(order.deliveredCodes) && order.deliveredCodes.length)
    return res.json({ ok: true, codes: order.deliveredCodes, alreadyDelivered: true });

  let result;
  try {
    result = await allocate(order);
  } catch (e) {
    log?.error?.("[deliver] allocation failed: " + String(e?.message || e));
    return res.status(500).json({ error: "allocation-failed" });
  }
  const { delivered, missing } = result;

  if (!delivered.length)
    return res.status(409).json({ error: "out-of-stock", missing });

  const now = Date.now();
  const history = Array.isArray(order.statusHistory) ? order.statusHistory : [];
  await orderRef.update({
    deliveredCodes: delivered,
    deliveredAt: now,
    status: missing.length ? "pending" : "delivered",
    statusText: missing.length ? "مدفوع — جاري إكمال التسليم" : "تم التسليم",
    accepted: true,
    autoDelivered: true,
    updatedAt: now,
    statusHistory: [...history, { status: missing.length ? "pending" : "delivered", at: now }],
  });

  const storeName = process.env.STORE_NAME || "NMCT";
  try {
    if (order.phone) await send(String(order.phone), customerMessage(order, delivered, storeName));
  } catch (e) {
    log?.warn?.("[deliver] customer notify failed: " + String(e?.message || e));
  }
  try {
    if (adminNumber) await send(adminNumber, adminMessage(order, delivered, missing, storeName));
  } catch {
    /* ignore */
  }

  return res.json({ ok: true, codes: delivered, missing });
}
