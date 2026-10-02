/**
 * التسليم الفوري للطلبات المدفوعة من الرصيد — داخل الموقع فقط (بدون واتساب).
 * ---------------------------------------------------------------------------
 * قواعد Firebase تمنع المتصفح من قراءة المخزون (لحماية الأكواد)، لذلك يتم
 * السحب من المخزون عبر خدمة تسليم على الخادم تتحقق من:
 *   - هوية المشتري (ID token)
 *   - أن الطلب مدفوع من الرصيد وأن المبلغ خُصم فعلاً (wallet_tx)
 * ثم تضع الأكواد داخل الطلب نفسه فتظهر للعميل في صفحة "تتبّع طلباتك".
 *
 * ترتيب المحاولة: نفس الموقع (/api/deliver ثم /api/public/deliver) ثم خدمة
 * التسليم المستضافة الاحتياطية. تُعاد المحاولة عدة مرات قبل الاستسلام.
 */
import { getFbAuth } from "./firebase";
import type { DeliveredCode } from "./db";

export type InstantDeliveryResult =
  | { ok: true; codes: DeliveredCode[]; missing?: { productName: string; qty: number }[] }
  | { ok: false; error: string; reason?: string };

type DeliverBody = {
  ok?: boolean;
  codes?: DeliveredCode[];
  missing?: { productName: string; qty: number }[];
  error?: string;
};

const HOSTED_ENDPOINTS = [
  "https://project--fe83eda9-3e7e-4a2b-9893-dd6db1ace544.lovable.app/api/public/deliver",
  "https://project--fe83eda9-3e7e-4a2b-9893-dd6db1ace544-dev.lovable.app/api/public/deliver",
];

/** أخطاء نهائية — لا فائدة من إعادة المحاولة أو تجربة رابط آخر. */
const FINAL = new Set([
  "out-of-stock",
  "needs-manual-approval",
  "order-rejected",
  "not-your-order",
  "order-not-paid-from-wallet",
]);

async function callDeliver(url: string, idToken: string, orderId: string) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken, orderId }),
      signal: ctrl.signal,
    });
    const body = (await res.json().catch(() => ({}))) as DeliverBody;
    return { res, body };
  } finally {
    clearTimeout(timer);
  }
}

const inflight = new Map<string, Promise<InstantDeliveryResult>>();

export function requestInstantDelivery(orderId: string): Promise<InstantDeliveryResult> {
  const running = inflight.get(orderId);
  if (running) return running;
  const p = run(orderId).finally(() => inflight.delete(orderId));
  inflight.set(orderId, p);
  return p;
}

async function run(orderId: string): Promise<InstantDeliveryResult> {
  const user = getFbAuth().currentUser;
  if (!user) return { ok: false, error: "no-user" };
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const endpoints = [
    ...(origin ? [origin + "/api/deliver", origin + "/api/public/deliver"] : []),
    ...HOSTED_ENDPOINTS,
  ];
  let last: InstantDeliveryResult = { ok: false, error: "unknown" };
  for (let attempt = 0; attempt < 4; attempt++) {
    let idToken = "";
    try {
      idToken = await user.getIdToken(attempt > 0);
    } catch (e) {
      last = { ok: false, error: e instanceof Error ? e.message : "token" };
    }
    if (idToken) {
      for (const url of endpoints) {
        try {
          const { res, body } = await callDeliver(url, idToken, orderId);
          if (res.ok && body.ok)
            return { ok: true, codes: body.codes || [], missing: body.missing || [] };
          if (body.error && FINAL.has(body.error))
            return { ok: false, error: "HTTP " + res.status, reason: body.error };
          last = { ok: false, error: "HTTP " + res.status, reason: body.error || "" };
        } catch (e) {
          last = { ok: false, error: e instanceof Error ? e.message : "fetch" };
        }
      }
    }
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
  }
  return last;
}

/** رسالة توضيحية بالعربية/الإنجليزية لسبب تعذّر التسليم الفوري. */
export function instantDeliveryHint(r: Extract<InstantDeliveryResult, { ok: false }>, lang: string) {
  if (r.reason === "out-of-stock")
    return lang === "ar"
      ? "المخزون نفد — سيتم التسليم بأسرع وقت."
      : "Out of stock — we will deliver shortly.";
  return lang === "ar"
    ? "تم استلام طلبك ودفعه من رصيدك — سيظهر المحتوى في صفحة طلباتك خلال لحظات."
    : "Order paid from your balance — your items will appear on your orders page in a moment.";
}
