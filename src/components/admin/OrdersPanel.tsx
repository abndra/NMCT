import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  MessageCircle,
  Phone,
  Search,
  Trash2,
  Truck,
  XCircle,
} from "lucide-react";
import {
  ORDER_STATUSES,
  deliverOrder,
  waNumber,
  revertOrderToPending,
  deleteOrder,
  formatOrderNo,
  onOrdersChange,
  claimAdmin,
  rejectOrder,
  restoreOrderStock,
  notifyOrderDelivered,
  notifyOrderRejected,

  statusLabel,
  type Order,
} from "@/lib/db";
import { useI18n } from "@/lib/i18n";
import { getFbAuth } from "@/lib/firebase";
import { priceText } from "@/components/site/ProductCard";

const card = "space-y-3 rounded-2xl border border-border bg-card p-4";

function tone(status: string | undefined) {
  if (status === "rejected") return "border-destructive/50 bg-destructive/10 text-destructive";
  if (status === "delivered") return "border-primary/50 bg-primary/10 text-primary";
  if (status === "pending") return "border-border bg-muted/40 text-muted-foreground";
  return "border-accent/50 bg-accent/10 text-accent";
}

function StatusIcon({ status }: { status: string | undefined }) {
  if (status === "rejected") return <XCircle className="size-4" />;
  if (status === "delivered") return <CheckCircle2 className="size-4" />;
  if (status === "shipped") return <Truck className="size-4" />;
  if (status === "pending") return <Clock className="size-4" />;
  return <CheckCircle2 className="size-4" />;
}

function waLink(phone: string | undefined, text: string) {
  return `https://wa.me/${waNumber(phone)}?text=${encodeURIComponent(text)}`;
}

/** Hands one stock unit per purchased piece to the buyer, inside the site + WhatsApp. */
async function markReceived(o: Order) {
  const { codes, missing } = await deliverOrder(o.id);
  if (missing.length) {
    toast.error(
      "لا يوجد مخزون كافٍ في لوحة التحكم لـ: " +
        missing.map((m) => `${m.productName} (${m.qty})`).join("، ") +
        " — أضف الأكواد/القطع ثم أعد التسليم.",
      { duration: 8000 },
    );
  }
  if (!codes.length) {
    toast.message("لم يتم تسليم أي محتوى رقمي لهذا الطلب.");
    return;
  }
  const r = await notifyOrderDelivered(o, codes);
  if (r.ok) toast.success("تم إرسال المحتوى الفعلي للعميل على واتساب ✅");
  else toast.error("لم تُرسل رسالة الواتساب: " + (r.error || ""));
}


