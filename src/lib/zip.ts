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
