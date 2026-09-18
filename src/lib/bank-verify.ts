/**
 * نظام التحقق البنكي — الجهة الأمامية.
 * الخدمة نفسها تعمل على Railway (مجلد bank-verify-server) وتتواصل مع Firebase مباشرة.
 *
 * مسارات قاعدة البيانات:
 *  - settings/bankVerifyUrl        رابط الخدمة (عام — يستخدمه العميل لإخطار الخدمة)
 *  - admin/bankVerify {url,token}  إعداد الأدمن (يقرؤه الأدمن فقط)
 *  - bank_verify/state             حالة الخدمة + Gmail + الإحصائيات (تكتبه الخدمة)
 *  - bank_verify/log               آخر عمليات التحقق
 *  - bank_verify/used_tx           العمليات البنكية المستخدمة (مقنّعة)
 */
import { get, onValue, ref, set } from "firebase/database";
import { getDb, getFbAuth } from "./firebase";
import { normalizeWaServerUrl, type Unsub } from "./db";

export const VERIFY_WINDOW_MS = 3 * 60_000;

export type BankVerifyConfig = { url: string; token: string };

export type BankVerifyState = {
  running?: boolean;
  lastPollAt?: number;
  lastError?: string;
  pendingCount?: number;
  gmail?: { connected?: boolean; email?: string; error?: string; connectedAt?: number };
  stats?: { verified?: number; expired?: number };
};

export type BankVerifyLog = {
  id: string;
  kind: "verified" | "expired";
  topupId: string;
  topupNo: string;
  amount: number;
  reference?: string;
  senderName?: string;
  tookMs?: number;
  at: number;
};

export type UsedBankTx = {
  id: string;
  topupId: string;
  topupNo: string;
  amount: number;
  reference: string;
  senderName: string;
  txDate: string;
  receivedAt: number;
  usedAt: number;
};

const list = <T>(v: Record<string, unknown> | null): T[] =>
  Object.entries(v || {}).map(([id, x]) => ({ id, ...(x as object) }) as T);

/* ---------------- الإعدادات ---------------- */
export async function getBankVerifyConfig(): Promise<BankVerifyConfig> {
  const snap = await get(ref(getDb(), "admin/bankVerify"));
  const v = (snap.exists() ? snap.val() : {}) as Partial<BankVerifyConfig>;
  return { url: v.url || "", token: v.token || "" };
}

export async function saveBankVerifyConfig(cfg: BankVerifyConfig) {
  const url = normalizeWaServerUrl(cfg.url);
  await set(ref(getDb(), "admin/bankVerify"), { url, token: cfg.token.trim() });
  await set(ref(getDb(), "settings/bankVerifyUrl"), url);
}

export async function getBankVerifyUrl(): Promise<string> {
  try {
    const snap = await get(ref(getDb(), "settings/bankVerifyUrl"));
    return normalizeWaServerUrl(String(snap.val() || ""));
  } catch {
    return "";
  }
}

/* ---------------- الحالة (لحظياً) ---------------- */
export function onBankVerifyState(cb: (s: BankVerifyState) => void): Unsub {
  return onValue(
    ref(getDb(), "bank_verify/state"),
    (snap) => cb((snap.exists() ? snap.val() : {}) as BankVerifyState),
    () => cb({}),
  );
}
export function onBankVerifyLog(cb: (items: BankVerifyLog[]) => void): Unsub {
  return onValue(
    ref(getDb(), "bank_verify/log"),
    (snap) => cb(list<BankVerifyLog>(snap.val()).sort((a, b) => (b.at || 0) - (a.at || 0))),
    () => cb([]),
  );
}
export function onUsedBankTx(cb: (items: UsedBankTx[]) => void): Unsub {
  return onValue(
    ref(getDb(), "bank_verify/used_tx"),
    (snap) => cb(list<UsedBankTx>(snap.val()).sort((a, b) => (b.usedAt || 0) - (a.usedAt || 0))),
    () => cb([]),
  );
}

/* ---------------- استدعاء الخدمة ---------------- */
async function call<T>(cfg: BankVerifyConfig, path: string, init: RequestInit = {}): Promise<T> {
  const base = normalizeWaServerUrl(cfg.url);
  if (!base) throw new Error("no-url");
  const res = await fetch(base + path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + cfg.token,
      ...(init.headers || {}),
    },
  });
  if (res.status === 401 || res.status === 403) throw new Error("token");
  if (!res.ok) throw new Error("HTTP " + res.status);
  return (await res.json()) as T;
}

export type ServerStatus = {
  ok: boolean;
  missingConfig?: string[];
  redirectUri?: string;
  verifyWindowMinutes?: number;
  lookbackMinutes?: number;
  pollSeconds?: number;
  gmailQuery?: string;
  gmail?: { connected: boolean; email: string; error?: string };
  lastPollAt?: number;
  lastError?: string;
  stats?: { verified?: number; expired?: number };
};

export const bankServerStatus = (cfg: BankVerifyConfig) => call<ServerStatus>(cfg, "/status");

export async function bankOauthStart(cfg: BankVerifyConfig) {
  const r = await call<{ ok: boolean; url?: string; missing?: string[]; error?: string }>(cfg, "/oauth/google/start", {
    method: "POST",
    body: "{}",
  });
  if (!r.ok || !r.url) throw new Error(r.missing?.length ? "missing:" + r.missing.join(", ") : r.error || "start-failed");
  return r.url;
}

export const bankGmailDisconnect = (cfg: BankVerifyConfig) =>
  call<{ ok: boolean }>(cfg, "/gmail/disconnect", { method: "POST", body: "{}" });

export type GmailCheck = {
  ok: boolean;
  error?: string;
  query?: string;
  found?: number;
  parsed?: number;
  sample?: { amount: number; reference: string; senderName: string; txDate: string; receivedAt: number }[];
};
export const bankGmailCheck = (cfg: BankVerifyConfig) => call<GmailCheck>(cfg, "/gmail/check");

/** العميل يُخطر الخدمة بطلب جديد لتبدأ الفحص فوراً (الخدمة تفحص دورياً على أي حال). */
export async function kickBankVerification(topupId: string): Promise<{ ok: boolean; gmailConnected?: boolean }> {
  try {
    const [url, idToken] = await Promise.all([getBankVerifyUrl(), getFbAuth().currentUser?.getIdToken()]);
    if (!url || !idToken) return { ok: false };
    const res = await fetch(url + "/verify/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken, topupId }),
    });
    if (!res.ok) return { ok: false };
    return (await res.json()) as { ok: boolean; gmailConnected?: boolean };
  } catch {
    return { ok: false };
  }
}

export const omr3 = (n: number, lang: "ar" | "en" = "ar") =>
  lang === "ar" ? `${(Number(n) || 0).toFixed(3)} ر.ع` : `OMR ${(Number(n) || 0).toFixed(3)}`;
