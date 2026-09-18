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

const money = (n: number) => `${(Number(n) || 0).toFixed(3)} ر.ع`;

const FILTERS: { key: TopupStatus | "all"; ar: string; en: string }[] = [
  { key: "verifying", ar: "قيد التحقق", en: "Verifying" },
  { key: "pending", ar: "قيد المراجعة", en: "Pending" },
  { key: "approved", ar: "مقبولة", en: "Approved" },
  { key: "expired", ar: "انتهت المهلة", en: "Expired" },
  { key: "rejected", ar: "مرفوضة", en: "Rejected" },
  { key: "all", ar: "الكل", en: "All" },
];

const STATUS_BADGE: Record<TopupStatus, [string, string, string]> = {
  pending: ["قيد المراجعة", "Pending", "bg-amber-500/15 text-amber-400"],
  verifying: ["قيد التحقق التلقائي", "Auto-verifying", "bg-sky-500/15 text-sky-400"],
  approved: ["تمت الإضافة", "Credited", "bg-emerald-500/15 text-emerald-400"],
  expired: ["انتهت مهلة التحقق", "Verification expired", "bg-destructive/15 text-destructive"],
  rejected: ["مرفوض", "Rejected", "bg-destructive/15 text-destructive"],
};

/** طلبات شحن الرصيد في لوحة التحكم. */
export function TopupsPanel() {
  const { lang } = useI18n();
  const [items, setItems] = useState<TopupRequest[]>([]);
  const [filter, setFilter] = useState<TopupStatus | "all">("verifying");
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
                {t.bankRef && (
                  <p>
                    {lang === "ar" ? "مرجع التحويل:" : "Transfer ref:"}{" "}
                    <span dir="ltr" className="font-tech text-foreground">
                      {t.bankRef}
                    </span>
                  </p>
                )}
                {t.verifiedAt && (
                  <p>
                    {lang === "ar" ? "وقت التحقق:" : "Verified at:"}{" "}
                    <span className="text-foreground">
                      {new Date(t.verifiedAt).toLocaleString(lang === "ar" ? "ar-OM" : "en-GB")}
                    </span>
                    {t.verifiedBy === "bank-auto" && (
                      <span className="ms-1 text-emerald-400">
                        ({lang === "ar" ? "تلقائي" : "auto"})
                      </span>
                    )}
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
                {t.status !== "approved" && (
                  <span
                    className={`inline-flex h-11 items-center rounded-xl px-4 text-sm ${STATUS_BADGE[t.status]?.[2] || ""}`}
                  >
                    {lang === "ar" ? STATUS_BADGE[t.status]?.[0] : STATUS_BADGE[t.status]?.[1]}
                  </span>
                )}
                {(t.status === "pending" || t.status === "verifying" || t.status === "expired") && (
                  <button
                    disabled={busy === t.id}
                    onClick={() => void accept(t)}
                    className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-4 font-display text-sm text-primary-foreground disabled:opacity-60"
                  >
                    <Check className="size-4" />
                    {lang === "ar"
                      ? t.status === "pending"
                        ? "قبول وإضافة الرصيد"
                        : "قبول يدوي وإضافة الرصيد"
                      : "Approve & credit"}
                  </button>
                )}
                {(t.status === "pending" || t.status === "verifying") && (
                  <button
                    disabled={busy === t.id}
                    onClick={() => void decline(t)}
                    className="inline-flex h-11 items-center gap-2 rounded-xl border border-destructive px-4 font-display text-sm text-destructive disabled:opacity-60"
                  >
                    <X className="size-4" />
                    {lang === "ar" ? "رفض" : "Reject"}
                  </button>
                )}
                {t.status === "approved" && (
                  <span className="inline-flex h-11 items-center rounded-xl bg-emerald-500/15 px-4 text-sm text-emerald-400">
                    {lang === "ar" ? "تمت الإضافة" : "Credited"}
                    {t.verifiedBy === "bank-auto" && (lang === "ar" ? " — تحقق تلقائي" : " — auto-verified")}
                  </span>
                )}
                {t.status === "rejected" && t.rejectionReason && (
                  <span className="self-center text-xs text-muted-foreground">{t.rejectionReason}</span>
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
