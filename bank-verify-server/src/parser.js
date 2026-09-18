/**
 * تحليل رسالة إشعار البنك واستخراج ما يلزم للتحقق فقط.
 *
 * مثال:
 * "Your SAVINGS a/c XXXXXXX33424 is CREDITED OMR 2 on 18-09-2026 on account of
 *  Mobile Payment from RASHID JUMA KHA/96548555. Available balance in your a/c is OMR 178.452."
 */

const AMOUNT_RE = /CREDITED\s+(?:OMR|RO|R\.?O\.?)\s*([\d,]*\.?\d+)/i;
const FROM_RE = /from\s+([^\/\n\r]*?)\s*\/\s*([A-Z0-9-]{3,})/i;
const DATE_RE = /\bon\s+(\d{1,2}[-\/]\d{1,2}[-\/]\d{4})/i;
const ACCOUNT_RE = /a\/c\s+[X*]*(\d{3,6})\b/i;

export const digitsOnly = (s) => String(s || "").replace(/\D/g, "");

/** يقارن المبالغ بدقة 3 خانات عشرية (البيسة). */
export const sameAmount = (a, b) => Math.abs(Number(a) - Number(b)) < 0.0005;

/** يقارن المرجع: نفس الأرقام بعد إزالة الرموز، أو أحدهما ينتهي بالآخر (≥ 4 أرقام). */
export function sameReference(a, b) {
  const x = digitsOnly(a);
  const y = digitsOnly(b);
  if (!x || !y || x.length < 4 || y.length < 4) return false;
  return x === y || x.endsWith(y) || y.endsWith(x);
}

/**
 * @returns {null | {amount:number, reference:string, senderName:string, txDate:string, accountTail:string, isCredit:true}}
 */
export function parseBankNotification(text) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (!t || !/CREDITED/i.test(t)) return null;

  const am = t.match(AMOUNT_RE);
  if (!am) return null;
  const amount = Number(am[1].replace(/,/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const fm = t.match(FROM_RE);
  const senderName = fm ? fm[1].trim().replace(/\s{2,}/g, " ") : "";
  const reference = fm ? fm[2].trim() : "";

  const dm = t.match(DATE_RE);
  const acc = t.match(ACCOUNT_RE);

  return {
    isCredit: true,
    amount: Number(amount.toFixed(3)),
    reference,
    senderName,
    txDate: dm ? dm[1] : "",
    accountTail: acc ? acc[1].slice(-4) : "",
  };
}

/** إخفاء المرجع في السجلات: ****4243 */
export function maskReference(ref) {
  const d = String(ref || "");
  return d.length <= 4 ? d : "*".repeat(Math.max(2, d.length - 4)) + d.slice(-4);
}

/** إخفاء اسم المحوِّل: يظهر الاسم الأول فقط. */
export function maskName(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "";
  return parts.length === 1 ? parts[0] : `${parts[0]} ${parts.slice(1).map((p) => p[0] + ".").join(" ")}`;
}
