/**
 * Netlify Scheduled Function: يفحص طلبات الشحن "قيد التحقق" كل دقيقة.
 * يضمن قبول التحويل حتى لو أغلق العميل الصفحة — بدون أي سيرفر خارجي (Railway).
 */
import { recoverUncredited, tick } from "../../bank-verify-server/src/verifier.js";

export default async () => {
  try {
    await recoverUncredited().catch(() => {});
    await tick();
  } catch (e) {
    console.error("[bank-verify-cron]", e?.message || e);
  }
  return new Response("ok");
};

export const config = { schedule: "* * * * *" };
