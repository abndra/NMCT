/**
 * Google OAuth 2.0 الرسمي (Authorization Code + refresh token).
 * لا نخزّن كلمة مرور — فقط refresh token مشفّر في bank_verify/gmail.
 */
import { cfg } from "./config.js";
import { decrypt, encrypt } from "./crypto.js";
import { dbDelete, dbGet, dbPatch, dbPut } from "./firebase.js";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";

export function buildAuthUrl(state) {
  const p = new URLSearchParams({
    client_id: cfg.googleClientId,
    redirect_uri: cfg.redirectUri,
    response_type: "code",
    scope: cfg.gmailScope,
    access_type: "offline",
    prompt: "consent", // يضمن الحصول على refresh token في كل ربط
    include_granted_scopes: "false",
    state,
  });
  return `${AUTH_URL}?${p}`;
}

async function tokenRequest(body) {
  const r = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`google-token: ${data.error || r.status} ${data.error_description || ""}`.trim());
  return data;
}

export const exchangeCode = (code) =>
  tokenRequest({
    code,
    client_id: cfg.googleClientId,
    client_secret: cfg.googleClientSecret,
    redirect_uri: cfg.redirectUri,
    grant_type: "authorization_code",
  });

export const refreshAccessToken = (refreshToken) =>
  tokenRequest({
    refresh_token: refreshToken,
    client_id: cfg.googleClientId,
    client_secret: cfg.googleClientSecret,
    grant_type: "refresh_token",
  });

export async function revokeToken(token) {
  try {
    await fetch(`${REVOKE_URL}?token=${encodeURIComponent(token)}`, { method: "POST" });
  } catch {
    /* الإلغاء المحلي يكفي */
  }
}

/** users/me/profile يعمل بصلاحية gmail.readonly — لا نطلب صلاحية إضافية للبريد. */
export async function fetchProfileEmail(accessToken) {
  const r = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!r.ok) throw new Error("gmail-profile: HTTP " + r.status);
  return (await r.json()).emailAddress || "";
}

/* ---------- تخزين الربط ---------- */
export async function saveConnection({ email, refreshToken, scope }) {
  await dbPut("bank_verify/gmail", {
    email,
    scope: scope || cfg.gmailScope,
    refreshTokenEnc: encrypt(refreshToken),
    connectedAt: Date.now(),
  });
  await dbPatch("bank_verify/state/gmail", { connected: true, email, connectedAt: Date.now(), error: "" });
  cache = null;
}

export async function disconnect() {
  const conn = await dbGet("bank_verify/gmail").catch(() => null);
  if (conn?.refreshTokenEnc) {
    try {
      await revokeToken(decrypt(conn.refreshTokenEnc));
    } catch {
      /* ignore */
    }
  }
  await dbDelete("bank_verify/gmail");
  await dbPatch("bank_verify/state/gmail", { connected: false, email: "", disconnectedAt: Date.now(), error: "" });
  cache = null;
}

let cache = null; // { email, refreshToken, accessToken, expiresAt }

/** يرجع access token صالحاً (يجدده تلقائياً) أو null إذا لم يُربط Gmail. */
export async function getAccessToken() {
  if (!cache) {
    const conn = await dbGet("bank_verify/gmail").catch(() => null);
    if (!conn?.refreshTokenEnc) return null;
    cache = { email: conn.email || "", refreshToken: decrypt(conn.refreshTokenEnc), accessToken: "", expiresAt: 0 };
  }
  if (cache.accessToken && Date.now() < cache.expiresAt - 60_000) return cache.accessToken;
  try {
    const t = await refreshAccessToken(cache.refreshToken);
    cache.accessToken = t.access_token;
    cache.expiresAt = Date.now() + (Number(t.expires_in) || 3600) * 1000;
    return cache.accessToken;
  } catch (e) {
    // invalid_grant = صاحب الحساب ألغى الصلاحية من حساب Google → يجب إعادة الربط
    const msg = e instanceof Error ? e.message : "refresh-failed";
    await dbPatch("bank_verify/state/gmail", { error: msg, connected: !/invalid_grant/.test(msg) }).catch(() => {});
    if (/invalid_grant/.test(msg)) cache = null;
    throw e;
  }
}

export const isConnected = async () => Boolean(await dbGet("bank_verify/gmail/email").catch(() => null));
