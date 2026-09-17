import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, Clock, LifeBuoy, Trash2 } from "lucide-react";

import { useI18n } from "@/lib/i18n";
import {
  deleteSupportTicket,
  onSupportTicketsChange,
  setSupportStatus,
  type SupportStatus,
  type SupportTicket,
} from "@/lib/db";

const FILTERS: { key: SupportStatus | "all"; ar: string; en: string }[] = [
  { key: "open", ar: "مفتوحة", en: "Open" },
  { key: "done", ar: "منتهية", en: "Resolved" },
  { key: "all", ar: "الكل", en: "All" },
];

/** تذاكر الدعم الفني القادمة من صفحة الدعم. */
export function SupportPanel() {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const [items, setItems] = useState<SupportTicket[]>([]);
  const [filter, setFilter] = useState<SupportStatus | "all">("open");
  const [busy, setBusy] = useState("");

  useEffect(() => {
    let unsub = () => {};
    try {
      unsub = onSupportTicketsChange(setItems);
    } catch {
      /* ignore */
    }
    return () => unsub();
  }, []);

  const list = useMemo(
    () => (filter === "all" ? items : items.filter((t) => (t.status || "open") === filter)),
    [items, filter],
  );

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
        <LifeBuoy className="text-primary" />
        <h2 className="font-display text-xl">{ar ? "الدعم الفني" : "Support"}</h2>
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
          {ar ? "لا توجد طلبات دعم." : "No support requests."}
        </p>
      )}

      <div className="grid gap-4">
        {list.map((t) => (
          <div key={t.id} className="rounded-2xl glass-panel p-5">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-display">{t.name || (ar ? "بدون اسم" : "No name")}</span>
              <a
                href={`https://wa.me/${String(t.phone).replace(/[^\d]/g, "")}`}
                target="_blank"
                rel="noreferrer"
                dir="ltr"
                className="font-tech text-xs text-primary"
              >
                {t.phone}
              </a>
              <span className="ms-auto inline-flex items-center gap-1 font-tech text-[11px] text-muted-foreground">
                <Clock className="size-3.5" />
                {t.createdAt ? new Date(t.createdAt).toLocaleString() : ""}
              </span>
            </div>

            <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">{t.message}</p>

            {t.image && (
              <a href={t.image} target="_blank" rel="noreferrer" className="mt-3 block">
                <img
                  src={t.image}
                  alt="support"
                  className="max-h-60 rounded-xl border border-border object-contain"
                />
              </a>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              {(t.status || "open") === "open" ? (
                <button
                  disabled={busy === t.id}
                  onClick={() =>
                    void run(
                      t.id,
                      () => setSupportStatus(t.id, "done"),
                      ar ? "تم وضع علامة منتهية" : "Marked resolved",
                    )
                  }
                  className="inline-flex h-10 items-center gap-2 rounded-xl border border-primary px-4 font-display text-xs text-primary"
                >
                  <Check className="size-4" />
                  {ar ? "تمت المعالجة" : "Mark resolved"}
                </button>
              ) : (
                <button
                  disabled={busy === t.id}
                  onClick={() =>
                    void run(
                      t.id,
                      () => setSupportStatus(t.id, "open"),
                      ar ? "أُعيد فتح الطلب" : "Reopened",
                    )
                  }
                  className="inline-flex h-10 items-center gap-2 rounded-xl border border-border px-4 font-display text-xs"
                >
                  {ar ? "إعادة فتح" : "Reopen"}
                </button>
              )}
              <button
                disabled={busy === t.id}
                onClick={() =>
                  void run(t.id, () => deleteSupportTicket(t.id), ar ? "تم الحذف" : "Deleted")
                }
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
