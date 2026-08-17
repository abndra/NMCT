import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  ArrowRight,
  ArrowLeft,
  BadgePercent,
  Banknote,
  Check,
  Copy,
  Loader2,
  Plus,
  Upload,
  User,
  Wallet,
  X,
  Zap,
} from "lucide-react";

import { Layout } from "@/components/site/Layout";
import { useCart } from "@/lib/cart";
import { useAuth, GoogleMark } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import {
  useCurrency,
  toUsdt,
  toOoredoo,
  moneyOoredoo,
  ooredooCardAmount,
  OMR_TO_USDT,
} from "@/lib/currency";

import bankIcon from "@/assets/flag-oman.png";
import binanceIcon from "@/assets/binance.png";
import usdtIcon from "@/assets/usdt.png";
import ooredooIcon from "@/assets/ooredoo.png";

import { priceText } from "@/components/site/ProductCard";
import {
  createOrder,
  validateDiscountCode,
  incrementDiscountUsage,
  notifyNewOrder,
  DEFAULT_COUNTRY_CODE,
  waNumber,
  formatOrderNo,
  readPaymentMethods,
  type PaymentMethod,
} from "@/lib/db";

import { DIAL_CODES } from "@/lib/country-codes";
import { uploadImage } from "@/lib/uploads";
import { useSettings } from "@/hooks/use-store-data";

