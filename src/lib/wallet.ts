/**
 * نظام الرصيد (المحفظة)
 * ---------------------
 * - رصيد المستخدم يُخزَّن بالريال العُماني في users/{uid}/balance
 * - طلبات شحن الرصيد في topups/{id} (تظهر للأدمن في لوحة التحكم + إشعار واتساب)
 * - سجل حركات الرصيد في wallet_tx/{uid}/{id}
 * - الشراء يخصم من الرصيد ويسلّم المنتج فوراً من المخزون
 */
import {
  ref,
  push,
  set,
  get,
  update,
  onValue,
  runTransaction,
  query,
  orderByChild,
  equalTo,
  limitToFirst,
} from "firebase/database";
import { getDb } from "./firebase";
import {
  STORE_NAME,
  formatOrderNo,
  getCountryCode,
  getNotifyNumber,
  getWaServer,
  sendWhatsApp,
  type DeliveredCode,
  type Order,
  type Product,
  type StockUnit,
  type Unsub,
  type WaResult,
} from "./db";

/* ============================ TYPES ============================ */
export type TopupStatus = "pending" | "approved" | "rejected";

export type TopupRequest = {
  id: string;
  number?: number;
  uid: string;
  userName?: string;
  email?: string;
  phone?: string;
  photo?: string;
  /** المبلغ المطلوب شحنه بالريال العُماني */
  amount: number;
  packageName?: string;
  note?: string;
  paymentMethod?: string;
  paymentMethodName?: string;
  paymentCurrency?: string;
  amountToPay?: string;
  paymentProof?: "receipt" | "card" | string;
  receiptImage?: string;
  receiptImages?: string[];
  cardNumbers?: string[];
  status: TopupStatus;
  rejectionReason?: string;
  createdAt: number;
  reviewedAt?: number;
};

export type WalletTxType = "topup" | "purchase" | "admin";

export type WalletTx = {
  id: string;
  type: WalletTxType;
  /** موجب = إضافة رصيد، سالب = خصم */
  amount: number;
  balanceAfter?: number;
  note?: string;
  orderId?: string;
  orderNumber?: number;
  topupId?: string;
  createdAt: number;
};

/** باقات الشحن الجاهزة (بالريال العُماني) */
export const TOPUP_PACKAGES = [
  { id: "s", amount: 1, label: "باقة صغيرة", labelEn: "Starter" },
  { id: "m", amount: 3, label: "باقة متوسطة", labelEn: "Medium" },
  { id: "l", amount: 5, label: "باقة كبيرة", labelEn: "Large" },
  { id: "xl", amount: 10, label: "باقة مميزة", labelEn: "Premium", bonus: 0.5 },
] as const;

export const MIN_TOPUP = 0.5;
export const MAX_TOPUP = 500;

function listFrom<T>(snap: {
  exists: () => boolean;
  val: () => Record<string, unknown>;
}): T[] {
  if (!snap.exists()) return [];
  return Object.entries(snap.val() || {}).map(([id, v]) => ({
    id,
    ...(v as object),
  })) as T[];
}

/* ============================ BALANCE ============================ */
export function onBalanceChange(uid: string, cb: (v: number) => void): Unsub {
  return onValue(
    ref(getDb(), `users/${uid}/balance`),
    (snap) => cb(Number(snap.val()) || 0),
    () => cb(0),
  );
}

export async function getBalance(uid: string): Promise<number> {
  try {
    const snap = await get(ref(getDb(), `users/${uid}/balance`));
    return Number(snap.val()) || 0;
  } catch {
    return 0;
  }
}

async function addTx(uid: string, tx: Omit<WalletTx, "id">) {
  try {
    const r = push(ref(getDb(), `wallet_tx/${uid}`));
    await set(r, tx);
  } catch (e) {
    console.warn("[wallet] tx log failed", e);
  }
}

export function onWalletTxChange(uid: string, cb: (items: WalletTx[]) => void): Unsub {
  return onValue(
    ref(getDb(), `wallet_tx/${uid}`),
    (snap) =>
      cb(listFrom<WalletTx>(snap).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))),
    () => cb([]),
  );
}

/** تعديل رصيد أي مستخدم من لوحة التحكم (موجب = إضافة، سالب = خصم). */
export async function adjustBalance(uid: string, delta: number, note = "") {
  const amount = Number(delta) || 0;
  if (!uid || !amount) return 0;
  const res = await runTransaction(ref(getDb(), `users/${uid}/balance`), (cur) => {
    const next = (Number(cur) || 0) + amount;
    return next < 0 ? 0 : next;
  });
  const balanceAfter = Number(res.snapshot.val()) || 0;
  await addTx(uid, {
    type: "admin",
    amount,
    balanceAfter,
    note: note || (amount > 0 ? "إضافة رصيد من الإدارة" : "خصم رصيد من الإدارة"),
    createdAt: Date.now(),
  });
  return balanceAfter;
}

