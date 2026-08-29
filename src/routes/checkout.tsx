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
import { DeliveryCeremony } from "@/components/site/DeliveryCeremony";
import { useCart } from "@/lib/cart";
import { useAuth, GoogleMark } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useCurrency, toUsdt, toOoredoo, OMR_TO_USDT } from "@/lib/currency";
import {
  createOrder,
  notifyNewOrder,
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
import { useSettings, useProducts } from "@/hooks/use-store-data";
import {
  PaymentPicker,
  emptyPaymentState,
  payAmountRaw,
  type PaymentState,
} from "@/components/site/PaymentPicker";
import { readPaymentMethods } from "@/lib/db";

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
  const [ceremony, setCeremony] = useState<null | "working" | "done" | "queued">(null);
  const [payMode, setPayMode] = useState<"wallet" | "direct">("wallet");
  const [pay, setPay] = useState<PaymentState>(emptyPaymentState);
  const { products } = useProducts();

  useEffect(() => {
    const saved = String(settings["countryCode"] || "").replace(/\D/g, "");
    if (saved && DIAL_CODES.some((d) => d.code === saved)) setCc(saved);
  }, [settings["countryCode"]]);

  useEffect(() => {
    if (user?.displayName && !name) setName(user.displayName);
  }, [user, name]);

  const total = Math.max(0, subtotal - discount);
  const methods = readPaymentMethods(settings);
  const method = methods.find((m) => m.id === pay.methodId) || methods[0];
  const cardMode = (method?.allowCard === true || method?.currency === "OOREDOO") && pay.payMode === "card";
  const direct = payMode === "direct";
  /** منتجات «حسابات»: تحتاج موافقة الأدمن دائماً وتسليم نص يدوي. */
  const accountLines = lines.filter((l) => products.some((p) => p.id === l.id && p.accountProduct));
  const hasAccounts = accountLines.length > 0;
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
    if (direct) {
      const codes = pay.cardNumbers.map((c) => c.trim()).filter((c) => c.length >= 4);
      if (cardMode ? !pay.receipts.length && !codes.length : !pay.receipts.length) {
        toast.error(
          lang === "ar" ? "أرفق صورة إثبات الدفع" : "Attach a payment proof image",
        );
        return;
      }
    } else if (!enough) {
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

      const baseItems = lines.map((l) => ({
        id: l.id,
        name: l.name,
        price: l.price,
        qty: l.qty,
        image: l.image || "",
        size: l.size || "",
      }));
      const baseInfo = {
        customerName: name,
        senderName: name,
        phone: waNumber(phone, cc),
        email: user.email || "",
        note,
        uid: user.uid,
        username: user.displayName || name,
        items: baseItems,
        subtotal,
        total,
        currency: "OMR",
        deliveryMethod: "digital",
        deliveryFee: 0,
        totalUsdt: Number(toUsdt(total).toFixed(2)),
        totalOoredoo: Number(toOoredoo(total).toFixed(2)),
        discountCode: codeId ? code : "",
        discountAmount: discount,
        accountOrder: hasAccounts,
        status: "pending",
      };

      /* ---------- (أ) دفع مباشر بدون محفظة: ينتظر موافقة الأدمن ---------- */
      if (direct) {
        const codes = pay.cardNumbers.map((c) => c.trim()).filter((c) => c.length >= 4);
        const payload = {
          ...baseInfo,
          paymentMethod: method?.id || "bank",
          paymentMethodName: method ? (lang === "ar" ? method.name : method.nameEn || method.name) : "",
          paymentCurrency: method?.currency || "OMR",
          amountToPay: payAmountRaw(method, total, cardMode),
          receiptImage: pay.receipts[0] || "",
          receiptImages: pay.receipts,
          cardNumbers: cardMode ? codes : [],
          paymentProof: pay.receipts[0] || (codes[0] || ""),
          paidFromWallet: false,
          paid: false,
          needsApproval: true,
          statusText:
            lang === "ar" ? "بانتظار مراجعة الدفع والموافقة" : "Awaiting payment review",
        };
        const created = await createOrder(payload);
        void notifyNewOrder({ ...payload, ...created } as never, formatOrderNo(created));
        if (codeId) await incrementDiscountUsage(codeId);
        clear();
        toast.success(t("orderPlaced"));
        toast.message(
          lang === "ar"
            ? "تم إرسال طلبك — سيتم تسليمه بعد مراجعة الدفع والموافقة عليه."
            : "Order sent — it will be delivered after payment review.",
        );
        navigate({ to: "/orders" });
        return;
      }

      /* ---------- (ب) دفع من المحفظة ---------- */
      const payres = await chargeBalance(user.uid, total);
      if (!payres.ok) {
        toast.error(
          lang === "ar"
            ? `رصيدك غير كافٍ — ينقصك ${omr(payres.missing)}`
            : `Not enough balance — ${omr(payres.missing)} short`,
        );
        setBusy(false);
        navigate({ to: "/topup" });
        return;
      }

      const payload = {
        ...baseInfo,
        paymentMethod: "wallet",
        paymentMethodName: lang === "ar" ? "رصيد المحفظة" : "Wallet balance",
        paymentCurrency: "OMR",
        paymentProof: "wallet",
        paidFromWallet: true,
        paid: true,
        amountToPay: total.toFixed(2),
        needsApproval: hasAccounts,
        statusText: hasAccounts
          ? lang === "ar"
            ? "مدفوع — بانتظار تجهيز الحساب"
            : "Paid — account being prepared"
          : lang === "ar"
            ? "مدفوع — جاري التسليم"
            : "Paid — delivering",
      };

      try {
        const created = await createOrder(payload);
        await logPurchase(user.uid, total, payres.balanceAfter, created);
        void notifyWalletOrder({ ...payload, ...created } as never, formatOrderNo(created));
        if (codeId) await incrementDiscountUsage(codeId);
        clear();

        // منتجات «حسابات»: لا تسليم فوري — تنتظر موافقة الأدمن ثم يسلّمها نصاً
        if (hasAccounts) {
          toast.success(t("orderPlaced"));
          toast.message(
            lang === "ar"
              ? "تم الدفع من رصيدك ✅ — منتجات الحسابات تُجهَّز يدوياً وتصلك بعد الموافقة."
              : "Paid from your balance ✅ — account products are prepared manually.",
          );
          navigate({ to: "/orders" });
          return;
        }

        // أنيميشن التسليم الفوري — 3 ثوانٍ كاملة بينما السيرفر يسلّم فعلياً
        setCeremony("working");
        const minShow = new Promise((r) => setTimeout(r, 3000));
        const delivery = await requestInstantDelivery(created.id);
        await minShow;
        setCeremony(delivery.ok ? "done" : "queued");
        await new Promise((r) => setTimeout(r, 900));

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
        setCeremony(null);
        navigate({ to: "/orders" });
      } catch (e) {
        setCeremony(null);
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
      {ceremony && <DeliveryCeremony state={ceremony} />}
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
              ? "ادفع من رصيد محفظتك للتسليم الفوري، أو ادفع مباشرة وينتظر طلبك موافقتنا"
              : "Pay from your wallet for instant delivery, or pay directly and wait for approval"}
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

            {/* PAYMENT MODE */}
            <Section
              icon={<Wallet className="size-4" />}
              title={lang === "ar" ? "طريقة الدفع" : "Payment method"}
            >
              <div className="mb-4 grid grid-cols-2 gap-2 rounded-2xl border border-border bg-background/60 p-1">
                {(["wallet", "direct"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setPayMode(m)}
                    className={`rounded-xl px-3 py-2.5 text-xs font-semibold transition-colors ${
                      payMode === m
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {m === "wallet"
                      ? lang === "ar"
                        ? "من رصيد المحفظة (تسليم فوري)"
                        : "Wallet balance (instant)"
                      : lang === "ar"
                        ? "دفع مباشر (بانتظار الموافقة)"
                        : "Direct payment (needs approval)"}
                  </button>
                ))}
              </div>

              {hasAccounts && (
                <p className="mb-3 rounded-xl border border-accent/40 bg-accent/10 p-3 text-xs text-accent">
                  {lang === "ar"
                    ? "طلبك يحتوي منتجات «حسابات» — تُجهَّز يدوياً وتصلك بعد موافقتنا، حتى عند الدفع من الرصيد."
                    : "Your order contains account products — prepared manually and delivered after approval."}
                </p>
              )}

              {direct ? (
                <>
                  <p className="mb-3 text-xs text-muted-foreground">
                    {lang === "ar"
                      ? "حوّل المبلغ بإحدى الطرق التالية وأرفق صورة الإثبات — يُسلَّم الطلب بعد مراجعة الدفع والموافقة عليه."
                      : "Transfer the amount and attach the proof — delivered after review and approval."}
                  </p>
                  <PaymentPicker total={total} state={pay} setState={setPay} />
                </>
              ) : (

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
              )}
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
                {direct
                  ? lang === "ar"
                    ? "الدفع المباشر ينتظر مراجعتنا للإيصال ثم يصلك المنتج في صفحة طلباتي وعلى واتساب."
                    : "Direct payments are reviewed first, then delivered to your Orders page and WhatsApp."
                  : hasAccounts
                    ? lang === "ar"
                      ? "يُخصم المبلغ من رصيدك الآن، ومنتجات الحسابات تصلك بعد تجهيزها والموافقة عليها."
                      : "Charged now; account products arrive after they are prepared and approved."
                    : lang === "ar"
                      ? "يُخصم المبلغ من رصيدك مباشرة وتظهر أكواد منتجاتك في صفحة طلباتي فوراً."
                      : "The amount is charged instantly and your codes appear on the Orders page."}
              </p>

              <button
                disabled={busy}
                onClick={() => void submit()}
                className="mt-5 hidden h-14 w-full rounded-2xl bg-primary font-display text-lg text-primary-foreground disabled:opacity-60 sm:block"
              >
                {busy
                  ? "..."
                  : direct || enough
                    ? t("placeOrder")
                    : lang === "ar"
                      ? "اشحن رصيدك أو ادفع مباشرة"
                      : "Top up or pay directly"}
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
