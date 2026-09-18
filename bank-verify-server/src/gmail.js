/**
 * قراءة رسائل الإشعارات من Gmail API (قراءة فقط).
 * لا يُسجَّل محتوى أي رسالة في السجلات — نُرجع البيانات المستخرجة فقط.
 */
import { cfg } from "./config.js";
import { parseBankNotification } from "./parser.js";

const API = "https://gmail.googleapis.com/gmail/v1/users/me";

export function defaultQuery() {
  if (cfg.gmailQuery) return cfg.gmailQuery;
  const parts = ['"CREDITED"', "newer_than:2d"];
  if (cfg.gmailSender) parts.unshift(`from:${cfg.gmailSender}`);
  return parts.join(" ");
}

async function gget(accessToken, path) {
  const r = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (r.status === 401) throw new Error("gmail-unauthorized");
  if (r.status === 403) throw new Error("gmail-forbidden (تأكد من صلاحية gmail.readonly وتفعيل Gmail API)");
  if (r.status === 429) throw new Error("gmail-rate-limited");
  if (!r.ok) throw new Error("gmail: HTTP " + r.status);
  return r.json();
}

export async function listMessageIds(accessToken, q = defaultQuery(), max = 25) {
  const data = await gget(accessToken, `/messages?maxResults=${max}&q=${encodeURIComponent(q)}`);
  return (data.messages || []).map((m) => m.id);
}

const b64 = (s) => Buffer.from(String(s).replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");

function extractText(payload) {
  if (!payload) return "";
  const out = { plain: "", html: "" };
  const walk = (p) => {
    if (!p) return;
    const mime = p.mimeType || "";
    const data = p.body?.data;
    if (data && mime === "text/plain") out.plain += b64(data) + "\n";
    else if (data && mime === "text/html") out.html += b64(data) + "\n";
    (p.parts || []).forEach(walk);
  };
  walk(payload);
  if (out.plain.trim()) return out.plain;
  return out.html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

/**
 * يجلب رسالة ويحلّلها. يرجع البيانات المستخرجة فقط (بدون النص الكامل).
 * @returns {null | {id:string, receivedAt:number, amount:number, reference:string, senderName:string, txDate:string, accountTail:string}}
 */
export async function fetchParsedMessage(accessToken, id) {
  const m = await gget(accessToken, `/messages/${id}?format=full`);
  const text = extractText(m.payload) || m.snippet || "";
  const parsed = parseBankNotification(text);
  if (!parsed) return null;
  return { id, receivedAt: Number(m.internalDate) || Date.now(), ...parsed };
}