/** ضبط الرصيد على قيمة محددة. */
export async function setBalance(uid: string, value: number, note = "") {
  const current = await getBalance(uid);
  return adjustBalance(uid, (Number(value) || 0) - current, note || "تعديل الرصيد");
}

/* ============================ TOPUP REQUESTS ============================ */
export async function createTopupRequest(
  data: Omit<TopupRequest, "id" | "createdAt" | "status" | "number">,
): Promise<{ id: string; number: number }> {
  const db = getDb();
  let number = 1;
  try {
    const res = await runTransaction(ref(db, "topups_counter"), (cur) =>
      typeof cur === "number" ? cur + 1 : 1,
    );
    const v = res.snapshot.val();
    if (typeof v === "number" && v > 0) number = v;
  } catch {
    number = Math.floor(Date.now() / 1000) % 100000000;
  }
  const r = push(ref(db, "topups"));
  await set(r, {
    ...data,
    amount: Number(data.amount) || 0,
    number,
    status: "pending",
    createdAt: Date.now(),
  });
  return { id: r.key as string, number };
}

export function formatTopupNo(t: Pick<TopupRequest, "id" | "number">) {
  if (t?.number && t.number > 0) return "R" + String(t.number).padStart(6, "0");
  return "R" + String(t?.id || "").slice(-6).toUpperCase();
}

export function onTopupsChange(
  cb: (items: TopupRequest[]) => void,
  onError?: (e: Error) => void,
): Unsub {
  return onValue(
    ref(getDb(), "topups"),
    (snap) =>
      cb(
        listFrom<TopupRequest>(snap).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)),
      ),
    (err) => onError?.(err as Error),
  );
}

export function onMyTopupsChange(uid: string, cb: (items: TopupRequest[]) => void): Unsub {
  return onValue(
    query(ref(getDb(), "topups"), orderByChild("uid"), equalTo(uid)),
    (snap) =>
      cb(
        listFrom<TopupRequest>(snap).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)),
      ),
    () => cb([]),
  );
}

/** قبول طلب الشحن: يضيف المبلغ لرصيد المستخدم ويسجّل الحركة. */
export async function approveTopup(id: string, amountOverride?: number) {
  const db = getDb();
  const snap = await get(ref(db, "topups/" + id));
  if (!snap.exists()) return 0;
  const t = { id, ...(snap.val() as object) } as TopupRequest;
  if (t.status === "approved") return await getBalance(t.uid);
  const amount = Number(amountOverride ?? t.amount) || 0;
  const res = await runTransaction(ref(db, `users/${t.uid}/balance`), (cur) =>
    (Number(cur) || 0) + amount,
  );
  const balanceAfter = Number(res.snapshot.val()) || 0;
  await update(ref(db, "topups/" + id), {
    status: "approved",
    amount,
    reviewedAt: Date.now(),
  });
  await addTx(t.uid, {
    type: "topup",
    amount,
    balanceAfter,
    note: `شحن رصيد ${formatTopupNo(t)}`,
    topupId: id,
    createdAt: Date.now(),
  });
  void notifyTopupApproved(t, amount, balanceAfter);
  return balanceAfter;
}

export async function rejectTopup(id: string, reason: string) {
  const db = getDb();
  const snap = await get(ref(db, "topups/" + id));
  const t = snap.exists() ? ({ id, ...(snap.val() as object) } as TopupRequest) : null;
  await update(ref(db, "topups/" + id), {
    status: "rejected",
    rejectionReason: reason || "",
    reviewedAt: Date.now(),
  });
  if (t) void notifyTopupRejected(t, reason);
}

export async function deleteTopup(id: string) {
  await set(ref(getDb(), "topups/" + id), null);
}

/* ============================ PAYING WITH BALANCE ============================ */
export type PayResult =
  | { ok: true; balanceAfter: number }
  | { ok: false; balance: number; missing: number };

/** يخصم المبلغ من الرصيد بأمان (يرفض الخصم إذا كان الرصيد غير كافٍ). */
export async function chargeBalance(uid: string, amount: number): Promise<PayResult> {
  const cost = Number(amount) || 0;
  const res = await runTransaction(ref(getDb(), `users/${uid}/balance`), (cur) => {
    const bal = Number(cur) || 0;
    if (bal + 1e-9 < cost) return; // abort
    return Number((bal - cost).toFixed(3));
  });
  if (!res.committed) {
    const balance = await getBalance(uid);
    return { ok: false, balance, missing: Math.max(0, cost - balance) };
  }
  return { ok: true, balanceAfter: Number(res.snapshot.val()) || 0 };
}

