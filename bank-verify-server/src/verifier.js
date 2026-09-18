/**
 * محرك التحقق: يطابق طلبات الشحن "قيد التحقق" مع إشعارات البنك.
 *
 * دورة العمل كل POLL_INTERVAL_SECONDS:
 *   1. جلب الطلبات بحالة verifying
 *   2. (إن وُجدت) جلب رسائل الإشعارات الجديدة وتحليلها (نتائج التحليل فقط تُحفظ في الذاكرة)
 *   3. لكل طلب: مطابقة (المبلغ + المرجع + النافذة الزمنية) → قبول، أو انتهاء المهلة → expired
 *
 * الحماية من التكرار:
 *   - bank_verify/used_tx/{gmailMessageId} يُحجز بكتابة شرطية قبل أي إضافة رصيد
 *   - تغيير حالة الطلب verifying → approved يتم بكتابة شرطية أيضاً
 *   - الرصيد يُضاف بمعاملة ذرّية ثم يُعلَّم الطلب credited=true (مع استرجاع تلقائي عند إعادة التشغيل)
 */
import { cfg } from "./config.js";
import { dbGet, dbPatch, dbPush, dbPutIfMatch, dbGetWithEtag, dbQuery, dbTransaction } from "./firebase.js";
import { fetchParsedMessage, listMessageIds } from "./gmail.js";
import { getAccessToken } from "./google-oauth.js";
import { maskName, maskReference, sameAmount, sameReference } from "./parser.js";

const parsedCache = new Map(); // messageId -> parsed | null
const MAX_CACHE = 600;
let ticking = false;
let timer = null;

const formatNo = (t) => (t.number ? "R" + String(t.number).padStart(6, "0") : "R" + String(t.id).slice(-6).toUpperCase());

/* ------------------------------ الحالة والسجل ------------------------------ */
async function heartbeat(patch = {}) {
  await dbPatch("bank_verify/state", { lastPollAt: Date.now(), running: true, ...patch }).catch(() => {});
}

async function bump(stat) {
  await dbTransaction(`bank_verify/state/stats/${stat}`, (v) => (Number(v) || 0) + 1).catch(() => {});
}

async function logEvent(ev) {
  await dbPush("bank_verify/log", { ...ev, at: Date.now() }).catch(() => {});
  // نحتفظ بآخر 100 سجل فقط
  try {
    const all = await dbGet("bank_verify/log", "&orderBy=%22at%22");
    const keys = Object.keys(all || {});
    if (keys.length > 100) {
      const sorted = keys.sort((a, b) => (all[a].at || 0) - (all[b].at || 0));
      const drop = Object.fromEntries(sorted.slice(0, keys.length - 100).map((k) => [k, null]));
      await dbPatch("bank_verify/log", drop);
    }
  } catch {
    /* ignore */
  }
}

/* ------------------------------ Gmail ------------------------------ */
async function loadCandidates() {
  const accessToken = await getAccessToken();
  if (!accessToken) return { connected: false, list: [] };
  const ids = await listMessageIds(accessToken);
  for (const id of ids) {
    if (parsedCache.has(id)) continue;
    try {
      parsedCache.set(id, await fetchParsedMessage(accessToken, id));
    } catch (e) {
      if (/unauthorized|forbidden|rate-limited/.test(String(e?.message))) throw e;
      parsedCache.set(id, null);
    }
  }
  while (parsedCache.size > MAX_CACHE) parsedCache.delete(parsedCache.keys().next().value);
  return { connected: true, list: [...parsedCache.values()].filter(Boolean) };
}

/* ------------------------------ القبول والرفض ------------------------------ */
async function creditBalance(t) {
  const amount = Number(t.amount) || 0;
  const res = await dbTransaction(`users/${t.uid}/balance`, (cur) => Number(((Number(cur) || 0) + amount).toFixed(3)));
  const balanceAfter = res.value;
  await dbPatch(`topups/${t.id}`, { credited: true, creditedAt: Date.now() });
  await dbPush(`wallet_tx/${t.uid}`, {
    type: "topup",
    amount,
    balanceAfter,
    note: `شحن رصيد ${formatNo(t)} — تحويل بنكي (تحقق تلقائي)`,
    topupId: t.id,
    createdAt: Date.now(),
  });
  return balanceAfter;
}

async function approve(t, m) {
  // 1) حجز العملية البنكية — إن كانت مستخدمة لا نكمل
  const usedPath = `bank_verify/used_tx/${m.id}`;
  const { value: used, etag } = await dbGetWithEtag(usedPath);
  if (used) return false;
  const claimed = await dbPutIfMatch(usedPath, etag, {
    topupId: t.id,
    topupNo: formatNo(t),
    uid: t.uid,
    amount: m.amount,
    reference: maskReference(m.reference),
    referenceHash: m.reference ? String(m.reference).slice(-4) : "",
    senderName: maskName(m.senderName),
    txDate: m.txDate,
    receivedAt: m.receivedAt,
    usedAt: Date.now(),
  });
  if (!claimed) return false;

  // 2) تغيير حالة الطلب بكتابة شرطية (قد يكون الأدمن قبله يدوياً في الأثناء)
  const { value: fresh, etag: tEtag } = await dbGetWithEtag(`topups/${t.id}`);
  if (!fresh || fresh.status !== "verifying") {
    await dbPatch("bank_verify/used_tx", { [m.id]: null }); // تحرير الحجز
    return false;
  }
  const now = Date.now();
  const okFlip = await dbPutIfMatch(`topups/${t.id}`, tEtag, {
    ...fresh,
    status: "approved",
    verifiedAt: now,
    reviewedAt: now,
    verifiedBy: "bank-auto",
    bankTxId: m.id,
    credited: false,
  });
  if (!okFlip) {
    await dbPatch("bank_verify/used_tx", { [m.id]: null });
    return false;
  }

  // 3) إضافة الرصيد مرة واحدة
  const balanceAfter = await creditBalance({ ...fresh, id: t.id });
  await bump("verified");
  await logEvent({
    kind: "verified",
    topupId: t.id,
    topupNo: formatNo(t),
    amount: m.amount,
    reference: maskReference(m.reference),
    senderName: maskName(m.senderName),
    tookMs: now - (Number(fresh.createdAt) || now),
  });
  console.log(`[verify] approved ${formatNo(t)} amount=${m.amount}`);
  void notifyCustomer(fresh, m.amount, balanceAfter);
  return true;
}

