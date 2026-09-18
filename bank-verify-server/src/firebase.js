/**
 * Firebase Realtime Database عبر REST (بدون Admin SDK).
 * المصادقة بسر قاعدة البيانات FIREBASE_DB_SECRET — يبقى على Railway فقط.
 */
import { cfg } from "./config.js";

const url = (path, params = "") =>
  `${cfg.dbUrl}/${String(path).replace(/^\/+/, "")}.json?auth=${encodeURIComponent(cfg.dbSecret)}${params}`;

async function ok(r, what) {
  if (!r.ok) throw new Error(`${what} -> HTTP ${r.status}`);
  return r.json();
}

export const dbGet = (path, params = "") => fetch(url(path, params)).then((r) => ok(r, "GET " + path));

export const dbPatch = (path, value) =>
  fetch(url(path), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value),
  }).then((r) => ok(r, "PATCH " + path));

export const dbPut = (path, value) =>
  fetch(url(path), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value),
  }).then((r) => ok(r, "PUT " + path));

export const dbDelete = (path) => fetch(url(path), { method: "DELETE" }).then((r) => ok(r, "DELETE " + path));

/** يضيف عنصراً بمفتاح جديد (مثل push) ويرجع المفتاح. */
export async function dbPush(path, value) {
  const res = await fetch(url(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value),
  }).then((r) => ok(r, "POST " + path));
  return res?.name || "";
}

/** استعلام orderByChild/equalTo (يحتاج .indexOn في القواعد). */
export function dbQuery(path, child, value) {
  return dbGet(path, `&orderBy=${encodeURIComponent(JSON.stringify(child))}&equalTo=${encodeURIComponent(JSON.stringify(value))}`);
}

/* ---------- كتابة شرطية (compare-and-set) عبر ETag — بديل المعاملات الذرّية ---------- */
export async function dbGetWithEtag(path) {
  const r = await fetch(url(path), { headers: { "X-Firebase-ETag": "true" } });
  if (!r.ok) throw new Error(`GET ${path} -> HTTP ${r.status}`);
  return { value: await r.json(), etag: r.headers.get("etag") || "" };
}

export async function dbPutIfMatch(path, etag, value) {
  const r = await fetch(url(path), {
    method: "PUT",
    headers: { "Content-Type": "application/json", "if-match": etag },
    body: JSON.stringify(value),
  });
  if (r.status === 412) return false; // تغيّرت القيمة في الأثناء
  if (!r.ok) throw new Error(`PUT ${path} -> HTTP ${r.status}`);
  return true;
}

/** تعديل ذرّي لقيمة بإعادة المحاولة عند التعارض. يرجع القيمة الجديدة. */
export async function dbTransaction(path, fn, attempts = 6) {
  for (let i = 0; i < attempts; i++) {
    const { value, etag } = await dbGetWithEtag(path);
    const next = fn(value);
    if (next === undefined) return { committed: false, value };
    if (await dbPutIfMatch(path, etag, next)) return { committed: true, value: next };
  }
  throw new Error("transaction-conflict: " + path);
}

/* ---------- هوية المستخدم وصلاحياته ---------- */
export async function verifyIdToken(idToken) {
  if (!idToken) return null;
  const r = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(cfg.apiKey)}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken }) },
  );
  if (!r.ok) return null;
  const data = await r.json().catch(() => ({}));
  const u = data?.users?.[0];
  return u ? { uid: u.localId, email: u.email || "" } : null;
}

export async function isAdmin(uid) {
  if (!uid) return false;
  if ((await dbGet("admins/" + uid).catch(() => null)) === true) return true;
  const list = await dbGet("admin/uids").catch(() => null);
  const arr = Array.isArray(list) ? list : Object.values(list || {});
  return arr.includes(uid);
}
