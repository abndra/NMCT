import { createFileRoute, useNavigate, useRouter, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  ArrowRight,
  ArrowLeft,
  BadgePercent,
  Check,
  Plus,
  User,
  Wallet,
  Zap,
} from "lucide-react";

import { Layout } from "@/components/site/Layout";
import { useCart } from "@/lib/cart";
import { useAuth, GoogleMark } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useCurrency, toUsdt, toOoredoo, OMR_TO_USDT } from "@/lib/currency";
import {
  createOrder,
  validateDiscountCode,
  incrementDiscountUsage,
  DEFAULT_COUNTRY_CODE,
  waNumber,
  formatOrderNo,
  checkCartStock,
} from "@/lib/db";
import { chargeBalance, logPurchase, notifyWalletOrder, refundBalance } from "@/lib/wallet";
import { requestInstantDelivery, instantDeliveryHint } from "@/lib/delivery";
import { useBalance } from "@/hooks/use-wallet";

import { DIAL_CODES } from "@/lib/country-codes";
import { useSettings } from "@/hooks/use-store-data";

export const Route = createFileRoute("/checkout")({
  head: () => ({
    meta: [
      { title: "إتمام الطلب | NMCT" },
      {
        name: "description",
        content: "أكمل طلبك الرقمي في NMCT بالدفع من رصيد محفظتك مع تسليم داخل الموقع.",
      },
      { property: "og:title", content: "إتمام الطلب | NMCT" },
      { property: "og:description", content: "ادفع من رصيدك واستلم منتجك داخل الموقع." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CheckoutPage,
});

const inputCls =
  "h-12 w-full rounded-xl border border-border bg-background/60 px-3 text-sm outline-none transition-colors focus:border-primary";

function CheckoutPage() {
  const { t, lang, dir } = useI18n();
  const { fmt, omr, usdt } = useCurrency();
  const { lines, subtotal, clear } = useCart();
  const { user, promptLogin } = useAuth();
  const { balance } = useBalance();
  const navigate = useNavigate();
  const router = useRouter();
  const settings = useSettings();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [cc, setCc] = useState(DEFAULT_COUNTRY_CODE);
  const [note, setNote] = useState("");
  const [code, setCode] = useState("");
  const [discount, setDiscount] = useState(0);
  const [codeId, setCodeId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const saved = String(settings["countryCode"] || "").replace(/\D/g, "");
    if (saved && DIAL_CODES.some((d) => d.code === saved)) setCc(saved);
  }, [settings["countryCode"]]);

  useEffect(() => {
    if (user?.displayName && !name) setName(user.displayName);
  }, [user, name]);

  const total = Math.max(0, subtotal - discount);
  const missing = Math.max(0, Number((total - balance).toFixed(3)));
  const enough = missing <= 0;
  const BackIcon = dir === "rtl" ? ArrowRight : ArrowLeft;

  async function applyCode() {
    const found = await validateDiscountCode(code);
    if (!found) {
      setDiscount(0);
      setCodeId(null);
      toast.error(t("invalidCoupon"));
      return;
    }
    const value = found.percent ? (subtotal * found.percent) / 100 : found.amount || 0;
    setDiscount(value);
    setCodeId(found.id);
    toast.success(t("couponApplied"));
  }

  async function submit() {
    if (!user) {
      promptLogin();
      return;
    }
    if (!name.trim()) {
      toast.error(t("fillFields"));
      return;
    }
    if (phone.replace(/\D/g, "").replace(/^0+/, "").length < 6) {
      toast.error(lang === "ar" ? "أدخل رقم هاتف صحيح" : "Enter a valid phone number");
      return;
    }
    if (!enough) {
      toast.error(
        lang === "ar" ? `رصيدك غير كافٍ — تحتاج ${omr(missing)}` : `Not enough balance — ${omr(missing)} more`,
      );
      navigate({ to: "/topup" });
      return;
    }

    setBusy(true);
    try {
      const short = await checkCartStock(lines.map((l) => ({ id: l.id, name: l.name, qty: l.qty })));
      if (short.length) {
        const first = short[0]!;
        toast.error(
          lang === "ar"
            ? `الكمية المتوفرة من "${first.name}" هي ${first.available} فقط`
            : `Only ${first.available} left of "${first.name}"`,
        );
        setBusy(false);
        return;
      }

      // 1) خصم المبلغ من الرصيد أولاً
      const pay = await chargeBalance(user.uid, total);
      if (!pay.ok) {
        toast.error(
          lang === "ar"
            ? `رصيدك غير كافٍ — ينقصك ${omr(pay.missing)}`
            : `Not enough balance — ${omr(pay.missing)} short`,
        );
        setBusy(false);
        navigate({ to: "/topup" });
        return;
      }

      const payload = {
        customerName: name,
        senderName: name,
        phone: waNumber(phone, cc),
        email: user.email || "",
        note,
        uid: user.uid,
        username: user.displayName || name,
        items: lines.map((l) => ({
          id: l.id,
          name: l.name,
          price: l.price,
          qty: l.qty,
          image: l.image || "",
          size: l.size || "",
        })),
        subtotal,
        total,
        currency: "OMR",
        deliveryMethod: "digital",
        deliveryFee: 0,
        paymentMethod: "wallet",
        paymentMethodName: lang === "ar" ? "رصيد المحفظة" : "Wallet balance",
        paymentCurrency: "OMR",
        paymentProof: "wallet",
        paidFromWallet: true,
        paid: true,
        totalUsdt: Number(toUsdt(total).toFixed(2)),
        totalOoredoo: Number(toOoredoo(total).toFixed(2)),
        amountToPay: total.toFixed(2),
        discountCode: codeId ? code : "",
        discountAmount: discount,
        status: "pending",
        statusText: lang === "ar" ? "مدفوع — جاري التسليم" : "Paid — delivering",
      };

      try {
        const created = await createOrder(payload);
        await logPurchase(user.uid, total, pay.balanceAfter, created);
        void notifyWalletOrder({ ...payload, ...created } as never, formatOrderNo(created));
        if (codeId) await incrementDiscountUsage(codeId);
        clear();

        // تسليم فوري: السيرفر يسحب الأكواد من المخزون ويرسلها للعميل
        const delivery = await requestInstantDelivery(created.id);
        if (delivery.ok)
          toast.success(
            lang === "ar"
              ? "تم الدفع من رصيدك والتسليم فوراً ✅ — تجد التفاصيل في طلباتي"
              : "Paid from your balance and delivered instantly ✅",
          );
        else {
          toast.success(t("orderPlaced"));
          toast.message(instantDeliveryHint(delivery, lang));
        }
        navigate({ to: "/orders" });
      } catch (e) {
        // فشل إنشاء الطلب بعد الخصم — نُرجع الرصيد فوراً
        await refundBalance(user.uid, total, "استرجاع بعد فشل الطلب");
        throw e;
      }
    } catch {
      toast.error(lang === "ar" ? "تعذر إرسال الطلب" : "Could not place order");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Layout>
      <div className="sticky top-[4.5rem] z-30 border-b border-border/60 bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-3">
          <button
            onClick={() =>
              window.history.length > 1 ? router.history.back() : router.navigate({ to: "/store" })
            }
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-border bg-card/70 px-4 font-display text-sm hover:border-primary hover:text-primary"
          >
            <BackIcon className="size-4" />
            {lang === "ar" ? "رجوع" : "Back"}
          </button>
          <span className="font-display text-sm text-muted-foreground">{t("checkout")}</span>
          {user && (
            <Link
              to="/wallet"
              className="ms-auto inline-flex h-11 items-center gap-2 rounded-xl border border-primary/40 bg-primary/10 px-4 font-tech text-sm text-primary"
            >
              <Wallet className="size-4" />
              {fmt(balance)}
            </Link>
          )}
        </div>
      </div>

      <section className="mx-auto max-w-4xl px-4 py-8 pb-32 sm:pb-12">
        <div className="rounded-3xl glass-panel p-6 text-center">
          <h1 className="font-display text-3xl">💳 {t("checkout")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {lang === "ar"
              ? "الدفع يتم من رصيد محفظتك — والتسليم داخل الموقع في صفحة طلباتي"
              : "Paid from your wallet balance — delivered inside the site"}
          </p>
        </div>

        {!user ? (
          <div className="mt-6 rounded-3xl glass-panel p-8 text-center">
            <p className="text-sm text-muted-foreground">
              {lang === "ar"
                ? "يلزم تسجيل الدخول بحساب جوجل لإتمام الطلب."
                : "Sign in with Google to place your order."}
            </p>
            <button
              onClick={promptLogin}
              className="mt-5 inline-flex h-12 items-center justify-center gap-3 rounded-xl border border-border bg-background px-6 font-display hover:border-primary"
            >
              <GoogleMark />
              {lang === "ar" ? "تسجيل الدخول" : "Sign in"}
            </button>
          </div>
        ) : lines.length === 0 ? (
          <p className="py-24 text-center text-muted-foreground">{t("emptyCart")}</p>
        ) : (
          <div className="mt-6 space-y-5">
            {/* SUMMARY */}
            <Section
              icon={<Wallet className="size-4" />}
              title={lang === "ar" ? "ملخص الطلب" : "Order summary"}
            >
              <div className="space-y-3">
                {lines.map((l, i) => (
                  <div key={i} className="flex items-center gap-3">
                    {l.image && (
                      <img src={l.image} alt="" className="size-12 rounded-xl object-cover" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-1 text-sm">{l.name}</p>
                      <p className="font-tech text-xs text-muted-foreground">× {l.qty}</p>
                    </div>
                    <span className="font-tech text-sm text-primary">{fmt(l.price * l.qty)}</span>
                  </div>
                ))}
              </div>
            </Section>

            {/* DISCOUNT */}
            <Section
              icon={<BadgePercent className="size-4" />}
              title={lang === "ar" ? "كود الخصم (اختياري)" : "Discount code"}
            >
              <div className="flex gap-2">
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder={t("couponCode")}
                  className={inputCls}
                />
                <button
                  onClick={applyCode}
                  className="h-12 shrink-0 rounded-xl border border-accent px-5 font-display text-accent"
                >
                  {t("apply")}
                </button>
              </div>
              {discount > 0 && (
                <p className="mt-2 text-sm text-accent">
                  {t("discount")}: -{fmt(discount)}
                </p>
              )}
            </Section>

            {/* BUYER */}
            <Section
              icon={<User className="size-4" />}
              title={lang === "ar" ? "بيانات المشتري" : "Buyer details"}
            >
              <div className="mb-3 flex items-center gap-3 rounded-2xl border border-border bg-background/40 p-3">
                {user.photoURL && (
                  <img src={user.photoURL} alt="" className="size-10 rounded-xl object-cover" />
                )}
                <div className="min-w-0">
                  <p className="truncate font-display text-sm">{user.displayName}</p>
                  <p dir="ltr" className="truncate text-xs text-muted-foreground">
                    {user.email}
                  </p>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={`${t("name")} *`} value={name} onChange={setName} />
                <label className="block min-w-0">
                  <span className="mb-1 block text-xs text-muted-foreground">
                    {`${lang === "ar" ? "رقم للتواصل (واتساب)" : "Contact number (WhatsApp)"} *`}
                  </span>
                  <div
                    dir="ltr"
                    className="grid w-full grid-cols-[6.5rem_minmax(0,1fr)] items-stretch gap-2"
                  >
                    <select
                      value={cc}
                      onChange={(e) => setCc(e.target.value)}
                      className={`${inputCls} appearance-none px-2 text-center text-sm`}
                      aria-label={lang === "ar" ? "رمز الدولة" : "Country code"}
                    >
                      {DIAL_CODES.map((d) => (
                        <option key={d.iso} value={d.code}>
                          {d.flag} +{d.code}
                        </option>
                      ))}
                    </select>
                    <input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value.replace(/[^\d\s-]/g, ""))}
                      inputMode="tel"
                      type="tel"
                      className={`${inputCls} text-base tracking-wide`}
                      placeholder="9xxxxxxx"
                    />
                  </div>
                  <span className="mt-1 block text-[11px] text-muted-foreground" dir="ltr">
                    +{cc} {phone.replace(/\D/g, "").replace(/^0+/, "")}
                  </span>
                </label>
              </div>
              <div className="mt-3">
                <span className="mb-1 block text-xs text-muted-foreground">{t("note")}</span>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  className="w-full rounded-xl border border-border bg-background/60 px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </div>
            </Section>

            {/* WALLET PAYMENT */}
            <Section
              icon={<Wallet className="size-4" />}
              title={lang === "ar" ? "الدفع من الرصيد" : "Pay with balance"}
            >
              <div
                className={`rounded-2xl border p-4 ${
                  enough ? "border-primary/40 bg-primary/5" : "border-destructive/50 bg-destructive/5"
                }`}
              >
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {lang === "ar" ? "رصيدك الحالي" : "Your balance"}
                  </span>
                  <span className="font-tech text-primary">{fmt(balance)}</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {lang === "ar" ? "قيمة الطلب" : "Order total"}
                  </span>
                  <span className="font-tech">{fmt(total)}</span>
                </div>

                {enough ? (
                  <p className="mt-3 flex items-center gap-2 text-sm text-emerald-400">
                    <Check className="size-4" />
                    {lang === "ar"
                      ? "رصيدك يكفي — سيتم الخصم عند تأكيد الطلب"
                      : "Balance is enough — it will be charged on confirm"}
                  </p>
                ) : (
                  <>
                    <div className="mt-3 flex items-center justify-between rounded-xl bg-destructive/10 p-3">
                      <span className="text-sm text-destructive">
                        {lang === "ar" ? "المبلغ الناقص" : "Missing amount"}
                      </span>
                      <span className="font-display text-lg text-destructive">{fmt(missing)}</span>
                    </div>
                    <Link
                      to="/topup"
                      className="mt-3 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-destructive font-display text-destructive-foreground"
                    >
                      <Plus className="size-4" />
                      {lang === "ar" ? "اذهب للشحن الآن" : "Go top up now"}
                    </Link>
                  </>
                )}
              </div>
            </Section>

            {/* TOTALS */}
            <div className="rounded-3xl glass-panel p-5 sm:p-6">
              <Row label={t("subtotal")} value={fmt(subtotal)} />
              {discount > 0 && <Row label={t("discount")} value={`-${fmt(discount)}`} accent />}
              <Row
                label={lang === "ar" ? "التسليم" : "Delivery"}
                value={lang === "ar" ? "رقمي داخل الموقع" : "Digital, in-site"}
              />
              <div className="mt-3 flex items-start justify-between gap-3 border-t border-border pt-3 font-display text-xl">
                <span>{t("total")}</span>
                <span className="text-end">
                  <span className="block text-primary">{omr(total)}</span>
                  <span className="block font-tech text-sm text-muted-foreground">
                    ≈ {usdt(total)}
                  </span>
                </span>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {lang === "ar"
                  ? `سعر التحويل الثابت: 1 ر.ع = ${OMR_TO_USDT} USDT`
                  : `Fixed rate: 1 OMR = ${OMR_TO_USDT} USDT`}
              </p>
              <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                <Zap className="size-3.5 text-accent" />
                {lang === "ar"
                  ? "يُخصم المبلغ من رصيدك مباشرة وتظهر أكواد منتجاتك في صفحة طلباتي."
                  : "The amount is charged instantly and your codes appear on the Orders page."}
              </p>

              <button
                disabled={busy}
                onClick={() => void submit()}
                className="mt-5 hidden h-14 w-full rounded-2xl bg-primary font-display text-lg text-primary-foreground disabled:opacity-60 sm:block"
              >
                {busy
                  ? "..."
                  : enough
                    ? t("placeOrder")
                    : lang === "ar"
                      ? "اشحن رصيدك أولاً"
                      : "Top up first"}
              </button>
            </div>
          </div>
        )}
      </section>

      {user && lines.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 p-3 backdrop-blur-xl sm:hidden">
          <button
            disabled={busy}
            onClick={() => void submit()}
            className="h-14 w-full rounded-2xl bg-primary font-display text-lg text-primary-foreground disabled:opacity-60"
          >
            {busy ? "..." : `${t("placeOrder")} · ${fmt(total)}`}
          </button>
        </div>
      )}
    </Layout>
  );
}

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl glass-panel p-5 sm:p-6">
      <div className="mb-4 flex items-center gap-2">
        <span className="grid size-9 place-items-center rounded-xl bg-primary/15 text-primary">
          {icon}
        </span>
        <h2 className="font-display text-lg">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div
      className={`flex justify-between py-1 text-sm ${accent ? "text-accent" : "text-muted-foreground"}`}
    >
      <span>{label}</span>
      <span className="font-tech">{value}</span>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  ltr,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  ltr?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-muted-foreground">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputCls}
        {...(ltr ? { dir: "ltr" as const } : {})}
      />
    </label>
  );
}
