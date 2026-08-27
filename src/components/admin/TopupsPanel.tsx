import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, Clock, Trash2, Wallet, X } from "lucide-react";

import { useI18n } from "@/lib/i18n";
import {
  approveTopup,
  deleteTopup,
  formatTopupNo,
  onTopupsChange,
  rejectTopup,
  type TopupRequest,
  type TopupStatus,
} from "@/lib/wallet";

const money = (n: number) => `${(Number(n) || 0).toFixed(2)} ر.ع`;

const FILTERS: { key: TopupStatus | "all"; ar: string; en: string }[] = [
  { key: "pending", ar: "قيد المراجعة", en: "Pending" },
  { key: "approved", ar: "مقبولة", en: "Approved" },
  { key: "rejected", ar: "مرفوضة", en: "Rejected" },
  { key: "all", ar: "الكل", en: "All" },
];

/** طلبات شحن الرصيد في لوحة التحكم. */
export function TopupsPanel() {
  const { lang } = useI18n();
  const [items, setItems] = useState<TopupRequest[]>([]);
  const [filter, setFilter] = useState<TopupStatus | "all">("pending");
  const [busy, setBusy] = useState("");

  useEffect(() => onTopupsChange(setItems), []);

  const list = useMemo(
    () => (filter === "all" ? items : items.filter((t) => t.status === filter)),
    [items, filter],
  );

  async function accept(t: TopupRequest) {
    setBusy(t.id);
    try {
      await approveTopup(t.id);
      toast.success(lang === "ar" ? "تم إضافة الرصيد" : "Balance added");
    } catch {
      toast.error(lang === "ar" ? "تعذر قبول الطلب" : "Could not approve");
    } finally {
      setBusy("");
    }
  }

  async function decline(t: TopupRequest) {
    const reason =
      window.prompt(lang === "ar" ? "سبب الرفض" : "Rejection reason", "") ?? null;
    if (reason === null) return;
    setBusy(t.id);
    try {
      await rejectTopup(t.id, reason);
      toast.success(lang === "ar" ? "تم رفض الطلب" : "Rejected");
    } catch {
      toast.error(lang === "ar" ? "تعذر الرفض" : "Could not reject");
    } finally {
      setBusy("");
    }
  }

  async function remove(t: TopupRequest) {
    if (!window.confirm(lang === "ar" ? "حذف الطلب نهائياً؟" : "Delete permanently?")) return;
    await deleteTopup(t.id);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`h-10 rounded-xl border px-4 font-display text-sm transition-colors ${
              filter === f.key
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {lang === "ar" ? f.ar : f.en}
            <span className="ms-2 font-tech text-xs">
              {f.key === "all" ? items.length : items.filter((t) => t.status === f.key).length}
            </span>
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          {lang === "ar" ? "لا توجد طلبات شحن." : "No top-up requests."}
        </p>
      ) : (
        <div className="grid gap-3">
          {list.map((t) => (
            <div key={t.id} className="rounded-2xl glass-panel p-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
                  <Wallet className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-display text-sm">
                    #{formatTopupNo(t)} — {t.userName || t.email || t.uid}
                  </p>
                  <p dir="ltr" className="truncate text-xs text-muted-foreground">
                    {t.phone} · {t.email}
                  </p>
                </div>
                <span className="font-display text-xl text-primary">{money(t.amount)}</span>
              </div>

              <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                <p>
                  {lang === "ar" ? "طريقة الدفع:" : "Method:"}{" "}
                  <span className="text-foreground">
                    {t.paymentMethodName || t.paymentMethod || "-"}
                  </span>
                </p>
                <p>
                  {lang === "ar" ? "المبلغ المحوَّل:" : "Paid:"}{" "}
                  <span className="text-foreground">
                    {t.amountToPay} {t.paymentCurrency}
                  </span>
                </p>
                {t.packageName && (
                  <p>
                    {lang === "ar" ? "الباقة:" : "Package:"}{" "}
                    <span className="text-foreground">{t.packageName}</span>
                  </p>
                )}
                <p className="flex items-center gap-1.5">
                  <Clock className="size-3" />
                  {new Date(t.createdAt || Date.now()).toLocaleString(
                    lang === "ar" ? "ar-OM" : "en-GB",
                  )}
                </p>
                {t.note && <p className="sm:col-span-2">🗒️ {t.note}</p>}
                {!!t.cardNumbers?.length && (
                  <p dir="ltr" className="sm:col-span-2 font-tech text-foreground">
                    🎟️ {t.cardNumbers.join(" | ")}
                  </p>
                )}
              </div>

              {!!t.receiptImages?.length && (
                <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {t.receiptImages.map((r, i) => (
                    <a key={r + i} href={r} target="_blank" rel="noreferrer">
                      <img
                        src={r}
                        alt="receipt"
                        className="h-24 w-full rounded-xl border border-border object-cover"
                      />
                    </a>
                  ))}
                </div>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                {t.status === "pending" ? (
                  <>
                    <button
                      disabled={busy === t.id}
                      onClick={() => void accept(t)}
                      className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-4 font-display text-sm text-primary-foreground disabled:opacity-60"
                    >
                      <Check className="size-4" />
                      {lang === "ar" ? "قبول وإضافة الرصيد" : "Approve & credit"}
                    </button>
                    <button
                      disabled={busy === t.id}
                      onClick={() => void decline(t)}
                      className="inline-flex h-11 items-center gap-2 rounded-xl border border-destructive px-4 font-display text-sm text-destructive disabled:opacity-60"
                    >
                      <X className="size-4" />
                      {lang === "ar" ? "رفض" : "Reject"}
                    </button>
                  </>
                ) : (
                  <span
                    className={`inline-flex h-11 items-center rounded-xl px-4 text-sm ${
                      t.status === "approved"
                        ? "bg-emerald-500/15 text-emerald-400"
                        : "bg-destructive/15 text-destructive"
                    }`}
                  >
                    {t.status === "approved"
                      ? lang === "ar"
                        ? "تمت الإضافة"
                        : "Credited"
                      : `${lang === "ar" ? "مرفوض" : "Rejected"}${t.rejectionReason ? ` — ${t.rejectionReason}` : ""}`}
                  </span>
                )}
                <button
                  onClick={() => void remove(t)}
                  className="inline-flex h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm text-muted-foreground hover:border-destructive hover:text-destructive"
                >
                  <Trash2 className="size-4" />
                  {lang === "ar" ? "حذف" : "Delete"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
