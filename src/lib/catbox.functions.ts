import { createServerFn } from "@tanstack/react-start";

/** Free public image host (catbox.moe): no account, no key, permanent public links. */
export const uploadToCatbox = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => {
    if (!(data instanceof FormData)) throw new Error("FormData required");
    const file = data.get("file");
    if (!(file instanceof File)) throw new Error("file required");
    if (!file.type.startsWith("image/")) throw new Error("images only");
    return file;
  })
  .handler(async ({ data: file }) => {
    const form = new FormData();
    form.append("reqtype", "fileupload");
    form.append("fileToUpload", file, file.name || "image.jpg");
    const res = await fetch("https://catbox.moe/user/api.php", { method: "POST", body: form });
    const text = (await res.text()).trim();
    if (!res.ok || !text.startsWith("https://")) throw new Error("upload failed");
    return { url: text };
  });
