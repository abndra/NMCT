import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  PackageSearch,
  Clock,
  CheckCircle2,
  Truck,
  XCircle,
  MapPin,
  Phone,
  CreditCard,
  ChevronDown,
  Copy,
  Check,
  Download,

} from "lucide-react";
import { toast } from "sonner";
import { Layout } from "@/components/site/Layout";
import { useAuth, GoogleMark } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useCurrency } from "@/lib/currency";
import { onMyOrdersChange, formatOrderNo, statusLabel, ORDER_STATUSES, type Order } from "@/lib/db";
import { getDeviceId, getMyOrderIds } from "@/lib/device";
import { priceText } from "@/components/site/ProductCard";

export const Route = createFileRoute("/orders")({
  head: () => ({
    meta: [
      { title: "طلباتي | NMCT" },
      { name: "description", content: "تابع حالة طلباتك في NMCT لحظة بلحظة." },
      { property: "og:title", content: "طلباتي | NMCT" },
      { property: "og:description", content: "تابع حالة طلباتك في NMCT لحظة بلحظة." },
    ],
  }),
  component: OrdersPage,
});

const FLOW = ["pending", "delivered"] as const;

function statusTone(status: string | undefined) {
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

function OrdersPage() {
  const { t, lang } = useI18n();
  const { fmt } = useCurrency();
  const { user, promptLogin } = useAuth();
  const [device, setDevice] = useState("");
  const [ids, setIds] = useState<string[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [tab, setTab] = useState<"all" | "active" | "done">("all");
  const [copied, setCopied] = useState<string | null>(null);

  function copyOne(value: string, key: string) {
    if (!value) return;
    void navigator.clipboard?.writeText(value);
    setCopied(key);
    toast.success(lang === "ar" ? "تم النسخ" : "Copied");
    setTimeout(() => setCopied(null), 1500);
  }

  function copyAll(o: Order) {
    const lines = (o.deliveredCodes || []).map((d) =>
      [d.productName, d.code || d.image || ""].filter(Boolean).join(": "),
    );
    const text = [`${formatOrderNo(o)}`, ...lines].join("\n");
    void navigator.clipboard?.writeText(text);
    setCopied(o.id);
    toast.success(lang === "ar" ? "تم نسخ محتوى الطلب" : "Order content copied");
    setTimeout(() => setCopied(null), 1500);
  }


  useEffect(() => {
    setDevice(getDeviceId());
    setIds(getMyOrderIds());
  }, []);

  useEffect(() => {
    if (!device) return;
    let unsub = () => {};
    try {
      unsub = onMyOrdersChange({ deviceId: device, orderIds: ids, uid: user?.uid || "" }, (items) => {
        setOrders(items);
        setReady(true);
      });
    } catch {
      setReady(true);
    }
    return () => unsub();
  }, [device, ids, user?.uid]);

  const list = useMemo(() => {
    if (tab === "active")
      return orders.filter((o) => o.status !== "delivered" && o.status !== "rejected");
    if (tab === "done")
      return orders.filter((o) => o.status === "delivered" || o.status === "rejected");
    return orders;
  }, [orders, tab]);

  return (
    <Layout>
      <section className="mx-auto max-w-4xl px-4 py-12">
        <h1 className="font-display text-4xl">{t("trackOrders")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {lang === "ar"
            ? "طلباتك تظهر تلقائياً حسب هذا الجهاز، وإذا سجّلت الدخول بحساب جوجل ستظهر في أي جهاز."
            : "Your orders appear automatically for this device, and on any device when you sign in with Google."}
        </p>

        {!user && (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card/60 p-4">
            <p className="text-sm text-muted-foreground">
              {lang === "ar"
                ? "سجّل الدخول بحساب جوجل لعرض كل طلباتك وأكوادك."
                : "Sign in with Google to see all your orders and codes."}
            </p>
            <button
              onClick={promptLogin}
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-border bg-background px-4 font-display text-sm hover:border-primary"
            >
              <GoogleMark className="size-4" />
              {lang === "ar" ? "تسجيل الدخول" : "Sign in"}
            </button>
          </div>
        )}

        <div className="mt-5 flex gap-2">
          {(
            [
              ["all", lang === "ar" ? "الكل" : "All"],
              ["active", lang === "ar" ? "جارية" : "Active"],
              ["done", lang === "ar" ? "منتهية" : "Finished"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`h-10 rounded-xl border px-4 text-sm ${
                tab === k
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-border bg-card text-muted-foreground"
              }`}
            >
              {label} {k === "all" ? `(${orders.length})` : ""}
            </button>
          ))}
        </div>

        {ready && list.length === 0 ? (
          <div className="py-24 text-center">
            <PackageSearch className="mx-auto size-10 text-muted-foreground" />
            <p className="mt-3 text-muted-foreground">
              {lang === "ar" ? "لا توجد طلبات حتى الآن" : "No orders yet"}
            </p>
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            {list.map((o) => {
              const expanded = open === o.id;
              const step = FLOW.indexOf((o.status || "pending") as (typeof FLOW)[number]);
              return (
                <div key={o.id} className="rounded-2xl glass-panel p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="font-tech text-accent">#{formatOrderNo(o)}</span>
                      <p className="text-xs text-muted-foreground">
                        {new Date(o.createdAt).toLocaleString(lang === "ar" ? "ar" : "en-GB")}
                      </p>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${statusTone(o.status)}`}
                    >
                      <StatusIcon status={o.status} />
                      {statusLabel(o.status, lang)}
                    </span>
                  </div>

                  {/* timeline */}
                  {o.status !== "rejected" && (
                    <div className="mt-4 flex items-center gap-1">
                      {FLOW.map((s, i) => (
                        <div key={s} className="flex-1">
                          <div
                            className={`h-1.5 rounded-full ${i <= step ? "bg-primary" : "bg-border"}`}
                          />
                          <p
                            className={`mt-1.5 truncate text-[10px] ${i <= step ? "text-primary" : "text-muted-foreground"}`}
                          >
                            {statusLabel(s, lang)}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}

                  {o.status === "rejected" && o.rejectionReason && (
                    <p className="mt-3 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
                      {lang === "ar" ? "سبب الرفض: " : "Reason: "}
                      {o.rejectionReason}
                    </p>
                  )}

                  <div className="mt-4 space-y-2">
                    {o.items?.map((it, i) => (
                      <div key={i} className="flex items-center gap-3 text-sm">
                        {it.image && (
                          <img src={it.image} alt="" className="size-12 rounded-lg object-cover" />
                        )}
                        <span className="flex-1 truncate text-muted-foreground">
                          {it.name} × {it.qty}
                          {it.size ? ` · ${it.size}` : ""}
                        </span>
                        <span className="font-tech">{fmt(it.price * it.qty)}</span>
                      </div>
                    ))}
                  </div>

                  <div className="mt-3 flex justify-between border-t border-border pt-3 font-display">
                    <span>{t("total")}</span>
                    <span className="text-primary">{fmt(o.total)}</span>
                  </div>

                  {Array.isArray(o.deliveredCodes) && o.deliveredCodes.length > 0 && (
                    <div className="mt-4 space-y-2 rounded-xl border border-primary/40 bg-primary/5 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-display text-sm text-primary">
                          {lang === "ar" ? "محتوى طلبك" : "Your delivered items"}
                        </p>
                        <button
                          onClick={() => copyAll(o)}
                          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-primary/50 px-3 text-xs text-primary"
                        >
                          {copied === o.id ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                          {lang === "ar" ? "نسخ الكل" : "Copy all"}
                        </button>
                      </div>
                      {o.deliveredCodes.map((d, i) => (
                        <div
                          key={i}
                          className="space-y-2 rounded-lg border border-border/70 bg-background/60 p-2 text-xs"
                        >
                          <p className="text-muted-foreground">{d.productName}</p>
                          {d.image ? (
                            <div className="space-y-2">
                              <a href={d.image} target="_blank" rel="noreferrer">
                                <img
                                  src={d.image}
                                  alt={d.productName}
                                  className="max-h-64 rounded-lg border border-border object-contain"
                                />
                              </a>
                              <div className="flex flex-wrap gap-2">
                                <a
                                  href={d.image}
                                  download={`${formatOrderNo(o)}-${i + 1}.jpg`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-primary/50 px-3 text-primary"
                                >
                                  <Download className="size-3.5" />
                                  {lang === "ar" ? "تحميل الصورة" : "Download image"}
                                </a>
                                <button
                                  onClick={() => copyOne(d.image || "", `${o.id}-${i}`)}
                                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3"
                                >
                                  {copied === `${o.id}-${i}` ? (
                                    <Check className="size-3.5" />
                                  ) : (
                                    <Copy className="size-3.5" />
                                  )}
                                  {lang === "ar" ? "نسخ الرابط" : "Copy link"}
                                </button>
                              </div>
                            </div>
                          ) : null}
                          {d.code
                            ? (() => {
                                const lines = d.code
                                  .split(/\r?\n/)
                                  .map((l) => l.trim())
                                  .filter(Boolean);
                                return (
                                  <div className="space-y-2">
                                    {lines.map((line, li) => {
                                      const k = `${o.id}-${i}-${li}`;
                                      return (
                                        <div key={li} className="flex items-stretch gap-2">
                                          <button
                                            onClick={() => copyOne(line, k)}
                                            dir="ltr"
                                            className="flex-1 break-all rounded-lg border border-primary/40 bg-primary/10 p-2 text-start font-tech text-primary"
                                          >
                                            {line}
                                          </button>
                                          <button
                                            onClick={() => copyOne(line, k)}
                                            aria-label={lang === "ar" ? "نسخ" : "Copy"}
                                            className="grid w-10 place-items-center rounded-lg border border-primary/40 text-primary"
                                          >
                                            {copied === k ? (
                                              <Check className="size-4" />
                                            ) : (
                                              <Copy className="size-4" />
                                            )}
                                          </button>
                                        </div>
                                      );
                                    })}
                                    {lines.length > 1 && (
                                      <button
                                        onClick={() => copyOne(lines.join("\n"), `${o.id}-${i}-all`)}
                                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-[11px]"
                                      >
                                        {copied === `${o.id}-${i}-all` ? (
                                          <Check className="size-3.5" />
                                        ) : (
                                          <Copy className="size-3.5" />
                                        )}
                                        {lang === "ar" ? "نسخ كل الأسطر" : "Copy all lines"}
                                      </button>
                                    )}
                                  </div>
                                );
                              })()
                            : null}

                        </div>
                      ))}

                    </div>
                  )}

                  <button
                    onClick={() => setOpen(expanded ? null : o.id)}
                    className="mt-3 inline-flex items-center gap-1 text-xs text-accent"
                  >
                    <ChevronDown
                      className={`size-4 transition-transform ${expanded ? "rotate-180" : ""}`}
                    />
                    {lang === "ar" ? "تفاصيل الطلب" : "Order details"}
                  </button>

                  {expanded && (
                    <div className="mt-3 grid gap-2 rounded-xl border border-border/70 bg-background/40 p-3 text-xs text-muted-foreground sm:grid-cols-2">
                      <span className="flex items-center gap-1.5">
                        <Phone className="size-3.5" /> <span dir="ltr">{o.phone}</span>
                      </span>
                      <span className="flex items-center gap-1.5">
                        <CreditCard className="size-3.5" />
                        {(o as { paymentMethodName?: string }).paymentMethodName ||
                          (o.paymentMethod === "cod"
                            ? lang === "ar"
                              ? "الدفع عند الاستلام"
                              : "Cash on delivery"
                            : o.paymentMethod === "binance"
                              ? "Binance — USDT"
                              : lang === "ar"
                                ? "تحويل بنكي"
                                : "Bank transfer")}
                      </span>

                      <span className="flex items-center gap-1.5 sm:col-span-2">
                        <MapPin className="size-3.5" />
                        {lang === "ar" ? "تسليم داخل الموقع" : "In-site delivery"}
                      </span>
                      {!!o.deliveryFee && (
                        <span>
                          {lang === "ar" ? "التوصيل" : "Delivery"}: {fmt(o.deliveryFee)}
                        </span>
                      )}
                      {!!o.discountAmount && (
                        <span>
                          {lang === "ar" ? "الخصم" : "Discount"}: −
                          {fmt(o.discountAmount)}
                        </span>
                      )}
                      {o.note && (
                        <span className="sm:col-span-2">
                          {lang === "ar" ? "ملاحظة" : "Note"}: {o.note}
                        </span>
                      )}
                      {Array.isArray(o.statusHistory) && o.statusHistory.length > 0 && (
                        <div className="sm:col-span-2">
                          <p className="mb-1 font-display text-foreground">
                            {lang === "ar" ? "سجل الحالة" : "Status log"}
                          </p>
                          {o.statusHistory.map((h, i) => (
                            <p key={i}>
                              {statusLabel(h.status, lang)} ·{" "}
                              {new Date(h.at).toLocaleString(lang === "ar" ? "ar" : "en-GB")}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <p className="mt-10 text-center text-[11px] text-muted-foreground">
          {ORDER_STATUSES.map((s) => statusLabel(s.key, lang)).join(" • ")}
        </p>
      </section>
    </Layout>
  );
}