/** إرجاع المبلغ للرصيد عند فشل الطلب. */
export async function refundBalance(uid: string, amount: number, note = "استرجاع مبلغ") {
  return adjustBalance(uid, Math.abs(Number(amount) || 0), note);
}

export async function logPurchase(
  uid: string,
  amount: number,
  balanceAfter: number,
  order: { id: string; orderNumber?: number },
) {
  await addTx(uid, {
    type: "purchase",
    amount: -Math.abs(Number(amount) || 0),
    balanceAfter,
    note: `شراء — طلب #${formatOrderNo(order as Order)}`,
    orderId: order.id,
    orderNumber: order.orderNumber || 0,
    createdAt: Date.now(),
  });
}

/* ============================ INSTANT DELIVERY ============================ */
/**
 * يسحب قطعة من مخزون كل منتج ويعلّمها مُباعة، ويرجع محتوى التسليم.
 * يُستخدم عند الشراء بالرصيد ليصل المنتج للمشتري فوراً.
 */
export async function allocateUnitsForBuyer(
  items: { id: string; name: string; qty: number }[],
  buyer: { uid: string; name?: string; email?: string },
): Promise<{ codes: DeliveredCode[]; missing: { id: string; name: string; qty: number }[] }> {
  const db = getDb();
  const codes: DeliveredCode[] = [];
  const missing: { id: string; name: string; qty: number }[] = [];

  for (const item of items) {
    const qty = Math.max(1, Number(item.qty) || 1);
    let handed = 0;

    try {
      const snap = await get(
        query(
          ref(db, "stock/" + item.id),
          orderByChild("status"),
          equalTo("available"),
          limitToFirst(qty),
        ),
      );
      const units = snap.exists()
        ? Object.entries(snap.val() as Record<string, StockUnit>).map(([id, u]) => ({
            ...(u as StockUnit),
            id,
          }))
        : [];
      const now = Date.now();
      for (const u of units) {
        if (handed >= qty) break;
        try {
          await update(ref(db, `stock/${item.id}/${u.id}`), {
            status: "sold",
            buyerUid: buyer.uid,
            buyerName: buyer.name || "",
            buyerEmail: buyer.email || "",
            soldAt: now,
          });
        } catch {
          continue;
        }
        handed++;
        codes.push({
          productId: item.id,
          productName: item.name,
          code: u.code || "",
          image: u.image || "",
          kind: u.kind || (u.image ? "image" : "code"),
          unitId: u.id || "",
        });
      }
    } catch (e) {
      console.warn("[wallet] stock allocation failed", e);
    }

    if (handed < qty) {
      // لا يوجد مخزون مُتتبَّع: نستخدم نص التسليم الجاهز إن وُجد
      let text = "";
      try {
        const p = await get(ref(db, "products/" + item.id));
        text = String((p.val() as Product | null)?.deliveryText || "");
      } catch {
        /* ignore */
      }
      if (text) {
        for (let i = handed; i < qty; i++)
          codes.push({
            productId: item.id,
            productName: item.name,
            code: text,
            kind: "text",
          });
      } else {
        missing.push({ id: item.id, name: item.name, qty: qty - handed });
      }
    }

    // تحديث العدادات العامة (لا تحتوي أي بيانات سرية)
    try {
      const pRef = ref(db, "products/" + item.id);
      const pSnap = await get(pRef);
      const product = (pSnap.exists() ? pSnap.val() : {}) as Product;
      await update(pRef, {
        stock: Math.max(0, (Number(product.stock) || 0) - handed),
        availableUnitCount: Math.max(0, (Number(product.availableUnitCount) || 0) - handed),
        soldCount: (Number(product.soldCount) || 0) + qty,
      });
    } catch {
      /* الصلاحيات قد تمنع التحديث — لا يؤثر على التسليم */
    }
  }

  return { codes, missing };
}

/* ============================ WHATSAPP ============================ */
const money = (n: number) => `${(Number(n) || 0).toFixed(2)} ر.ع`;

