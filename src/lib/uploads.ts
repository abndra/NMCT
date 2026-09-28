/* Public, keyless image hosting. Existing image URLs remain valid. */
export const IMAGE_HOST = {
  id: "img402-public",
  label: "الاستضافة العامة المجانية",
  labelEn: "Free public image hosting",
  hostname: "i.img402.dev",
} as const;

export async function uploadImage(file: File, folder = "nmct"): Promise<string> {
  void folder;
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("https://img402.dev/api/free", {
    method: "POST",
    body: form,
  });
  const json = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
  if (!res.ok || !json?.url || !/^https:\/\/i\.img402\.dev\//.test(json.url)) {
    throw new Error(json?.error || `upload failed (${res.status})`);
  }
  return json.url;
}

/** Cloudinary auto format/quality for faster delivery. */
export function optimize(url: string, width = 800) {
  if (!/res\.cloudinary\.com\/.+\/image\/upload\//.test(url)) return url;
  if (/\/image\/upload\/(?:[^/]*,)?f_auto/.test(url)) return url;
  return url.replace("/image/upload/", `/image/upload/f_auto,q_auto,w_${width}/`);
}
