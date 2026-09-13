/**
 * Device identity for guest order tracking.
 * Every browser gets a stable id stored in localStorage; each placed order
 * records that id (plus the normalized phone), so "طلباتي" can show the
 * customer's orders automatically without any login.
 */

const DEVICE_KEY = "gp_device_id";
const ORDERS_KEY = "gp_my_orders";
const PHONES_KEY = "gp_my_phones";
const LEGACY_PHONE = "gp_phone";

function ls(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

export function onlyDigits(v: unknown): string {
  return String(v ?? "").replace(/\D/g, "");
}

/** Last 8 digits — ignores country code / spaces / +968 formatting. */
export function phoneKey(v: unknown): string {
  const d = onlyDigits(v);
  return d.length > 8 ? d.slice(-8) : d;
}

const COOKIE_KEY = "nmct_did";

function readCookie(name: string): string {
  try {
    if (typeof document === "undefined") return "";
    const m = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
    return m ? decodeURIComponent(m[1] || "") : "";
  } catch {
    return "";
  }
}

function writeCookie(name: string, value: string) {
  try {
    if (typeof document === "undefined") return;
    document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${60 * 60 * 24 * 365 * 5}; SameSite=Lax`;
  } catch {
    /* ignore */
  }
}

/**
 * Stable device id, mirrored in localStorage AND a long-lived cookie so that
 * clearing one of them does not create a fresh identity.
 */
export function getDeviceId(): string {
  const store = ls();
  if (!store) return "";
  let id = store.getItem(DEVICE_KEY) || readCookie(COOKIE_KEY) || "";
  if (!id) {
    id = "dev_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10);
  }
  store.setItem(DEVICE_KEY, id);
  writeCookie(COOKIE_KEY, id);
  return id;
}

let fpCache: string | null = null;

/**
 * Browser fingerprint (hardware + canvas + locale signals). Survives clearing
 * storage and cookies, so a banned device stays banned even after a "reset".
 */
export async function getFingerprint(): Promise<string> {
  if (fpCache !== null) return fpCache;
  if (typeof window === "undefined") return "";
  try {
    const n = navigator;
    const s = window.screen;
    const parts: string[] = [
      n.userAgent,
      n.language,
      (n.languages || []).join(","),
      n.platform,
      String(n.hardwareConcurrency || ""),
      String((n as Navigator & { deviceMemory?: number }).deviceMemory || ""),
      String(n.maxTouchPoints || ""),
      `${s.width}x${s.height}x${s.colorDepth}`,
      String(window.devicePixelRatio || ""),
      Intl.DateTimeFormat().resolvedOptions().timeZone || "",
      String(new Date().getTimezoneOffset()),
    ];
    try {
      const c = document.createElement("canvas");
      c.width = 240;
      c.height = 60;
      const ctx = c.getContext("2d");
      if (ctx) {
        ctx.textBaseline = "top";
        ctx.font = "16px 'Arial'";
        ctx.fillStyle = "#f60";
        ctx.fillRect(10, 10, 100, 30);
        ctx.fillStyle = "#069";
        ctx.fillText("NMCT-ban-guard ✓ نمكت", 4, 8);
        ctx.strokeStyle = "rgba(102,204,0,0.7)";
        ctx.arc(60, 30, 20, 0, Math.PI * 1.5);
        ctx.stroke();
        parts.push(c.toDataURL());
      }
    } catch {
      /* canvas blocked */
    }
    try {
      const gl = document.createElement("canvas").getContext("webgl") as WebGLRenderingContext | null;
      const dbg = gl?.getExtension("WEBGL_debug_renderer_info");
      if (gl && dbg) {
        parts.push(String(gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL)));
        parts.push(String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)));
      }
    } catch {
      /* webgl blocked */
    }
    const data = new TextEncoder().encode(parts.join("||"));
    const hash = await crypto.subtle.digest("SHA-256", data);
    fpCache = Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .slice(0, 40);
  } catch {
    fpCache = "";
  }
  return fpCache;
}

function readList(key: string): string[] {
  const store = ls();
  if (!store) return [];
  try {
    const raw = store.getItem(key);
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(arr) ? arr.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function writeList(key: string, list: string[]) {
  const store = ls();
  if (!store) return;
  try {
    store.setItem(key, JSON.stringify(list.slice(-60)));
  } catch {
    /* ignore */
  }
}

export function getMyOrderIds(): string[] {
  return readList(ORDERS_KEY);
}

export function rememberOrderId(id: string) {
  if (!id) return;
  const list = getMyOrderIds();
  if (!list.includes(id)) writeList(ORDERS_KEY, [...list, id]);
}

export function getMyPhones(): string[] {
  const list = readList(PHONES_KEY);
  const store = ls();
  const legacy = store?.getItem(LEGACY_PHONE);
  const all = legacy ? [...list, phoneKey(legacy)] : list;
  return Array.from(new Set(all.map(phoneKey).filter((p) => p.length >= 5)));
}

export function rememberPhone(phone: string) {
  const key = phoneKey(phone);
  if (key.length < 5) return;
  const list = getMyPhones();
  if (!list.includes(key)) writeList(PHONES_KEY, [...list, key]);
  const store = ls();
  try {
    store?.setItem(LEGACY_PHONE, String(phone).trim());
  } catch {
    /* ignore */
  }
}

export function forgetPhone(phone: string) {
  const key = phoneKey(phone);
  writeList(
    PHONES_KEY,
    getMyPhones().filter((p) => p !== key),
  );
}
