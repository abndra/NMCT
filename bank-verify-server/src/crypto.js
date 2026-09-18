import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cfg } from "./config.js";

/** مفتاح 32 بايت من ENCRYPTION_KEY (hex أو أي نص — يُشتق منه sha256). */
function key() {
  const raw = cfg.encryptionKey;
  if (/^[0-9a-f]{64}$/i.test(raw)) return Buffer.from(raw, "hex");
  return createHash("sha256").update(raw).digest();
}

/** تشفير AES-256-GCM — يُستخدم لحفظ refresh token في قاعدة البيانات. */
export function encrypt(text) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(String(text), "utf8"), c.final()]);
  return [iv.toString("base64"), c.getAuthTag().toString("base64"), enc.toString("base64")].join(".");
}

export function decrypt(payload) {
  const [iv, tag, data] = String(payload || "").split(".");
  if (!iv || !tag || !data) throw new Error("bad-cipher-text");
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(data, "base64")), d.final()]).toString("utf8");
}

/** توقيع state الخاص بـ OAuth حتى لا يُقبل callback مزوّر. */
export function signState(obj) {
  const body = Buffer.from(JSON.stringify(obj)).toString("base64url");
  const sig = createHmac("sha256", cfg.token).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyState(state, maxAgeMs = 10 * 60_000) {
  const [body, sig] = String(state || "").split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", cfg.token).update(body).digest("base64url");
  if (!safeEqual(sig, expected)) return null;
  try {
    const obj = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!obj?.ts || Date.now() - obj.ts > maxAgeMs) return null;
    return obj;
  } catch {
    return null;
  }
}

export function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

export const nonce = () => randomBytes(12).toString("hex");
