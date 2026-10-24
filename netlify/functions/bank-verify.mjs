/**
 * Netlify Function: خدمة التحقق البنكي مدمجة في نفس موقع Netlify (بديل Railway).
 * ===================================================================
 * لماذا؟ خدمة Railway كانت تتوقف (انتهاء الرصيد/النوم) فتتوقف كل عمليات التحقق
 * وتنتهي مهلة طلبات العملاء رغم أن التحويل وصل. هنا لا يوجد سيرفر يجب أن يبقى شغّالاً:
 *  - هذه الدالة تجيب على لوحة التحكم وتفحص Gmail فوراً كلما فتح العميل صفحة الانتظار
 *  - الدالة المجدولة bank-verify-cron تفحص كل دقيقة حتى لو أغلق العميل الصفحة
 *
 * المسارات تحت: https://<موقعك>/bank-api/...
 * المنطق نفسه مشترك مع مجلد bank-verify-server (مصدر واحد للكود).
 *
 * متغيرات البيئة المطلوبة في Netlify (Site configuration → Environment variables):
 *   TOKEN, ENCRYPTION_KEY, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, FIREBASE_DB_SECRET
 *   اختياري: GMAIL_SENDER (مثلاً alerts@sib.om), WA_SERVER_URL, WA_TOKEN
 */
import { cfg, missingConfig } from "../../bank-verify-server/src/config.js";
import { nonce, safeEqual, signState, verifyState } from "../../bank-verify-server/src/crypto.js";
import { dbGet, dbPatch, isAdmin, verifyIdToken } from "../../bank-verify-server/src/firebase.js";
import { defaultQuery, fetchParsedMessage, listMessageIds } from "../../bank-verify-server/src/gmail.js";
import {
  buildAuthUrl,
  disconnect,
  exchangeCode,
  fetchProfileEmail,
  getAccessToken,
  isConnected,
  saveConnection,
} from "../../bank-verify-server/src/google-oauth.js";
import { maskName, maskReference, parseBankNotification } from "../../bank-verify-server/src/parser.js";
import { tick } from "../../bank-verify-server/src/verifier.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...CORS } });
const redirect = (url) => new Response(null, { status: 302, headers: { Location: url } });

const hasToken = (req) => {
  const h = String(req.headers.get("authorization") || "");
  const given = h.startsWith("Bearer ") ? h.slice(7) : "";
  return Boolean(cfg.token && given && safeEqual(given, cfg.token));
};

/** فحص فوري مع حد أدنى بين الفحوص (حتى لا نستهلك Gmail عند فتح صفحات كثيرة). */
async function throttledTick(minGapMs = 8_000) {
  const last = Number(await dbGet("bank_verify/state/lastPollAt").catch(() => 0)) || 0;
  if (Date.now() - last < minGapMs) return false;
  await dbPatch("bank_verify/state", { lastPollAt: Date.now() }).catch(() => {});
  return tick();
}

const siteRedirect = (origin, q) => `${cfg.siteUrl || origin}/admin?${new URLSearchParams(q)}`;

