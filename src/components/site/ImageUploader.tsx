import { useRef, useState } from "react";
import { ImagePlus, Link, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { uploadImage, getActiveCloud } from "@/lib/uploads";
import { useI18n } from "@/lib/i18n";

export function ImageUploader({
  images,
  onChange,
  folder = "nmct",
  multiple = true,
}: {
  images: string[];
  onChange: (next: string[]) => void;
  folder?: string;
  multiple?: boolean;
}) {
  const { lang } = useI18n();
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [urls, setUrls] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    const next = [...images];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) continue;
      try {
        const url = await uploadImage(file, folder);
        if (multiple) next.push(url);
        else next.splice(0, next.length, url);
      } catch (e) {
        toast.error(
          (lang === "ar" ? "فشل رفع الصورة: " : "Upload failed: ") + (e as Error).message,
        );
      }
    }
    onChange(next);
    setBusy(false);
  }

  function addPublicUrls() {
    const candidates = urls
      .split(/[\n,]+/)
      .map((value) => value.trim())
      .filter(Boolean);
    const valid = candidates.filter((value) => {
      try {
        const parsed = new URL(value);
        return parsed.protocol === "https:" || parsed.protocol === "http:";
      } catch {
        return false;
      }
    });
    if (valid.length === 0) {
      toast.error(lang === "ar" ? "أدخل رابط صورة عام صالح" : "Enter a valid public image URL");
      return;
    }
    onChange(multiple ? Array.from(new Set([...images, ...valid])) : [valid[0] as string]);
    setUrls("");
  }

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void handleFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className={`grid cursor-pointer place-items-center gap-2 rounded-2xl border-2 border-dashed p-6 text-center transition-colors ${
          over ? "border-primary bg-primary/10" : "border-border bg-background/40 hover:border-primary/60"
        }`}
      >
        {busy ? (
          <Loader2 className="size-6 animate-spin text-primary" />
        ) : (
          <ImagePlus className="size-6 text-primary" />
        )}
        <p className="font-display text-sm">
          {lang === "ar" ? "اسحب الصور هنا أو اضغط للاختيار" : "Drag images here or click to select"}
        </p>
        <p className="font-tech text-[11px] text-muted-foreground">
          {lang === "ar" ? "الرفع إلى: " : "Uploading to: "}
          {lang === "ar" ? getActiveCloud().label : getActiveCloud().labelEn}
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple={multiple}
          hidden
          onChange={(e) => {
            void handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
        <label className="relative min-w-0">
          <Link className="absolute top-1/2 size-4 -translate-y-1/2 text-muted-foreground ltr:left-3 rtl:right-3" />
          <input
            value={urls}
            onChange={(event) => setUrls(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addPublicUrls();
              }
            }}
            placeholder={
              lang === "ar"
                ? "ألصق رابط صورة عامة (يمكن إضافة روابط بلا حد)"
                : "Paste a public image URL (unlimited links)"
            }
            className="h-11 w-full rounded-xl border border-border bg-background px-10 text-sm outline-none transition-colors focus:border-primary"
          />
        </label>
        <button
          type="button"
          onClick={addPublicUrls}
          className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground transition-transform hover:scale-105"
          aria-label={lang === "ar" ? "إضافة رابط الصورة" : "Add image URL"}
        >
          <Plus className="size-5" />
        </button>
      </div>

      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((src, i) => (
            <div key={src + i} className="relative">
              <img src={src} alt="" className="size-20 rounded-xl border border-border object-cover" />
              <button
                type="button"
                onClick={() => onChange(images.filter((_, idx) => idx !== i))}
                className="absolute -top-2 grid size-6 place-items-center rounded-full bg-destructive text-destructive-foreground ltr:-right-2 rtl:-left-2"
                aria-label="remove"
              >
                <X className="size-3" />
              </button>
              {i === 0 && multiple && (
                <span className="absolute bottom-1 rounded-md bg-primary px-1.5 py-0.5 font-tech text-[9px] text-primary-foreground ltr:left-1 rtl:right-1">
                  {lang === "ar" ? "رئيسية" : "main"}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
