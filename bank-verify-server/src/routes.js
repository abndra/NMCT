import { Router } from "express";
import { cfg, missingConfig } from "./config.js";
import { nonce, safeEqual, signState, verifyState } from "./crypto.js";
import { dbGet, dbPatch, isAdmin, verifyIdToken } from "./firebase.js";
import { defaultQuery, listMessageIds, fetchParsedMessage } from "./gmail.js";
import { buildAuthUrl, disconnect, exchangeCode, fetchProfileEmail, getAccessToken, isConnected, saveConnection } from "./google-oauth.js";
import { maskName, maskReference, parseBankNotification } from "./parser.js";
import { kick } from "./verifier.js";

export const router = Router();

/* ---------- حماية: توكن مشترك مع لوحة التحكم ---------- */
function requireToken(req, res, next) {
  const h = String(req.headers.authorization || "");
  const given = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (!cfg.token || !given || !safeEqual(given, cfg.token)) return res.status(401).json({ ok: false, error: "unauthorized" });
  next();
}

const siteRedirect = (q) => `${cfg.siteUrl || ""}/admin?${new URLSearchParams(q)}`;

/* ---------- عام ---------- */
router.get("/", (_req, res) => res.json({ ok: true, service: "nmct-bank-verify" }));
router.get("/health", async (_req, res) => {
  res.json({ ok: true, service: "nmct-bank-verify", gmailConnected: await isConnected().catch(() => false) });
});

/* ---------- لوحة التحكم (بالتوكن) ---------- */
router.get("/status", requireToken, async (_req, res) => {
  const state = (await dbGet("bank_verify/state").catch(() => null)) || {};
  res.json({
    ok: true,
    tokenOk: true,
    missingConfig: missingConfig(),
    redirectUri: cfg.redirectUri,
    verifyWindowMinutes: cfg.verifyWindowMs / 60_000,
    lookbackMinutes: cfg.lookbackMs / 60_000,
    pollSeconds: cfg.pollMs / 1000,
    gmailQuery: defaultQuery(),
    scope: cfg.gmailScope,
    gmail: { connected: Boolean(state.gmail?.connected), email: state.gmail?.email || "", error: state.gmail?.error || "" },
    lastPollAt: state.lastPollAt || 0,
    lastError: state.lastError || "",
    stats: state.stats || { verified: 0, expired: 0 },
  });
});

/** يرجع رابط موافقة Google — لوحة التحكم تحوّل المتصفح إليه. */
router.post("/oauth/google/start", requireToken, (_req, res) => {
  const missing = missingConfig();
  if (missing.length) return res.status(500).json({ ok: false, error: "missing-config", missing });
  const state = signState({ ts: Date.now(), n: nonce() });
  res.json({ ok: true, url: buildAuthUrl(state) });
});

/** Google يعود إلى هنا بعد الموافقة. */
router.get("/oauth/google/callback", async (req, res) => {
  const { code, state, error } = req.query;
  if (error) return res.redirect(siteRedirect({ gmail: "error", reason: String(error) }));
  if (!verifyState(state)) return res.redirect(siteRedirect({ gmail: "error", reason: "invalid-state" }));
  try {
    const tok = await exchangeCode(String(code || ""));
    if (!tok.refresh_token) return res.redirect(siteRedirect({ gmail: "error", reason: "no-refresh-token" }));
    if (!String(tok.scope || "").includes("gmail.readonly"))
      return res.redirect(siteRedirect({ gmail: "error", reason: "scope-denied" }));
    const email = await fetchProfileEmail(tok.access_token);
    await saveConnection({ email, refreshToken: tok.refresh_token, scope: tok.scope });
    kick();
    res.redirect(siteRedirect({ gmail: "connected" }));
  } catch (e) {
    console.error("[oauth] callback failed:", e?.message);
    res.redirect(siteRedirect({ gmail: "error", reason: "exchange-failed" }));
  }
});

router.post("/gmail/disconnect", requireToken, async (_req, res) => {
  await disconnect();
  res.json({ ok: true });
});

/** فحص تجريبي: هل نستطيع قراءة إشعارات البنك؟ يرجع أعداداً وبيانات مقنّعة فقط. */
router.get("/gmail/check", requireToken, async (_req, res) => {
  try {
    const at = await getAccessToken();
    if (!at) return res.json({ ok: false, error: "gmail-not-connected" });
    const ids = await listMessageIds(at, defaultQuery(), 10);
    const parsed = [];
    for (const id of ids) {
      const p = await fetchParsedMessage(at, id).catch(() => null);
      if (p) parsed.push({ amount: p.amount, reference: maskReference(p.reference), senderName: maskName(p.senderName), txDate: p.txDate, receivedAt: p.receivedAt });
    }
    res.json({ ok: true, query: defaultQuery(), found: ids.length, parsed: parsed.length, sample: parsed.slice(0, 5) });
  } catch (e) {
    res.json({ ok: false, error: e instanceof Error ? e.message : "check-failed" });
  }
});

/** اختبار المحلّل على نص رسالة (لا يُخزَّن شيء). */
router.post("/verify/parse-test", requireToken, (req, res) => {
  const p = parseBankNotification(String(req.body?.text || ""));
  res.json({ ok: Boolean(p), parsed: p });
});

/* ---------- العميل: بدء التحقق فوراً بعد إنشاء الطلب ---------- */
router.post("/verify/start", async (req, res) => {
  const { idToken, topupId } = req.body || {};
  if (!idToken || !topupId || !/^[\w-]{6,64}$/.test(String(topupId))) return res.status(400).json({ ok: false, error: "bad-request" });
  const user = await verifyIdToken(String(idToken));
  if (!user) return res.status(401).json({ ok: false, error: "unauthorized" });
  const t = await dbGet(`topups/${topupId}`).catch(() => null);
  if (!t || t.uid !== user.uid) return res.status(404).json({ ok: false, error: "not-found" });
  if (t.status !== "verifying") return res.json({ ok: true, status: t.status });
  const deadline = Number(t.verifyDeadline) || (Number(t.createdAt) || Date.now()) + cfg.verifyWindowMs;
  if (!t.verifyDeadline) await dbPatch(`topups/${topupId}`, { verifyDeadline: deadline });
  kick();
  res.json({ ok: true, status: "verifying", deadline, gmailConnected: await isConnected().catch(() => false) });
});

/* ---------- أدوات إدارية بحساب الأدمن (idToken) ---------- */
router.post("/admin/kick", async (req, res) => {
  const user = await verifyIdToken(String(req.body?.idToken || ""));
  if (!user || !(await isAdmin(user.uid))) return res.status(401).json({ ok: false, error: "unauthorized" });
  kick();
  res.json({ ok: true });
});