export default async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const u = new URL(req.url);
  const path = u.pathname.replace(/^\/bank-api/, "").replace(/\/+$/, "") || "/";
  const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};

  try {
    /* ---------- عام ---------- */
    if (path === "/" || path === "/health")
      return json({ ok: true, service: "nmct-bank-verify (netlify)", gmailConnected: await isConnected().catch(() => false) });

    /* ---------- لوحة التحكم (بالتوكن) ---------- */
    if (path === "/status") {
      if (!hasToken(req)) return json({ ok: false, error: "unauthorized" }, 401);
      const state = (await dbGet("bank_verify/state").catch(() => null)) || {};
      return json({
        ok: true,
        tokenOk: true,
        host: "netlify",
        missingConfig: missingConfig(),
        redirectUri: cfg.redirectUri || `${u.origin}/bank-api/oauth/google/callback`,
        verifyWindowMinutes: cfg.verifyWindowMs / 60_000,
        lookbackMinutes: cfg.lookbackMs / 60_000,
        pollSeconds: 60,
        gmailQuery: defaultQuery(),
        scope: cfg.gmailScope,
        gmail: { connected: Boolean(state.gmail?.connected), email: state.gmail?.email || "", error: state.gmail?.error || "" },
        lastPollAt: state.lastPollAt || 0,
        lastError: state.lastError || "",
        stats: state.stats || { verified: 0, expired: 0 },
      });
    }

    if (path === "/oauth/google/start" && req.method === "POST") {
      if (!hasToken(req)) return json({ ok: false, error: "unauthorized" }, 401);
      const missing = missingConfig();
      if (missing.length) return json({ ok: false, error: "missing-config", missing }, 500);
      return json({ ok: true, url: buildAuthUrl(signState({ ts: Date.now(), n: nonce() })) });
    }

    if (path === "/oauth/google/callback") {
      const code = u.searchParams.get("code");
      const error = u.searchParams.get("error");
      if (error) return redirect(siteRedirect(u.origin, { gmail: "error", reason: error }));
      if (!verifyState(u.searchParams.get("state"))) return redirect(siteRedirect(u.origin, { gmail: "error", reason: "invalid-state" }));
      try {
        const tok = await exchangeCode(String(code || ""));
        if (!tok.refresh_token) return redirect(siteRedirect(u.origin, { gmail: "error", reason: "no-refresh-token" }));
        if (!String(tok.scope || "").includes("gmail.readonly"))
          return redirect(siteRedirect(u.origin, { gmail: "error", reason: "scope-denied" }));
        const email = await fetchProfileEmail(tok.access_token);
        await saveConnection({ email, refreshToken: tok.refresh_token, scope: tok.scope });
        await dbPatch("bank_verify/state", { lastError: "" }).catch(() => {});
        await tick().catch(() => {});
        return redirect(siteRedirect(u.origin, { gmail: "connected" }));
      } catch (e) {
        console.error("[oauth] callback failed:", e?.message);
        return redirect(siteRedirect(u.origin, { gmail: "error", reason: "exchange-failed" }));
      }
    }

    if (path === "/gmail/disconnect" && req.method === "POST") {
      if (!hasToken(req)) return json({ ok: false, error: "unauthorized" }, 401);
      await disconnect();
      return json({ ok: true });
    }

    if (path === "/gmail/check") {
      if (!hasToken(req)) return json({ ok: false, error: "unauthorized" }, 401);
      try {
        const at = await getAccessToken();
        if (!at) return json({ ok: false, error: "gmail-not-connected" });
        const ids = await listMessageIds(at, defaultQuery(), 10);
        const parsed = [];
        for (const id of ids) {
          const p = await fetchParsedMessage(at, id).catch(() => null);
          if (p)
            parsed.push({
              amount: p.amount,
              reference: maskReference(p.reference),
              senderName: maskName(p.senderName),
              txDate: p.txDate,
              receivedAt: p.receivedAt,
            });
        }
        return json({ ok: true, query: defaultQuery(), found: ids.length, parsed: parsed.length, sample: parsed.slice(0, 5) });
      } catch (e) {
        return json({ ok: false, error: e instanceof Error ? e.message : "check-failed" });
      }
    }

    if (path === "/verify/parse-test" && req.method === "POST") {
      if (!hasToken(req)) return json({ ok: false, error: "unauthorized" }, 401);
      const p = parseBankNotification(String(body?.text || ""));
      return json({ ok: Boolean(p), parsed: p });
    }

    /* ---------- العميل: يُستدعى عند إنشاء الطلب وكل بضع ثوانٍ أثناء الانتظار ---------- */
    if (path === "/verify/start" && req.method === "POST") {
      const { idToken, topupId } = body || {};
      if (!idToken || !topupId || !/^[\w-]{6,64}$/.test(String(topupId))) return json({ ok: false, error: "bad-request" }, 400);
      const user = await verifyIdToken(String(idToken));
      if (!user) return json({ ok: false, error: "unauthorized" }, 401);
      const t = await dbGet(`topups/${topupId}`).catch(() => null);
      if (!t || t.uid !== user.uid) return json({ ok: false, error: "not-found" }, 404);
      if (t.status !== "verifying") return json({ ok: true, status: t.status });
      const deadline = Number(t.verifyDeadline) || (Number(t.createdAt) || Date.now()) + cfg.verifyWindowMs;
      if (!t.verifyDeadline) await dbPatch(`topups/${topupId}`, { verifyDeadline: deadline });
      await throttledTick().catch((e) => console.error("[verify] tick:", e?.message));
      const after = await dbGet(`topups/${topupId}/status`).catch(() => "verifying");
      return json({ ok: true, status: after || "verifying", deadline, gmailConnected: await isConnected().catch(() => false) });
    }

    if (path === "/admin/kick" && req.method === "POST") {
      const user = await verifyIdToken(String(body?.idToken || ""));
      if (!user || !(await isAdmin(user.uid))) return json({ ok: false, error: "unauthorized" }, 401);
      await tick();
      return json({ ok: true });
    }

    return json({ ok: false, error: "not-found" }, 404);
  } catch (e) {
    console.error("[bank-verify]", e?.message || e);
    return json({ ok: false, error: "server-error" }, 500);
  }
};

export const config = { path: "/bank-api/*" };
