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

export function getDeviceId(): string {
  const store = ls();
  if (!store) return "";
  let id = store.getItem(DEVICE_KEY) || "";
  if (!id) {
    id = "dev_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10);
    store.setItem(DEVICE_KEY, id);
  }
  return id;
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