async function expire(t) {
  const { value: fresh, etag } = await dbGetWithEtag(`topups/${t.id}`);
  if (!fresh || fresh.status !== "verifying") return;
  const now = Date.now();
  const ok = await dbPutIfMatch(`topups/${t.id}`, etag, {
    ...fresh,
    status: "expired",
    expiredAt: now,
    reviewedAt: now,
    rejectionReason: "لم يتم العثور على عملية بنكية مطابقة خلال مهلة التحقق",
  });
  if (!ok) return;
  await bump("expired");
  await logEvent({ kind: "expired", topupId: t.id, topupNo: formatNo(t), amount: Number(fresh.amount) || 0 });
  console.log(`[verify] expired ${formatNo(t)}`);
}

/** إعادة إضافة الرصيد لطلب قُبل تلقائياً لكن الخدمة توقفت قبل إتمام الإضافة. */
async function recoverUncredited() {
  const rows = await dbQuery("topups", "credited", false).catch(() => null);
  for (const [id, t] of Object.entries(rows || {})) {
    if (t?.status === "approved" && t.verifiedBy === "bank-auto") {
      const { value, etag } = await dbGetWithEtag(`topups/${id}/credited`);
      if (value === false && (await dbPutIfMatch(`topups/${id}/credited`, etag, "pending"))) {
        await creditBalance({ ...t, id }).catch((e) => console.error("[verify] recover failed", id, e?.message));
      }
    }
  }
}

/* ------------------------------ الدورة ------------------------------ */
function matches(t, m, deadline) {
  const created = Number(t.createdAt) || 0;
  if (!sameAmount(t.amount, m.amount)) return false;
  if (!sameReference(t.bankRef, m.reference)) return false;
  if (m.receivedAt < created - cfg.lookbackMs) return false;
  if (m.receivedAt > deadline + 30_000) return false;
  return true;
}

export async function tick() {
  if (ticking) return;
  ticking = true;
  try {
    const rows = await dbQuery("topups", "status", "verifying");
    const pending = Object.entries(rows || {})
      .map(([id, t]) => ({ id, ...t }))
      .filter((t) => t.verification === "bank" || t.bankRef)
      .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

    if (!pending.length) {
      await heartbeat({ pendingCount: 0, lastError: "" });
      return;
    }

    let candidates = [];
    let gmailError = "";
    try {
      const r = await loadCandidates();
      candidates = r.list;
      if (!r.connected) gmailError = "Gmail غير مرتبط";
    } catch (e) {
      gmailError = e instanceof Error ? e.message : "gmail-error";
      console.error("[verify] gmail:", gmailError);
    }

    const now = Date.now();
    for (const t of pending) {
      const deadline = Number(t.verifyDeadline) || (Number(t.createdAt) || now) + cfg.verifyWindowMs;
      let done = false;
      for (const m of candidates.sort((a, b) => a.receivedAt - b.receivedAt)) {
        if (matches(t, m, deadline)) {
          try {
            done = await approve(t, m);
          } catch (e) {
            console.error("[verify] approve failed", t.id, e?.message);
          }
          if (done) break;
        }
      }
      if (!done && now > deadline) await expire(t).catch((e) => console.error("[verify] expire failed", e?.message));
    }
    await heartbeat({ pendingCount: pending.length, lastError: gmailError });
  } catch (e) {
    console.error("[verify] tick error:", e?.message);
    await heartbeat({ lastError: e instanceof Error ? e.message : "tick-error" });
  } finally {
    ticking = false;
  }
}

/** تشغيل فوري (مثلاً بعد إنشاء طلب جديد) مع منع التكرار. */
let kickTimer = null;
export function kick() {
  clearTimeout(kickTimer);
  kickTimer = setTimeout(() => void tick(), 400);
}

export async function startLoop() {
  await recoverUncredited().catch((e) => console.error("[verify] recover:", e?.message));
  await tick();
  timer = setInterval(() => void tick(), cfg.pollMs);
}

export function stopLoop() {
  clearInterval(timer);
}

/* ------------------------------ إشعار واتساب (اختياري) ------------------------------ */
async function notifyCustomer(t, amount, balanceAfter) {
  if (!cfg.waServerUrl || !cfg.waToken || !t.phone) return;
  const money = (n) => `${(Number(n) || 0).toFixed(3)} ر.ع`;
  try {
    await fetch(cfg.waServerUrl + "/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + cfg.waToken },
      body: JSON.stringify({
        to: String(t.phone).replace(/\D/g, ""),
        message: [
          `✅ *تم شحن رصيدك في ${cfg.storeName}*`,
          `🆔 ${formatNo(t)}`,
          `💵 المبلغ المضاف: ${money(amount)}`,
          `👛 رصيدك الحالي: ${money(balanceAfter)}`,
          "",
          "تم التحقق من التحويل البنكي تلقائياً 💚",
        ].join("\n"),
      }),
    });
  } catch {
    /* اختياري */
  }
}
