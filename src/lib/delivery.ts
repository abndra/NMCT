/**
 * التسليم الفوري للطلبات المدفوعة من الرصيد.
 * ------------------------------------------
 * قواعد Firebase تمنع المتصفح من قراءة المخزون (لحماية الأكواد)، لذلك يتم
 * السحب من المخزون على سيرفر الواتساب (Firebase Admin) عبر المسار /deliver.
 * السيرفر يتحقق من هوية المشتري (ID token) ومن أن الطلب مدفوع من الرصيد.
 *
 * إن لم يكن السيرفر مضبوطاً يرجع { ok: false } ويبقى الطلب في لوحة التحكم
 * ليُسلَّم بضغطة قبول واحدة كما كان — لا يتأثر العميل ولا رصيده.
 */
import { getFbAuth } from "./firebase";
import {
  getWaServer,
  normalizeWaServerUrl,
  type DeliveredCode,
} from "./db";

export type InstantDeliveryResult =
  | { ok: true; codes: DeliveredCode[]; missing?: { productName: string; qty: number }[] }
  | { ok: false; error: string; reason?: string };

type DeliverBody = {
  ok?: boolean;
  codes?: DeliveredCode[];
  missing?: { productName: string; qty: number }[];
  error?: string;
};

async function callDeliver(url: string, headers: Record<string, string>, idToken: string, orderId: string) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ idToken, orderId }),
  });
  const body = (await res.json().catch(() => ({}))) as DeliverBody;
  return { res, body };
}

/**
 * 1) يحاول التسليم عبر دالة Netlify على نفس الموقع (/api/deliver) — لا تحتاج سيرفر خارجي.
 * 2) إن لم تكن مضبوطة يرجع لسيرفر الواتساب القديم.
 * 3) يعيد المحاولة حتى 3 مرات قبل الاستسلام.
 */
export async function requestInstantDelivery(orderId: string): Promise<InstantDeliveryResult> {
  const user = getFbAuth().currentUser;
  if (!user) return { ok: false, error: "no-user" };
  let last: InstantDeliveryResult = { ok: false, error: "unknown" };
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const idToken = await user.getIdToken();
      // ① Netlify Function على نفس الدومين
      try {
        const { res, body } = await callDeliver("/api/deliver", {}, idToken, orderId);
        if (res.ok && body.ok) return { ok: true, codes: body.codes || [], missing: body.missing || [] };
        if (body.error === "out-of-stock" || body.error === "needs-manual-approval")
          return { ok: false, error: "HTTP " + res.status, reason: body.error };
        last = { ok: false, error: "HTTP " + res.status, reason: body.error || "" };
      } catch (e) {
        last = { ok: false, error: e instanceof Error ? e.message : "fetch" };
      }
      // ② السيرفر الخارجي (احتياطي)
      const srv = await getWaServer();
      if (srv?.url && srv.token) {
        const { res, body } = await callDeliver(
          normalizeWaServerUrl(srv.url) + "/deliver",
          { Authorization: "Bearer " + srv.token },
          idToken,
          orderId,
        );
        if (res.ok && body.ok) return { ok: true, codes: body.codes || [], missing: body.missing || [] };
        if (body.error === "out-of-stock") return { ok: false, error: "HTTP 409", reason: body.error };
        last = { ok: false, error: "HTTP " + res.status, reason: body.error || "" };
      }
    } catch (e) {
      last = { ok: false, error: e instanceof Error ? e.message : "خطأ" };
    }
    await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)));
  }
  return last;
}

/** رسالة توضيحية بالعربية/الإنجليزية لسبب تعذّر التسليم الفوري. */
export function instantDeliveryHint(r: Extract<InstantDeliveryResult, { ok: false }>, lang: string) {
  if (r.reason === "out-of-stock")
    return lang === "ar"
      ? "المخزون نفد — سيتم التسليم يدوياً بأسرع وقت."
      : "Out of stock — we will deliver manually shortly.";
  return lang === "ar"
    ? "تم استلام طلبك ودفعه من رصيدك — سيتم التسليم بعد لحظات."
    : "Order paid from your balance — delivery in a moment.";
}