export function OrdersPanel() {
  const { lang } = useI18n();
  const [orders, setOrders] = useState<Order[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string>("");
  const [fixing, setFixing] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let unsub = () => {};
    try {
      unsub = onOrdersChange(
        (items) => {
          setError("");
          setOrders(items);
        },
        (err) => setError(String(err?.message || err)),
      );
    } catch (e) {
      setError(String((e as Error)?.message || e));
    }
    return () => unsub();
  }, [reload]);

  async function fixPermissions() {
    setFixing(true);
    const uid = getFbAuth().currentUser?.uid;
    const ok = await claimAdmin(uid);
    setFixing(false);
    if (ok) {
      toast.success(lang === "ar" ? "تم تفعيل صلاحيات المدير" : "Admin access enabled");
      setReload((n) => n + 1);
    } else {
      toast.error(
        lang === "ar"
          ? "تعذّر التفعيل تلقائياً — أضف admins/<UID> = true من Firebase Console"
          : "Could not enable automatically — add admins/<UID> = true in Firebase Console",
      );
    }
  }


  const counts = useMemo(() => {
    const map: Record<string, number> = { all: orders.length };
    for (const s of ORDER_STATUSES) map[s.key] = orders.filter((o) => o.status === s.key).length;
    return map;
  }, [orders]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return orders.filter((o) => {
      if (filter !== "all" && o.status !== filter) return false;
      if (!needle) return true;
      return [
        o.customerName,
        o.phone,
        formatOrderNo(o),
        o.city,
        o.governorate,
        ...(o.items || []).map((i) => i.name),
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(needle));
    });
  }, [orders, filter, q]);

  const current = orders.find((o) => o.id === openId) || null;

  if (current) return <OrderDetail order={current} onBack={() => setOpenId(null)} />;

  const revenue = orders
    .filter((o) => o.status !== "rejected")
    .reduce((s, o) => s + (o.total || 0), 0);

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-2xl border border-destructive/50 bg-destructive/10 p-4 text-sm">
          <p className="font-display text-destructive">
            {lang === "ar"
              ? "تعذّر تحميل الطلبات — قواعد قاعدة البيانات ترفض القراءة لهذا الحساب."
              : "Orders could not load — database rules deny read for this account."}
          </p>
          <p dir="ltr" className="mt-1 break-words font-tech text-xs text-muted-foreground">
            {error}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={() => void fixPermissions()}
              disabled={fixing}
              className="rounded-xl bg-primary px-4 py-2 font-display text-primary-foreground disabled:opacity-60"
            >
              {lang === "ar" ? "تفعيل صلاحيات المدير" : "Enable admin access"}
            </button>
            <button
              onClick={() => setReload((n) => n + 1)}
              className="rounded-xl border border-border px-4 py-2 font-display"
            >
              {lang === "ar" ? "إعادة المحاولة" : "Retry"}
            </button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground" dir="ltr">
            admins/{getFbAuth().currentUser?.uid || "<UID>"} = true
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          [lang === "ar" ? "كل الطلبات" : "Total", String(orders.length)],
          [lang === "ar" ? "قيد الإنتظار" : "Pending", String(counts["pending"] ?? 0)],
          [lang === "ar" ? "قيد التوصيل" : "On the way", String(counts["shipped"] ?? 0)],
          [lang === "ar" ? "الإيرادات" : "Revenue", priceText(revenue, lang)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 font-tech text-xl text-primary">{value}</p>
          </div>
        ))}
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute inset-y-0 end-3 my-auto size-4 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={
            lang === "ar" ? "بحث برقم الطلب، الاسم، الهاتف، المنتج..." : "Search orders..."
          }
          className="h-12 w-full rounded-xl border border-border bg-background/60 px-3 pe-10 text-sm outline-none focus:border-primary"
        />
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {[
          ["all", lang === "ar" ? "الكل" : "All"],
          ...ORDER_STATUSES.map((s) => [s.key, lang === "ar" ? s.ar : s.en]),
        ].map(([k, label]) => (
          <button
            key={k}
            onClick={() => setFilter(k as string)}
            className={`h-10 shrink-0 rounded-xl border px-4 text-sm ${
              filter === k
                ? "border-primary bg-primary/15 text-primary"
                : "border-border bg-card text-muted-foreground"
            }`}
          >
            {label} ({counts[k as string] ?? 0})
          </button>
        ))}
      </div>

      {list.length === 0 && (
        <p className="py-16 text-center text-muted-foreground">
          {lang === "ar" ? "لا توجد طلبات" : "No orders"}
        </p>
      )}

      <div className="space-y-3">
        {list.map((o) => (
          <button
            key={o.id}
            onClick={() => setOpenId(o.id)}
            className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-4 text-start transition-colors hover:border-primary"
          >
            {o.items?.[0]?.image && (
              <img
                src={o.items[0].image}
                alt=""
                className="size-14 shrink-0 rounded-xl object-cover"
              />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-tech text-accent">#{formatOrderNo(o)}</span>
                <span
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] ${tone(o.status)}`}
                >
                  <StatusIcon status={o.status} />
                  {statusLabel(o.status, lang)}
                </span>
              </div>
              <p className="mt-1 truncate text-sm">
                {o.customerName} · <span dir="ltr">{o.phone}</span>
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {(o.items || []).map((i) => `${i.name} ×${i.qty}`).join(" · ")}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {new Date(o.createdAt).toLocaleString(lang === "ar" ? "ar" : "en-GB")}
              </p>
            </div>
            <div className="shrink-0 text-end">
              <p className="font-display text-primary">{priceText(o.total, lang)}</p>
              <span className="text-xs text-muted-foreground">
                {lang === "ar" ? "التفاصيل" : "Details"}
              </span>
            </div>
            {lang === "ar" ? (
              <ChevronLeft className="size-4 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

function OrderDetail({ order: o, onBack }: { order: Order; onBack: () => void }) {
  const { lang, dir } = useI18n();
  const [reason, setReason] = useState(o.rejectionReason || "");
  const [busy, setBusy] = useState(false);
  const Back = dir === "rtl" ? ArrowRight : ArrowLeft;

  async function run(fn: () => Promise<void>, msg: string) {
    setBusy(true);
    try {
      await fn();
      toast.success(msg);
    } catch {
      toast.error(lang === "ar" ? "تعذر تحديث الطلب" : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  function copy(v: string) {
    void navigator.clipboard?.writeText(v);
    toast.success(lang === "ar" ? "تم النسخ" : "Copied");
  }

  const rows: [string, string][] = [
    [lang === "ar" ? "العميل" : "Customer", o.customerName || "—"],
    [lang === "ar" ? "الهاتف" : "Phone", o.phone || "—"],
    [lang === "ar" ? "البريد" : "Email", o.email || "—"],
    [
      lang === "ar" ? "طريقة الدفع" : "Payment",
      o.paymentMethod === "cod"
        ? lang === "ar"
          ? "عند الاستلام"
          : "Cash on delivery"
        : lang === "ar"
          ? "تحويل بنكي"
          : "Bank transfer",
    ],
    [lang === "ar" ? "اسم المُحوِّل" : "Sender", o.senderName || "—"],
    [lang === "ar" ? "ملاحظة العميل" : "Note", o.note || "—"],
    [lang === "ar" ? "معرّف الجهاز" : "Device", o.deviceId || "—"],
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={onBack}
          className="inline-flex h-11 items-center gap-2 rounded-xl border border-border bg-card px-4 font-display text-sm hover:border-primary hover:text-primary"
        >
          <Back className="size-4" />
          {lang === "ar" ? "رجوع للطلبات" : "Back to orders"}
        </button>
        <span className="font-tech text-lg text-accent">#{formatOrderNo(o)}</span>
        <span
          className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs ${tone(o.status)}`}
        >
          <StatusIcon status={o.status} />
          {statusLabel(o.status, lang)}
        </span>
        <span className="ms-auto font-display text-xl text-primary">
          {priceText(o.total, lang)}
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className={card}>
          <p className="font-display text-sm">
            {lang === "ar" ? "بيانات العميل" : "Customer info"}
          </p>
          <div className="grid gap-2 text-sm">
            {rows.map(([k, v]) => (
              <div
                key={k}
                className="flex items-start justify-between gap-3 border-b border-border/60 pb-1.5"
              >
                <span className="text-xs text-muted-foreground">{k}</span>
                <span
                  className="text-end"
                  dir={k.includes("هاتف") || k === "Phone" ? "ltr" : undefined}
                >
                  {v}
                </span>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <a
              href={`tel:${o.phone}`}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-border px-3 text-xs"
            >
              <Phone className="size-3.5" /> {lang === "ar" ? "اتصال" : "Call"}
            </a>
            <a
              href={waLink(
                o.phone,
                (lang === "ar" ? "مرحباً، بخصوص طلبك رقم #" : "Hello, about your order #") +
                  formatOrderNo(o),
              )}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-accent px-3 text-xs text-accent"
            >
              <MessageCircle className="size-3.5" /> WhatsApp
            </a>
            <button
              onClick={() => copy(String(o.phone || ""))}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-border px-3 text-xs"
            >
              <Copy className="size-3.5" /> {lang === "ar" ? "نسخ الرقم" : "Copy phone"}
            </button>
          </div>
        </div>

        <div className={card}>
          <p className="font-display text-sm">{lang === "ar" ? "محتوى الطلب" : "Items"}</p>
          <div className="space-y-2">
            {(o.items || []).map((it, i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-xl border border-border/60 p-2"
              >
                {it.image && (
                  <img src={it.image} alt="" className="size-12 rounded-lg object-cover" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{it.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {priceText(it.price, lang)} × {it.qty}
                    {it.size ? ` · ${it.size}` : ""}
                  </p>
                </div>
                <span className="font-tech text-sm">{priceText(it.price * it.qty, lang)}</span>
              </div>
            ))}
          </div>
          <div className="space-y-1 border-t border-border pt-2 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>{lang === "ar" ? "المجموع" : "Subtotal"}</span>
              <span>{priceText(o.subtotal || 0, lang)}</span>
            </div>
            {!!o.discountAmount && (
              <div className="flex justify-between text-muted-foreground">
                <span>
                  {lang === "ar" ? "الخصم" : "Discount"}{" "}
                  {o.discountCode ? `(${o.discountCode})` : ""}
                </span>
                <span>−{priceText(o.discountAmount, lang)}</span>
              </div>
            )}
            <div className="flex justify-between text-muted-foreground">
              <span>{lang === "ar" ? "التوصيل" : "Delivery"}</span>
              <span>{priceText(o.deliveryFee || 0, lang)}</span>
            </div>
            <div className="flex justify-between font-display text-primary">
              <span>{lang === "ar" ? "الإجمالي" : "Total"}</span>
              <span>{priceText(o.total, lang)}</span>
            </div>
          </div>
          {o.receiptImage && (
            <a href={o.receiptImage} target="_blank" rel="noreferrer" className="block">
              <p className="mb-1 text-xs text-muted-foreground">
                {lang === "ar" ? "إيصال التحويل" : "Transfer receipt"}
              </p>
              <img
                src={o.receiptImage}
                alt="receipt"
                className="max-h-56 rounded-xl border border-border object-contain"
              />
            </a>
          )}
        </div>
      </div>

      <div className={card}>
        <p className="font-display text-sm">{lang === "ar" ? "إدارة الحالة" : "Manage status"}</p>
        <div className="flex flex-wrap gap-2">
          {ORDER_STATUSES.map((s) => (
            <button
              key={s.key}
              disabled={busy}
              onClick={() =>
                void run(
                  () =>
                    s.key === "delivered" ? markReceived(o) : revertOrderToPending(o.id),
                  (lang === "ar" ? "تم تحديث الحالة إلى " : "Status set to ") +
                    statusLabel(s.key, lang),
                )
              }
              className={`h-11 rounded-xl border px-4 text-sm ${
                o.status === s.key
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background/60 hover:border-primary"
              }`}
            >
              {lang === "ar" ? s.ar : s.en}
            </button>
          ))}
        </div>

        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={
              lang === "ar" ? "سبب الرفض (يظهر للعميل)" : "Rejection reason (shown to customer)"
            }
            className="h-12 w-full rounded-xl border border-border bg-background/60 px-3 text-sm outline-none focus:border-destructive"
          />
          <button
            disabled={busy}
            onClick={() =>
              void run(
                async () => {
                  const why = reason || (lang === "ar" ? "غير متوفر" : "Unavailable");
                  await restoreOrderStock(o.id);
                  await rejectOrder(o.id, why);
                  const r = await notifyOrderRejected(o, why);
                  if (!r.ok) toast.error("لم تُرسل رسالة الواتساب: " + (r.error || ""));
                },

                lang === "ar" ? "تم رفض الطلب" : "Order rejected",
              )
            }
            className="h-12 rounded-xl border border-destructive px-5 text-sm text-destructive"
          >
            {lang === "ar" ? "رفض الطلب" : "Reject order"}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            disabled={busy}
            onClick={() => {
              if (!window.confirm(lang === "ar" ? "حذف الطلب نهائياً؟" : "Delete this order?"))
                return;
              void run(
                async () => {
                  await deleteOrder(o.id);
                  onBack();
                },
                lang === "ar" ? "تم حذف الطلب" : "Order deleted",
              );
            }}
            className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-destructive px-4 text-sm text-destructive"
          >
            <Trash2 className="size-4" /> {lang === "ar" ? "حذف" : "Delete"}
          </button>
        </div>
      </div>

      {Array.isArray(o.statusHistory) && o.statusHistory.length > 0 && (
        <div className={card}>
          <p className="font-display text-sm">{lang === "ar" ? "سجل الحالة" : "Status log"}</p>
          <div className="space-y-1 text-xs text-muted-foreground">
            {o.statusHistory.map((h, i) => (
              <div key={i} className="flex justify-between border-b border-border/50 pb-1">
                <span>{statusLabel(h.status, lang)}</span>
                <span>{new Date(h.at).toLocaleString(lang === "ar" ? "ar" : "en-GB")}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
