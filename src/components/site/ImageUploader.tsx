import { useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
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