export const Route = createFileRoute("/checkout")({
  head: () => ({
    meta: [
      { title: "إتمام الطلب | NMCT" },
      {
        name: "description",
        content: "أكمل طلبك الرقمي في NMCT: أكواد خصم، تحويل بنكي، وتسليم فوري داخل الموقع.",
      },
      { property: "og:title", content: "إتمام الطلب | NMCT" },
      { property: "og:description", content: "منتجات رقمية بتسليم فوري داخل الموقع." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CheckoutPage,
});

const inputCls =
  "h-12 w-full rounded-xl border border-border bg-background/60 px-3 text-sm outline-none transition-colors focus:border-primary";

function methodLogo(m: PaymentMethod) {
  if (m.logo) return m.logo;
  if (m.icon === "binance") return binanceIcon;
  if (m.icon === "ooredoo" || m.currency === "OOREDOO") return ooredooIcon;
  if (m.icon === "usdt" || m.currency === "USDT") return usdtIcon;
  return bankIcon;
}


function CheckoutPage() {
  const { t, lang, dir } = useI18n();
  const { fmt, omr, usdt } = useCurrency();
  const { lines, subtotal, clear } = useCart();
  const { user, promptLogin } = useAuth();
  const navigate = useNavigate();
  const router = useRouter();
  const settings = useSettings();

  useEffect(() => {
    const saved = String(settings["countryCode"] || "").replace(/\D/g, "");
    if (saved && DIAL_CODES.some((d) => d.code === saved)) setCc(saved);
  }, [settings["countryCode"]]);

  const bank = (settings["bank"] as Record<string, string> | undefined) || {};
  const bankName = bank["name"] || "بنك مسقط";
  const bankAccount = bank["account"] || "97825550";
  const bankHolder = bank["holder"] || "NMCT";
  const bankImage = bank["image"] || "";

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [cc, setCc] = useState(DEFAULT_COUNTRY_CODE);
  const [note, setNote] = useState("");
  const [receipts, setReceipts] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  const [code, setCode] = useState("");
  const [discount, setDiscount] = useState(0);
  const [codeId, setCodeId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copiedKey, setCopiedKey] = useState("");
  const [methodId, setMethodId] = useState("");
  const [payMode, setPayMode] = useState<"transfer" | "card">("transfer");
  const [cardNumbers, setCardNumbers] = useState<string[]>([""]);

  const methods = readPaymentMethods(settings);
  const method = methods.find((m) => m.id === methodId) || methods[0];
  const allowCard = method?.allowCard === true || method?.currency === "OOREDOO";
  const cardMode = allowCard && payMode === "card";

  useEffect(() => {
    if (!methodId && methods.length) setMethodId(methods[0]!.id);
  }, [methods.length]);

  useEffect(() => {
    setPayMode("transfer");
    setCardNumbers([""]);
  }, [methodId]);

  /** Amount text in the currency of the selected method. */
  function amountText(m?: PaymentMethod, card = cardMode) {
    if (!m) return omr(total);
    if (m.currency === "USDT") return usdt(total);
    if (m.currency === "OOREDOO") return moneyOoredoo(total, lang, card);
    return omr(total);
  }
  function amountRaw(m?: PaymentMethod, card = cardMode) {
    if (m?.currency === "USDT") return toUsdt(total).toFixed(2);
    if (m?.currency === "OOREDOO")
      return (card ? ooredooCardAmount(total) : toOoredoo(total)).toFixed(2);
    return total.toFixed(2);
  }



  function copyLine(key: string, value: string) {
    navigator.clipboard?.writeText(value);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(""), 1500);
  }

  useEffect(() => {
    if (user?.displayName && !name) setName(user.displayName);
  }, [user, name]);

  const total = Math.max(0, subtotal - discount);
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

  async function pickReceipts(files: File[]) {
    if (!files.length) return;
    setUploading(true);
    try {
      const urls: string[] = [];
      for (const f of files.slice(0, 10)) urls.push(await uploadImage(f, "nmct_receipts"));
      setReceipts((prev) => [...prev, ...urls].slice(0, 10));
      toast.success(lang === "ar" ? "تم رفع الصور" : "Images uploaded");
    } catch {
      toast.error(lang === "ar" ? "تعذر رفع الصورة" : "Upload failed");
    } finally {
      setUploading(false);
    }
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
    const codes = cardNumbers.map((c) => c.trim()).filter((c) => c.length >= 4);
    if (cardMode) {
      if (!receipts.length && !codes.length) {
        toast.error(
          lang === "ar"
            ? "أدخل رقم بطاقة أوريدو واحد على الأقل أو ارفع صورة الرسالة"
            : "Enter at least one Ooredoo card number or upload a card photo",
        );
        return;
      }
    } else if (!receipts.length) {
      toast.error(lang === "ar" ? "ارفع صورة إيصال التحويل" : "Upload the transfer receipt");
      return;
    }

    setBusy(true);
    try {
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
        paymentMethod: method?.id || "bank",
        paymentMethodName: method ? method.name : "",
        paymentCurrency: method?.currency || "OMR",
        paymentProof: cardMode ? "card" : "receipt",
        cardNumber: cardMode ? codes.join(" | ") : "",
        cardNumbers: cardMode ? codes : [],
        totalUsdt: Number(toUsdt(total).toFixed(2)),
        totalOoredoo: Number(toOoredoo(total).toFixed(2)),
        amountToPay: amountRaw(method),
        receiptImage: receipts[0] || "",
        receiptImages: receipts,


        discountCode: codeId ? code : "",
        discountAmount: discount,
        status: "pending",
        statusText: lang === "ar" ? "قيد المراجعة" : "Pending review",
      };
      const created = await createOrder(payload);
      void notifyNewOrder(payload, formatOrderNo(created)).then((r) => {
        if (!r.customer.ok && r.customer.error !== "غير مُفعّل")
          console.warn("WhatsApp customer notice failed:", r.customer.error);
        if (!r.admin.ok && r.admin.error !== "غير مُفعّل")
          console.warn("WhatsApp admin notice failed:", r.admin.error);
      });
      if (codeId) await incrementDiscountUsage(codeId);
      clear();
      toast.success(t("orderPlaced"));
      navigate({ to: "/orders" });

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
              window.history.length > 1
                ? router.history.back()
                : router.navigate({ to: "/store" })
            }
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-border bg-card/70 px-4 font-display text-sm hover:border-primary hover:text-primary"
          >
            <BackIcon className="size-4" />
            {lang === "ar" ? "رجوع" : "Back"}
          </button>
          <span className="font-display text-sm text-muted-foreground">{t("checkout")}</span>
        </div>
      </div>

      <section className="mx-auto max-w-4xl px-4 py-8 pb-32 sm:pb-12">
        <div className="rounded-3xl glass-panel p-6 text-center">
          <h1 className="font-display text-3xl">💳 {t("checkout")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {lang === "ar"
              ? "منتجات رقمية — التسليم يتم داخل الموقع في صفحة طلباتي بعد قبول الطلب"
              : "Digital products — delivered inside the site on your Orders page"}
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
                    <span className="font-tech text-sm text-primary">
                      {fmt(l.price * l.qty)}
                    </span>
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
                  <div dir="ltr" className="grid w-full grid-cols-[6.5rem_minmax(0,1fr)] items-stretch gap-2">
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

            {/* PAYMENT */}
            <Section
              icon={<Banknote className="size-4" />}
              title={lang === "ar" ? "طريقة الدفع" : "Payment method"}
            >
              <div className="space-y-4 rounded-2xl border border-border bg-background/40 p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  {methods.map((m) => {
                    const active = m.id === methodId;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setMethodId(m.id)}
                        className={`flex items-center gap-3 rounded-2xl border p-3 text-start transition-colors ${
                          active
                            ? "border-primary bg-primary/10"
                            : "border-border bg-background/60 hover:border-primary/50"
                        }`}
                      >
                        <img
                          src={methodLogo(m)}
                          alt={m.name}
                          loading="lazy"
                          className="size-9 shrink-0 rounded-xl object-contain"
                        />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold">
                            {lang === "ar" ? m.name : m.nameEn || m.name}
                          </span>
                          <span className="block text-[11px] text-muted-foreground">
                            {amountText(m)}
                          </span>

                        </span>
                        {active && <Check className="ms-auto size-4 shrink-0 text-primary" />}
                      </button>
                    );
                  })}
                </div>

                {method && (
                  <div className="space-y-2">
                    {method.fields.map((f, i) => (
                      <div
                        key={`${f.label}-${i}`}
                        className="flex items-center gap-3 rounded-xl border border-border bg-background/60 p-3"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] text-muted-foreground">{f.label}</p>
                          <p className="break-all font-tech text-sm text-primary">{f.value}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => copyLine(`${method.id}-${i}`, f.value)}
                          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-accent px-3 text-xs text-accent"
                        >
                          {copiedKey === `${method.id}-${i}` ? (
                            <Check className="size-3.5" />
                          ) : (
                            <Copy className="size-3.5" />
                          )}
                          {lang === "ar" ? "نسخ" : "Copy"}
                        </button>
                      </div>
                    ))}

                    <div className="flex items-center gap-3 rounded-xl border border-primary/40 bg-primary/5 p-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] text-muted-foreground">
                          {lang === "ar" ? "المبلغ المطلوب تحويله" : "Amount to transfer"}
                        </p>
                        <p className="font-tech text-sm text-primary">{amountText(method)}</p>
                        {method.currency === "OOREDOO" && (
                          <p className="text-[11px] text-muted-foreground">
                            {lang === "ar"
                              ? `يعادل ${omr(total)} بنكياً — 750 بيسة بنك = 1 ريال أوريدو`
                              : `Equals ${omr(total)} by bank — 750 bank baisa = 1 Ooredoo rial`}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => copyLine("amount", amountRaw(method))}

                        className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-accent px-3 text-xs text-accent"
                      >
                        {copiedKey === "amount" ? (
                          <Check className="size-3.5" />
                        ) : (
                          <Copy className="size-3.5" />
                        )}
                        {lang === "ar" ? "نسخ" : "Copy"}
                      </button>
                    </div>

                    {(lang === "ar" ? method.note : method.noteEn || method.note) && (
                      <p className="text-xs text-muted-foreground">
                        {lang === "ar" ? method.note : method.noteEn || method.note}
                      </p>
                    )}
                  </div>
                )}

                {allowCard && (
                  <div className="grid grid-cols-2 gap-2 rounded-2xl border border-border bg-background/60 p-1">
                    {(["transfer", "card"] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setPayMode(mode)}
                        className={`rounded-xl px-3 py-2 text-xs font-semibold transition-colors ${
                          payMode === mode
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {mode === "transfer"
                          ? lang === "ar"
                            ? "تحويل رصيد + إيصال"
                            : "Balance transfer + receipt"
                          : lang === "ar"
                            ? "إرسال بطاقة أوريدو"
                            : "Send an Ooredoo card"}
                      </button>
                    ))}
                  </div>
                )}

                <ol className="space-y-1 text-xs text-muted-foreground">
                  {cardMode ? (
                    <>
                      <li>
                        1.{" "}
                        {lang === "ar"
                          ? `اشترِ بطاقة أوريدو بقيمة ${amountText(method)} أو أكثر.`
                          : `Buy an Ooredoo card worth ${amountText(method)} or more.`}
                      </li>
                      <li>
                        2.{" "}
                        {lang === "ar"
                          ? "اكتب أكواد البطاقات هنا (حتى 10 أكواد)، أو ارفع صور رسائل البطاقات."
                          : "Type the card codes here (up to 10), or upload the card message photos."}
                      </li>

                      <li>
                        3. {lang === "ar" ? "أكّد الطلب." : "Confirm the order."}
                      </li>
                    </>
                  ) : (
                    <>
                      <li>
                        1.{" "}
                        {lang === "ar"
                          ? "انسخ بيانات الدفع وحوّل المبلغ الإجمالي."
                          : "Copy the payment details and transfer the total."}
                      </li>
                      <li>
                        2.{" "}
                        {lang === "ar"
                          ? "التقط صورة لإيصال التحويل."
                          : "Take a screenshot of the receipt."}
                      </li>
                      <li>
                        3.{" "}
                        {lang === "ar"
                          ? "ارفع الإيصال هنا ثم أكّد الطلب."
                          : "Upload it here, then confirm the order."}
                      </li>
                    </>
                  )}
                </ol>

                {method?.id === "bank" && bankImage && (
                  <img
                    src={bankImage}
                    alt={lang === "ar" ? "بيانات الحساب البنكي" : "Bank account details"}
                    className="w-full rounded-2xl border border-border object-contain"
                  />
                )}

                {cardMode && (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">
                      {lang === "ar"
                        ? "أكواد بطاقات أوريدو (يمكنك إضافة حتى 10 أكواد)"
                        : "Ooredoo card codes (up to 10)"}
                    </p>
                    {cardNumbers.map((c, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input
                          className={inputCls}
                          inputMode="numeric"
                          dir="ltr"
                          value={c}
                          onChange={(e) =>
                            setCardNumbers((prev) =>
                              prev.map((v, k) => (k === i ? e.target.value : v)),
                            )
                          }
                          placeholder={
                            lang === "ar" ? `الكود رقم ${i + 1}` : `Card code #${i + 1}`
                          }
                        />
                        {cardNumbers.length > 1 && (
                          <button
                            type="button"
                            aria-label="remove"
                            onClick={() =>
                              setCardNumbers((prev) => prev.filter((_, k) => k !== i))
                            }
                            className="grid size-11 shrink-0 place-items-center rounded-xl border border-border text-muted-foreground hover:border-destructive hover:text-destructive"
                          >
                            <X className="size-4" />
                          </button>
                        )}
                      </div>
                    ))}
                    {cardNumbers.length < 10 && (
                      <button
                        type="button"
                        onClick={() => setCardNumbers((prev) => [...prev, ""])}
                        className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-accent px-3 text-xs text-accent"
                      >
                        <Plus className="size-3.5" />
                        {lang === "ar" ? "إضافة كود آخر" : "Add another code"}
                      </button>
                    )}
                  </div>
                )}

                {receipts.length > 0 && (
                  <div className="grid grid-cols-3 gap-2">
                    {receipts.map((r, i) => (
                      <div key={r + i} className="relative">
                        <img
                          src={r}
                          alt=""
                          className="h-24 w-full rounded-xl border border-border object-cover"
                        />
                        <button
                          type="button"
                          aria-label="remove image"
                          onClick={() => setReceipts((prev) => prev.filter((_, k) => k !== i))}
                          className="absolute end-1 top-1 grid size-7 place-items-center rounded-lg bg-background/90 text-destructive"
                        >
                          <X className="size-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {receipts.length < 10 && (
                  <label className="flex h-28 cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border text-center text-sm text-muted-foreground hover:border-primary hover:text-primary">
                    {uploading ? (
                      <Loader2 className="size-5 animate-spin" />
                    ) : (
                      <>
                        <Upload className="size-5" />
                        {cardMode
                          ? lang === "ar"
                            ? "ارفع صور رسائل البطاقات (يمكن أكثر من صورة)"
                            : "Upload card message photos (multiple allowed)"
                          : lang === "ar"
                            ? "ارفع صورة الإيصال"
                            : "Upload receipt"}
                      </>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      hidden
                      onChange={(e) => {
                        const fs = Array.from(e.target.files || []);
                        e.target.value = "";
                        if (fs.length) void pickReceipts(fs);
                      }}
                    />
                  </label>
                )}


              </div>
            </Section>

            {/* TOTALS */}
            <div className="rounded-3xl glass-panel p-5 sm:p-6">
              <Row label={t("subtotal")} value={fmt(subtotal)} />
              {discount > 0 && (
                <Row label={t("discount")} value={`-${fmt(discount)}`} accent />
              )}
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
                  ? "بعد قبول الطلب تظهر أكواد منتجاتك مباشرة في صفحة طلباتي."
                  : "Once accepted, your codes appear on the Orders page."}
              </p>

              <button
                disabled={busy}
                onClick={submit}
                className="mt-5 hidden h-14 w-full rounded-2xl bg-primary font-display text-lg text-primary-foreground disabled:opacity-60 sm:block"
              >
                {busy ? "..." : t("placeOrder")}
              </button>
            </div>
          </div>
        )}
      </section>

      {user && lines.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 p-3 backdrop-blur-xl sm:hidden">
          <button
            disabled={busy}
            onClick={submit}
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
