/* Tiny store-only (no compression) ZIP writer — used to download the WhatsApp server files.
 *
 * IMPORTANT: file contents are embedded at build time with Vite `?raw` imports,
 * so the downloaded ZIP always contains the real source code (previously it
 * fetched /whatsapp-server/* at runtime and received the SPA index.html
 * fallback, producing a broken/empty archive).
 */

import waIndexJs from "../../whatsapp-server/index.js?raw";
import waPackageJson from "../../whatsapp-server/package.json?raw";
import waReadme from "../../whatsapp-server/README.md?raw";
import waRailwayJson from "../../whatsapp-server/railway.json?raw";
import waProcfile from "../../whatsapp-server/Procfile?raw";
import waGitignore from "../../whatsapp-server/gitignore.txt?raw";

import bvServer from "../../bank-verify-server/server.js?raw";
import bvPackage from "../../bank-verify-server/package.json?raw";
import bvReadme from "../../bank-verify-server/README.md?raw";
import bvRailway from "../../bank-verify-server/railway.json?raw";
import bvProcfile from "../../bank-verify-server/Procfile?raw";
import bvGitignore from "../../bank-verify-server/gitignore.txt?raw";
import bvEnvExample from "../../bank-verify-server/env.example.txt?raw";
import bvConfig from "../../bank-verify-server/src/config.js?raw";
import bvCrypto from "../../bank-verify-server/src/crypto.js?raw";
import bvFirebase from "../../bank-verify-server/src/firebase.js?raw";
import bvGmail from "../../bank-verify-server/src/gmail.js?raw";
import bvOauth from "../../bank-verify-server/src/google-oauth.js?raw";
import bvParser from "../../bank-verify-server/src/parser.js?raw";
import bvRoutes from "../../bank-verify-server/src/routes.js?raw";
import bvVerifier from "../../bank-verify-server/src/verifier.js?raw";

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function makeZip(files: { name: string; content: string }[]): Blob {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  const u32 = (n: number) => new Uint8Array([n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255]);
  const u16 = (n: number) => new Uint8Array([n & 255, (n >>> 8) & 255]);
  const join = (parts: Uint8Array[]) => {
    const len = parts.reduce((s, p) => s + p.length, 0);
    const out = new Uint8Array(len);
    let o = 0;
    for (const p of parts) {
      out.set(p, o);
      o += p.length;
    }
    return out;
  };

  for (const f of files) {
    const name = enc.encode(f.name);
    const data = enc.encode(f.content);
    const crc = crc32(data);
    const local = join([
      u32(0x04034b50),
      u16(20),
      u16(0x0800), // UTF-8 filenames
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(data.length),
      u32(data.length),
      u16(name.length),
      u16(0),
      name,
      data,
    ]);
    chunks.push(local);
    central.push(
      join([
        u32(0x02014b50),
        u16(20),
        u16(20),
        u16(0x0800),
        u16(0),
        u16(0),
        u16(0),
        u32(crc),
        u32(data.length),
        u32(data.length),
        u16(name.length),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(0),
        u32(offset),
        name,
      ]),
    );
    offset += local.length;
  }

  const centralBytes = join(central);
  const end = join([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(files.length),
    u16(files.length),
    u32(centralBytes.length),
    u32(offset),
    u16(0),
  ]);
  return new Blob([join(chunks), centralBytes, end], { type: "application/zip" });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** الملفات الحقيقية للسيرفر — مضمّنة في البناء (لا تعتمد على أي طلب شبكة). */
export function whatsappServerFiles(): { name: string; content: string }[] {
  return [
    { name: "index.js", content: waIndexJs },
    { name: "package.json", content: waPackageJson },
    { name: "README.md", content: waReadme },
    { name: "railway.json", content: waRailwayJson },
    { name: "Procfile", content: waProcfile },
    { name: ".gitignore", content: waGitignore },
  ].filter((f) => f.content && f.content.trim().length > 0);
}

/** Downloads whatsapp-server/* as one ZIP ready to push to GitHub. */
export async function downloadWhatsappServerZip() {
  const files = whatsappServerFiles();
  if (files.length < 3 || !files[0]!.content.includes("express")) throw new Error("server-files-missing");
  downloadBlob(makeZip(files), "whatsapp-server.zip");
}

/** ملفات خدمة التحقق البنكي (Railway) — مضمّنة في البناء. */
export function bankVerifyServerFiles(): { name: string; content: string }[] {
  return [
    { name: "server.js", content: bvServer },
    { name: "package.json", content: bvPackage },
    { name: "README.md", content: bvReadme },
    { name: "railway.json", content: bvRailway },
    { name: "Procfile", content: bvProcfile },
    { name: ".gitignore", content: bvGitignore },
    { name: ".env.example", content: bvEnvExample },
    { name: "src/config.js", content: bvConfig },
    { name: "src/crypto.js", content: bvCrypto },
    { name: "src/firebase.js", content: bvFirebase },
    { name: "src/gmail.js", content: bvGmail },
    { name: "src/google-oauth.js", content: bvOauth },
    { name: "src/parser.js", content: bvParser },
    { name: "src/routes.js", content: bvRoutes },
    { name: "src/verifier.js", content: bvVerifier },
  ].filter((f) => f.content && f.content.trim().length > 0);
}

/** تحميل ملفات نظام التحقق البنكي كـ ZIP جاهز للرفع على GitHub ثم Railway. */
export async function downloadBankVerifyServerZip() {
  const files = bankVerifyServerFiles();
  if (files.length < 10 || !files[0]!.content.includes("express")) throw new Error("server-files-missing");
  downloadBlob(makeZip(files), "nmct-bank-verify-server.zip");
}
