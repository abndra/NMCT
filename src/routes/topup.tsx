import { createFileRoute, useNavigate, useRouter, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Banknote, Check, Sparkles, Wallet } from "lucide-react";

import { Layout } from "@/components/site/Layout";
import { useAuth, GoogleMark } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useCurrency } from "@/lib/currency";
import { DIAL_CODES } from "@/lib/country-codes";
import { DEFAULT_COUNTRY_CODE, waNumber } from "@/lib/db";
import { useSettings } from "@/hooks/use-store-data";
import { useBalance } from "@/hooks/use-wallet";
import {
  PaymentPicker,
  emptyPaymentState,
  payAmountRaw,
  usePaymentMethodOf,
  type PaymentState,
} from "@/components/site/PaymentPicker";
import {
  createTopupRequest,
  formatTopupNo,
  notifyNewTopup,
  MAX_TOPUP,
  MIN_TOPUP,
  TOPUP_PACKAGES,
} from "@/lib/wallet";

export const Route = createFileRoute("/topup")({
  head: () => ({
    meta: [
      { title: "شحن الرصيد | NMCT" },
      {
        name: "description",
        content:
          "اشحن رصيد محفظتك في NMCT بباقات جاهزة أو بمبلغ مخصص، وادفع بنفس طرق الدفع المعتمدة.",
      },
      { property: "og:title", content: "شحن الرصيد | NMCT" },
      { property: "og:description", content: "اشحن رصيدك واشترِ بتسليم فوري داخل الموقع." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TopupPage,
});

const inputCls =
  "h-12 w-full rounded-xl border border-border bg-background/60 px-3 text-sm outline-none transition-colors focus:border-primary";

function TopupPage() {
  const { lang, dir } = useI18n();
  const { fmt } = useCurrency();
  const { user, promptLogin } = useAuth();
  const { balance } = useBalance();
  const navigate = useNavigate();
  const router = useRouter();
  const settings = useSettings();

  const [pack, setPack] = useState<string>("m");
  const [custom, setCustom] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [cc, setCc] = useState(DEFAULT_COUNTRY_CODE);
  const [note, setNote] = useState("");
  const [pay, setPay] = useState<PaymentState>(emptyPaymentState);
  const [busy, setBusy] = useState(false);

  const method = usePaymentMethodOf(pay);
  const cardMode =
    (method?.allowCard === true || method?.currency === "OOREDOO") && pay.payMode === "card";

  useEffect(() => {
    const saved = String(settings["countryCode"] || "").replace(/\D/g, "");
    if (saved && DIAL_CODES.some((d) => d.code === saved)) setCc(saved);
  }, [settings["countryCode"]]);

  useEffect(() => {
    if (user?.displayName && !name) setName(user.displayName);
  }, [user, name]);

  const selected = TOPUP_PACKAGES.find((p) => p.id === pack);
  const amount =
    pack === "custom" ? Math.max(0, Number(custom.replace(",", ".")) || 0) : selected?.amount || 0;
  const bonus = pack === "custom" ? 0 : Number((selected as { bonus?: number } | undefined)?.bonus || 0);
  const credited = amount + bonus;

  const BackIcon = dir === "rtl" ? ArrowRight : ArrowLeft;

  async function submit() {
    if (!user) {
      promptLogin();
      return;
    }
    if (amount < MIN_TOPUP) {
      toast.error(
        lang === "ar"
          ? `أقل مبلغ للشحن هو ${MIN_TOPUP.toFixed(2)} ر.ع`
          : `Minimum top-up is OMR ${MIN_TOPUP.toFixed(2)}`,
      );
      return;
    }
    if (amount > MAX_TOPUP) {
      toast.error(
        lang === "ar" ? `أقصى مبلغ للشحن هو ${MAX_TOPUP} ر.ع` : `Maximum top-up is OMR ${MAX_TOPUP}`,
      );
      return;
    }
    if (!name.trim()) {
      toast.error(lang === "ar" ? "أدخل اسمك" : "Enter your name");
      return;
    }
    if (phone.replace(/\D/g, "").replace(/^0+/, "").length < 6) {
      toast.error(lang === "ar" ? "أدخل رقم هاتف صحيح" : "Enter a valid phone number");
      return;
    }
    const codes = pay.cardNumbers.map((c) => c.trim()).filter((c) => c.length >= 4);
    if (cardMode) {
      if (!pay.receipts.length && !codes.length) {
        toast.error(
          lang === "ar"
            ? "أدخل رقم بطاقة أوريدو واحد على الأقل أو ارفع صورة الرسالة"
            : "Enter at least one Ooredoo card number or upload a photo",
        );
        return;
      }
    } else if (!pay.receipts.length) {
      toast.error(lang === "ar" ? "ارفع صورة إيصال التحويل" : "Upload the transfer receipt");
      return;
    }

    setBusy(true);
    try {
      const payload = {
        uid: user.uid,
        userName: name,
        email: user.email || "",
        photo: user.photoURL || "",
        phone: waNumber(phone, cc),
        amount: credited,
        packageName:
          pack === "custom"
            ? lang === "ar"
              ? "مبلغ مخصص"
              : "Custom amount"
            : lang === "ar"
              ? selected?.label || ""
              : selected?.labelEn || "",
        note,
        paymentMethod: method?.id || "bank",
        paymentMethodName: method?.name || "",
        paymentCurrency: method?.currency || "OMR",
        amountToPay: payAmountRaw(method, amount, cardMode),
        paymentProof: cardMode ? "card" : "receipt",
        receiptImage: pay.receipts[0] || "",
        receiptImages: pay.receipts,
        cardNumbers: cardMode ? codes : [],
      };
      const created = await createTopupRequest(payload);
      void notifyNewTopup(
        { ...payload, status: "pending" as const, createdAt: Date.now() },
        formatTopupNo(created),
      );
      toast.success(
        lang === "ar"
          ? "تم إرسال طلب الشحن — سيُضاف الرصيد بعد المراجعة"
          : "Top-up request sent — balance is added after review",
      );
      navigate({ to: "/wallet" });
    } catch {
      toast.error(lang === "ar" ? "تعذر إرسال طلب الشحن" : "Could not send the request");
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
          <span className="font-display text-sm text-muted-foreground">
            {lang === "ar" ? "شحن الرصيد" : "Top up balance"}
          </span>
          <Link
            to="/wallet"
            className="ms-auto inline-flex h-11 items-center gap-2 rounded-xl border border-primary/40 bg-primary/10 px-4 font-tech text-sm text-primary"
          >
            <Wallet className="size-4" />
            {fmt(balance)}
          </Link>
        </div>
      </div>

      <section className="mx-auto max-w-4xl px-4 py-8 pb-32 sm:pb-12">
        <div className="rounded-3xl glass-panel p-6 text-center">
          <h1 className="font-display text-3xl">👛 {lang === "ar" ? "شحن الرصيد" : "Top up"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {lang === "ar"
              ? "اشحن رصيدك مرة واحدة، ثم اشترِ أي منتج بتسليم فوري بدون انتظار."
              : "Top up once, then buy anything with instant delivery."}
          </p>
        </div>

        {!user ? (
          <div className="mt-6 rounded-3xl glass-panel p-8 text-center">
            <p className="text-sm text-muted-foreground">
              {lang === "ar"
                ? "سجّل الدخول بحساب جوجل لشحن رصيدك."
                : "Sign in with Google to top up."}
            </p>
            <button
              onClick={promptLogin}
              className="mt-5 inline-flex h-12 items-center justify-center gap-3 rounded-xl border border-border bg-background px-6 font-display hover:border-primary"
            >
              <GoogleMark />
              {lang === "ar" ? "تسجيل الدخول" : "Sign in"}
            </button>
          </div>
        ) : (
          <div className="mt-6 space-y-5">
            <Section
              icon={<Sparkles className="size-4" />}
              title={lang === "ar" ? "اختر باقة الشحن" : "Choose a package"}
            >
              <div className="grid gap-3 sm:grid-cols-2">
                {TOPUP_PACKAGES.map((p) => {
                  const active = pack === p.id;
                  const extra = Number((p as { bonus?: number }).bonus || 0);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPack(p.id)}
                      className={`flex items-center justify-between gap-3 rounded-2xl border p-4 text-start transition-colors ${
                        active
                          ? "border-primary bg-primary/10"
                          : "border-border bg-background/60 hover:border-primary/50"
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block font-display text-sm">
                          {lang === "ar" ? p.label : p.labelEn}
                        </span>
                        <span className="block font-tech text-lg text-primary">
                          {fmt(p.amount)}
                        </span>
                        {extra > 0 && (
                          <span className="mt-1 inline-block rounded-full bg-accent/15 px-2 py-0.5 text-[11px] text-accent">
                            {lang === "ar" ? `+ ${fmt(extra)} هدية` : `+ ${fmt(extra)} bonus`}
                          </span>
                        )}
                      </span>
                      {active && <Check className="size-5 shrink-0 text-primary" />}
                    </button>
                  );
                })}

                <button
                  type="button"
                  onClick={() => setPack("custom")}
                  className={`flex items-center justify-between gap-3 rounded-2xl border p-4 text-start transition-colors sm:col-span-2 ${
                    pack === "custom"
                      ? "border-primary bg-primary/10"
                      : "border-border bg-background/60 hover:border-primary/50"
                  }`}
                >
                  <span>
                    <span className="block font-display text-sm">
                      {lang === "ar" ? "مبلغ مخصص" : "Custom amount"}
                    </span>
                    <span className="block text-[11px] text-muted-foreground">
                      {lang === "ar"
                        ? `اشحن أي مبلغ من ${MIN_TOPUP.toFixed(2)} إلى ${MAX_TOPUP} ر.ع`
                        : `Any amount between OMR ${MIN_TOPUP.toFixed(2)} and ${MAX_TOPUP}`}
                    </span>
                  </span>
                  {pack === "custom" && <Check className="size-5 shrink-0 text-primary" />}
                </button>
              </div>

              {pack === "custom" && (
                <div className="mt-3">
                  <span className="mb-1 block text-xs text-muted-foreground">
                    {lang === "ar" ? "المبلغ بالريال العُماني" : "Amount in OMR"}
                  </span>
                  <input
                    value={custom}
                    onChange={(e) => setCustom(e.target.value.replace(/[^\d.,]/g, ""))}
                    inputMode="decimal"
                    dir="ltr"
                    placeholder="5.00"
                    className={inputCls}
                  />
                </div>
              )}

              <div className="mt-4 flex items-center justify-between rounded-2xl border border-primary/40 bg-primary/5 p-4">
                <span className="text-sm text-muted-foreground">
                  {lang === "ar" ? "الرصيد الذي سيُضاف" : "Credit to be added"}
                </span>
                <span className="font-display text-xl text-primary">{fmt(credited)}</span>
              </div>
            </Section>

            <Section
              icon={<Wallet className="size-4" />}
              title={lang === "ar" ? "بياناتك" : "Your details"}
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-xs text-muted-foreground">
                    {lang === "ar" ? "الاسم *" : "Name *"}
                  </span>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className={inputCls}
                  />
                </label>
                <label className="block min-w-0">
                  <span className="mb-1 block text-xs text-muted-foreground">
                    {lang === "ar" ? "رقم للتواصل (واتساب) *" : "Contact number (WhatsApp) *"}
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
                </label>
              </div>
              <div className="mt-3">
                <span className="mb-1 block text-xs text-muted-foreground">
                  {lang === "ar" ? "ملاحظة (اختياري)" : "Note (optional)"}
                </span>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  className="w-full rounded-xl border border-border bg-background/60 px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </div>
            </Section>

            <Section
              icon={<Banknote className="size-4" />}
              title={lang === "ar" ? "طريقة الدفع" : "Payment method"}
            >
              <PaymentPicker total={amount} state={pay} setState={setPay} />
            </Section>

            <div className="rounded-3xl glass-panel p-5 sm:p-6">
              <div className="flex items-center justify-between font-display text-xl">
                <span>{lang === "ar" ? "إجمالي الشحن" : "Top-up total"}</span>
                <span className="text-primary">{fmt(credited)}</span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {lang === "ar"
                  ? "بعد مراجعة الإيصال يُضاف الرصيد لحسابك مباشرة، وستصلك رسالة على الواتساب."
                  : "Once the receipt is reviewed the balance is added and you get a WhatsApp message."}
              </p>
              <button
                disabled={busy}
                onClick={() => void submit()}
                className="mt-5 hidden h-14 w-full rounded-2xl bg-primary font-display text-lg text-primary-foreground disabled:opacity-60 sm:block"
              >
                {busy ? "..." : lang === "ar" ? "إرسال طلب الشحن" : "Send top-up request"}
              </button>
            </div>
          </div>
        )}
      </section>

      {user && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 p-3 backdrop-blur-xl sm:hidden">
          <button
            disabled={busy}
            onClick={() => void submit()}
            className="h-14 w-full rounded-2xl bg-primary font-display text-lg text-primary-foreground disabled:opacity-60"
          >
            {busy ? "..." : `${lang === "ar" ? "شحن" : "Top up"} · ${fmt(credited)}`}
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