export function adminTopupMessage(t: Omit<TopupRequest, "id">, no: string) {
  return [
    `💰 *طلب شحن رصيد جديد — ${STORE_NAME}*`,
    "━━━━━━━━━━━━━━",
    `🆔 *رقم الطلب:* ${no}`,
    `👤 *العميل:* ${t.userName || "-"}`,
    `📧 *البريد:* ${t.email || "-"}`,
    `📱 *الهاتف:* ${t.phone || "-"}`,
    "━━━━━━━━━━━━━━",
    `💵 *المبلغ المطلوب شحنه:* ${money(t.amount)}`,
    ...(t.packageName ? [`📦 *الباقة:* ${t.packageName}`] : []),
    `💳 *طريقة الدفع:* ${t.paymentMethodName || t.paymentMethod || "-"}`,
    ...(t.amountToPay
      ? [`🧾 *المبلغ المحوَّل:* ${t.amountToPay} ${t.paymentCurrency || ""}`]
      : []),
    ...(t.cardNumbers?.length ? [`🎟️ *أكواد البطاقات:* ${t.cardNumbers.join(" | ")}`] : []),
    ...(t.receiptImage ? [`🖼️ *الإيصال:* ${t.receiptImage}`] : []),
    ...(t.note ? [`🗒️ *ملاحظة:* ${t.note}`] : []),
    "━━━━━━━━━━━━━━",
    "افتح لوحة التحكم › طلبات الشحن لقبول أو رفض الطلب.",
  ].join("\n");
}

export async function notifyNewTopup(
  t: Omit<TopupRequest, "id">,
  no: string,
): Promise<{ admin: WaResult; customer: WaResult }> {
  const none: WaResult = { ok: false, error: "غير مُفعّل" };
  try {
    const [srv, adminNo, cc] = await Promise.all([
      getWaServer(),
      getNotifyNumber(),
      getCountryCode(),
    ]);
    if (!srv) return { admin: none, customer: none };
    const [a, c] = await Promise.all([
      adminNo
        ? sendWhatsApp(adminNo, adminTopupMessage(t, no), srv, cc)
        : Promise.resolve<WaResult>({ ok: false, error: "لا يوجد رقم إشعارات" }),
      t.phone
        ? sendWhatsApp(
            t.phone,
            [
              `💰 *طلب شحن رصيد — ${STORE_NAME}*`,
              `🆔 رقم الطلب: ${no}`,
              `💵 المبلغ: ${money(t.amount)}`,
              "",
              "استلمنا طلبك وسيتم إضافة الرصيد بعد مراجعة الإيصال. شكراً لثقتك 💚",
            ].join("\n"),
            srv,
            cc,
          )
        : Promise.resolve<WaResult>({ ok: false, error: "لا يوجد رقم للعميل" }),
    ]);
    return { admin: a, customer: c };
  } catch (e) {
    const err: WaResult = { ok: false, error: e instanceof Error ? e.message : "خطأ" };
    return { admin: err, customer: err };
  }
}

export async function notifyTopupApproved(
  t: TopupRequest,
  amount: number,
  balanceAfter: number,
): Promise<WaResult> {
  if (!t.phone) return { ok: false, error: "لا يوجد رقم للعميل" };
  return sendWhatsApp(
    t.phone,
    [
      `✅ *تم شحن رصيدك في ${STORE_NAME}*`,
      `🆔 ${formatTopupNo(t)}`,
      `💵 المبلغ المضاف: ${money(amount)}`,
      `👛 رصيدك الحالي: ${money(balanceAfter)}`,
      "",
      "يمكنك الآن الشراء مباشرة والتسليم فوري 💚",
    ].join("\n"),
  );
}

export async function notifyTopupRejected(t: TopupRequest, reason: string): Promise<WaResult> {
  if (!t.phone) return { ok: false, error: "لا يوجد رقم للعميل" };
  return sendWhatsApp(
    t.phone,
    [
      `❌ نعتذر، تم رفض طلب شحن الرصيد ${formatTopupNo(t)} في ${STORE_NAME}.`,
      ...(reason ? [`السبب: ${reason}`] : []),
      "للاستفسار راسلنا على الواتساب.",
    ].join("\n"),
  );
}

/** إشعار الإدارة بطلب شراء تم دفعه من الرصيد. */
export async function notifyWalletOrder(order: Order, no: string): Promise<WaResult> {
  try {
    const [srv, adminNo, cc] = await Promise.all([
      getWaServer(),
      getNotifyNumber(),
      getCountryCode(),
    ]);
    if (!srv || !adminNo) return { ok: false, error: "غير مُفعّل" };
    return sendWhatsApp(
      adminNo,
      [
        `🛒 *طلب جديد مدفوع من الرصيد — ${STORE_NAME}*`,
        "━━━━━━━━━━━━━━",
        `🆔 *رقم الطلب:* ${no}`,
        `👤 *العميل:* ${order.customerName || "-"}`,
        `📱 *الهاتف:* ${order.phone || "-"}`,
        "🧾 *المنتجات:*",
        ...(order.items || []).map(
          (i, idx) => `  ${idx + 1}. ${i.name} × ${i.qty} — ${money(i.price * i.qty)}`,
        ),
        `💰 *الإجمالي:* ${money(order.total)}`,
        `👛 *الدفع:* من رصيد المحفظة`,
      ].join("\n"),
      srv,
      cc,
    );
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "خطأ" };
  }
}
