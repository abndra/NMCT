/* Image hosting: ImgBB (https://api.imgbb.com). Old Cloudinary links are mapped
   to their ImgBB copies by `resolveImage` / `migrateUrl`. */
import { migrateUrl } from "./image-map";

const IMGBB_KEY =
  (import.meta.env as Record<string, string | undefined>)["VITE_IMGBB_KEY"] ??
  "464f278d4c67267cb364963bb2b20314";

export const IMAGE_HOST = {
  id: "imgbb",
  label: "ImgBB — قاعدة الصور المجانية",
  labelEn: "ImgBB free image hosting",
  hostname: "i.ibb.co",
} as const;

export async function uploadImage(file: File, folder = "nmct"): Promise<string> {
  const form = new FormData();
  form.append("image", file);
  form.append("name", `${folder}_${Date.now()}`);
  const res = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_KEY}`, { method: "POST", body: form });
  const json = (await res.json().catch(() => null)) as
    | { success?: boolean; data?: { url?: string }; error?: { message?: string } }
    | null;
  const url = json?.data?.url;
  if (!res.ok || !json?.success || !url) throw new Error(json?.error?.message || `upload failed (${res.status})`);
  return url;
}

/** Keeps old links working by swapping them for their ImgBB copy. */
export function optimize(url: string, width = 800) {
  void width;
  return migrateUrl(url);
}
