/* Cloudinary multi-account image hosting (3 databases, switchable). */

export type CloudAccount = {
  id: string;
  cloudName: string;
  uploadPreset: string;
  label: string;
  labelEn: string;
};

export const CLOUD_ACCOUNTS = [
  {
    id: "ufrfxjfj",
    cloudName: "ufrfxjfj",
    uploadPreset: "vrstore",
    label: "قاعدة الصور الأولى",
    labelEn: "Image DB 1",
  },
  {
    id: "pohzou4d",
    cloudName: "pohzou4d",
    uploadPreset: "vrstore2",
    label: "قاعدة الصور الثانية",
    labelEn: "Image DB 2",
  },
  {
    id: "lk3acghf",
    cloudName: "lk3acghf",
    uploadPreset: "vrstore3",
    label: "قاعدة الصور الثالثة",
    labelEn: "Image DB 3",
  },
] as const satisfies readonly CloudAccount[];

const DEFAULT_ACCOUNT: CloudAccount = CLOUD_ACCOUNTS[2];

const ACTIVE_KEY = "gp_active_cloud";

export function getActiveCloudId() {
  try {
    const id = localStorage.getItem(ACTIVE_KEY);
    if (id && CLOUD_ACCOUNTS.some((a) => a.id === id)) return id;
  } catch {
    /* ignore */
  }
  return DEFAULT_ACCOUNT.id;
}

export function setActiveCloudId(id: string) {
  if (!CLOUD_ACCOUNTS.some((a) => a.id === id)) return false;
  try {
    localStorage.setItem(ACTIVE_KEY, id);
  } catch {
    /* ignore */
  }
  return true;
}

export function getActiveCloud(): CloudAccount {
  const id = getActiveCloudId();
  return CLOUD_ACCOUNTS.find((a) => a.id === id) ?? DEFAULT_ACCOUNT;
}

export async function uploadImage(file: File, folder = "nmct"): Promise<string> {
  const acc = getActiveCloud();
  const form = new FormData();
  form.append("file", file);
  form.append("upload_preset", acc.uploadPreset);
  form.append("folder", folder);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${acc.cloudName}/image/upload`, {
    method: "POST",
    body: form,
  });
  const json = (await res.json()) as { secure_url?: string; error?: { message?: string } };
  if (!json.secure_url) throw new Error(json.error?.message || "upload failed");
  return json.secure_url;
}

/** Cloudinary auto format/quality for faster delivery. */
export function optimize(url: string, width = 800) {
  if (!/res\.cloudinary\.com\/.+\/image\/upload\//.test(url)) return url;
  if (/\/image\/upload\/(?:[^/]*,)?f_auto/.test(url)) return url;
  return url.replace("/image/upload/", `/image/upload/f_auto,q_auto,w_${width}/`);
}
