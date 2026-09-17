import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, Star, Trash2 } from "lucide-react";

import { useI18n } from "@/lib/i18n";
import { approveReview, deleteReview, onReviewsChange, type Review } from "@/lib/db";

const FILTERS = [
  { key: "pending", ar: "بانتظار الموافقة", en: "Pending" },
  { key: "approved", ar: "منشورة", en: "Published" },
  { key: "all", ar: "الكل", en: "All" },
] as const;

type FilterKey = (typeof FILTERS)[number]["key"];

/** مراجعة تقييمات العملاء والموافقة عليها قبل نشرها. */
export function ReviewsPanel() {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const [items, setItems] = useState<Review[]>([]);
  const [filter, setFilter] = useState<FilterKey>("pending");
  const [busy, setBusy] = useState("");

  useEffect(() => {
    let unsub = () => {};
    try {
      unsub = onReviewsChange(setItems);
    } catch {
      /* ignore */
    }
    return () => unsub();
  }, []);

  const list = useMemo(() => {
    const sorted = [...items].sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
    if (filter === "approved") return sorted.filter((r) => r.approved === true);
    if (filter === "pending") return sorted.filter((r) => r.approved !== true);
    return sorted;
  }, [items, filter]);

  async function run(id: string, fn: () => Promise<void>, msg: string) {
    setBusy(id);
    try {
      await fn();
      toast.success(msg);
    } catch (e) {
      toast.error((e as Error).message);
    }
    setBusy("");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Star className="text-primary" />
        <h2 className="font-display text-xl">{ar ? "التقييمات" : "Reviews"}</h2>
        <div className="ms-auto flex gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`h-9 rounded-xl border px-3 font-display text-xs ${
                filter === f.key ? "border-primary text-primary" : "border-border text-muted-foreground"
              }`}
            >
              {ar ? f.ar : f.en}
            </button>
          ))}
        </div>
      </div>

      {list.length === 0 && (
        <p className="rounded-2xl glass-panel p-6 text-center text-sm text-muted-foreground">
          {ar ? "لا توجد تقييمات هنا." : "Nothing here."}
        </p>
      )}

      <div className="grid gap-4">
        {list.map((r) => (
          <div key={r.id} className="rounded-2xl glass-panel p-5">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-display">{r.name}</span>
              <span className="font-display text-accent">
                {"★".repeat(Math.max(1, Math.min(5, r.rating || 5)))}
              </span>
              <span
                className={`ms-auto rounded-full px-3 py-1 font-tech text-[11px] ${
                  r.approved ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                }`}
              >
                {r.approved
                  ? ar
                    ? "منشور"
                    : "Published"
                  : ar
                    ? "بانتظار الموافقة"
                    : "Pending"}
              </span>
            </div>

            <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">{r.text}</p>
            {r.createdAt && (
              <p className="mt-2 font-tech text-[11px] text-muted-foreground">
                {new Date(r.createdAt).toLocaleString()}
              </p>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              {!r.approved && (
                <button
                  disabled={busy === r.id}
                  onClick={() =>
                    void run(r.id, () => approveReview(r.id), ar ? "تم النشر" : "Published")
                  }
                  className="inline-flex h-10 items-center gap-2 rounded-xl border border-primary px-4 font-display text-xs text-primary"
                >
                  <Check className="size-4" />
                  {ar ? "موافقة ونشر" : "Approve"}
                </button>
              )}
              <button
                disabled={busy === r.id}
                onClick={() => void run(r.id, () => deleteReview(r.id), ar ? "تم الحذف" : "Deleted")}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-destructive/50 px-4 font-display text-xs text-destructive"
              >
                <Trash2 className="size-4" />
                {ar ? "حذف" : "Delete"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
