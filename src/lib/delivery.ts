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

export async function requestInstantDelivery(orderId: string): Promise<InstantDeliveryResult> {
  try {
    const user = getFbAuth().currentUser;
    if (!user) return { ok: false, error: "no-user" };
    const srv = await getWaServer();
    if (!srv?.url || !srv.token) return { ok: false, error: "no-server" };
    const idToken = await user.getIdToken();
    const res = await fetch(normalizeWaServerUrl(srv.url) + "/deliver", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + srv.token },
      body: JSON.stringify({ idToken, orderId }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      codes?: DeliveredCode[];
      missing?: { productName: string; qty: number }[];
      error?: string;
    };
    if (res.ok && body.ok)
      return { ok: true, codes: body.codes || [], missing: body.missing || [] };
    return { ok: false, error: "HTTP " + res.status, reason: body.error || "" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "خطأ" };
  }
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
