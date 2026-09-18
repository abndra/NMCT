/** كل الإعدادات تُقرأ من Environment Variables — لا أسرار داخل الكود. */
const env = process.env;

const num = (v, d) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
};

const publicUrl = String(env.PUBLIC_URL || "").replace(/\/+$/, "");
const siteUrl = String(env.SITE_URL || "").replace(/\/+$/, "");

export const cfg = {
  port: env.PORT || 3000,
  token: env.TOKEN || "",
  encryptionKey: env.ENCRYPTION_KEY || "",

  googleClientId: env.GOOGLE_CLIENT_ID || "",
  googleClientSecret: env.GOOGLE_CLIENT_SECRET || "",
  publicUrl,
  redirectUri: env.GOOGLE_REDIRECT_URI || (publicUrl ? publicUrl + "/oauth/google/callback" : ""),
  /** أقل صلاحية تسمح بالبحث وقراءة رسائل الإشعارات (gmail.metadata لا تدعم البحث بـ q). */
  gmailScope: "https://www.googleapis.com/auth/gmail.readonly",

  siteUrl,
  allowedOrigins: [siteUrl, ...String(env.ALLOWED_ORIGINS || "").split(",")]
    .map((s) => s.trim().replace(/\/+$/, ""))
    .filter(Boolean),

  dbUrl: String(env.FIREBASE_DB_URL || "https://nmct-4d2a9-default-rtdb.firebaseio.com").replace(/\/+$/, ""),
  dbSecret: env.FIREBASE_DB_SECRET || "",
  apiKey: env.FIREBASE_API_KEY || "AIzaSyB0AOQwMAblWOcw-xYeMvTXwrdm3aoFlC4",

  verifyWindowMs: num(env.VERIFY_WINDOW_MINUTES, 3) * 60_000,
  lookbackMs: num(env.MATCH_LOOKBACK_MINUTES, 15) * 60_000,
  pollMs: num(env.POLL_INTERVAL_SECONDS, 10) * 1000,
  gmailSender: env.GMAIL_SENDER || "",
  gmailQuery: env.GMAIL_QUERY || "",

  storeName: env.STORE_NAME || "NMCT",
  waServerUrl: String(env.WA_SERVER_URL || "").replace(/\/+$/, ""),
  waToken: env.WA_TOKEN || "",
};

/** يرجع قائمة بالمتغيرات الناقصة حتى تظهر بوضوح في لوحة التحكم. */
export function missingConfig() {
  const missing = [];
  if (!cfg.token) missing.push("TOKEN");
  if (!cfg.encryptionKey) missing.push("ENCRYPTION_KEY");
  if (!cfg.googleClientId) missing.push("GOOGLE_CLIENT_ID");
  if (!cfg.googleClientSecret) missing.push("GOOGLE_CLIENT_SECRET");
  if (!cfg.redirectUri) missing.push("PUBLIC_URL أو GOOGLE_REDIRECT_URI");
  if (!cfg.dbSecret) missing.push("FIREBASE_DB_SECRET");
  return missing;
}
