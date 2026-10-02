/**
 * Netlify Function: التسليم التلقائي الفوري للطلبات المدفوعة من الرصيد.
 * يعمل على نفس موقع Netlify — لا يحتاج سيرفر واتساب ولا قبول يدوي.
 * متغيرات البيئة في Netlify:
 *   FIREBASE_DB_SECRET  (Firebase Console → Project settings → Service accounts → Database secrets)
 *   FIREBASE_DB_URL     (اختياري) الافتراضي https://nmct-4d2a9-default-rtdb.firebaseio.com
 *   FIREBASE_API_KEY    (اختياري)
 */
const DB_URL = (process.env.FIREBASE_DB_URL || "https://nmct-4d2a9-default-rtdb.firebaseio.com").replace(/\/+$/, "");
const DB_SECRET = process.env.FIREBASE_DB_SECRET || "";
const API_KEY = process.env.FIREBASE_API_KEY || "AIzaSyB0AOQwMAblWOcw-xYeMvTXwrdm3aoFlC4";

const dbUrl = (path, params = "") =>
  `${DB_URL}/${String(path).replace(/^\/+/, "")}.json?auth=${encodeURIComponent(DB_SECRET)}${params}`;
async function dbGet(path) {
  const r = await fetch(dbUrl(path));
  if (!r.ok) throw new Error(`GET ${path} -> ${r.status}`);
  return r.json();
}
async function dbPatch(path, value) {
  const r = await fetch(dbUrl(path), { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) });
  if (!r.ok) throw new Error(`PATCH ${path} -> ${r.status}`);
  return r.json();
}
async function dbGetWithEtag(path) {
  const r = await fetch(dbUrl(path), { headers: { "X-Firebase-ETag": "true" } });
  if (!r.ok) throw new Error(`GET ${path} -> ${r.status}`);
  return { value: await r.json(), etag: r.headers.get("etag") || "" };
}
async function dbPutIfMatch(path, etag, value) {
  const r = await fetch(dbUrl(path), { method: "PUT", headers: { "Content-Type": "application/json", "if-match": etag }, body: JSON.stringify(value) });
  if (r.status === 412) return false;
  if (!r.ok) throw new Error(`PUT ${path} -> ${r.status}`);
  return true;
}
async function verifyIdToken(idToken) {
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(API_KEY)}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken }),
  });
  if (!r.ok) return "";
  const data = await r.json().catch(() => ({}));
  return data?.users?.[0]?.localId || "";
}

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


const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export default async (req) => {
  if (req.method !== "POST") return json(405, { error: "method" });
  if (!DB_SECRET) return json(501, { error: "delivery-not-configured", detail: "FIREBASE_DB_SECRET not set" });
  const { idToken, orderId } = await req.json().catch(() => ({}));
  if (!idToken || !orderId || !/^[A-Za-z0-9_-]{1,64}$/.test(String(orderId)))
    return json(400, { error: "idToken and orderId required" });
  const uid = await verifyIdToken(String(idToken));
  if (!uid) return json(401, { error: "invalid-token" });

  const raw = await dbGet("orders/" + orderId);
  if (!raw) return json(404, { error: "order-not-found" });
  const order = { id: String(orderId), ...raw };
  if (order.uid !== uid && !(await isAdmin(uid))) return json(403, { error: "not-your-order" });
  if (!order.paidFromWallet || order.paid !== true) return json(400, { error: "order-not-paid-from-wallet" });
  if (order.rejected === true || order.status === "rejected") return json(400, { error: "order-rejected" });
  if (order.needsApproval === true) return json(400, { error: "needs-manual-approval" });
  if (Array.isArray(order.deliveredCodes) && order.deliveredCodes.length)
    return json(200, { ok: true, codes: order.deliveredCodes, alreadyDelivered: true });

  // تأكيد أن المبلغ خُصم فعلاً من رصيد المشتري (سجل شراء مرتبط بالطلب)
  const txs = (await dbGet(`wallet_tx/${order.uid}`)) || {};
  const paid = Object.values(txs).some(
    (t) => t && t.type === "purchase" && t.orderId === order.id && Math.abs(Number(t.amount)) + 1e-6 >= Number(order.total),
  );
  if (!paid) return json(402, { error: "payment-not-found" });

  let delivered, missing;
  try {
    ({ delivered, missing } = await allocate(order));
  } catch (e) {
    return json(500, { error: "allocation-failed" });
  }
  if (!delivered.length) return json(409, { error: "out-of-stock", missing });
  const now = Date.now();
  const history = Array.isArray(order.statusHistory) ? order.statusHistory : [];
  const st = missing.length ? "pending" : "delivered";
  await dbPatch("orders/" + order.id, {
    deliveredCodes: delivered,
    deliveredAt: now,
    status: st,
    statusText: missing.length ? "مدفوع — جاري إكمال التسليم" : "تم التسليم",
    autoDelivered: true,
    statusHistory: [...history, { status: st, at: now }],
  });
  return json(200, { ok: true, codes: delivered, missing });
};

export const config = { path: "/api/deliver" };
