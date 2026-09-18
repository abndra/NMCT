import { createFileRoute, useRouter, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  Banknote,
  CheckCircle2,
  Clock,
  Copy,
  Hash,
  Landmark,
  Loader2,
  Receipt,
  ShieldCheck,
  Wallet,
  XCircle,
} from "lucide-react";

import { Layout } from "@/components/site/Layout";
import { ImageUploader } from "@/components/site/ImageUploader";
import { useAuth, GoogleMark } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useCurrency } from "@/lib/currency";
import { DIAL_CODES } from "@/lib/country-codes";
import { DEFAULT_COUNTRY_CODE, readPaymentMethods, waNumber } from "@/lib/db";
import { useSettings } from "@/hooks/use-store-data";
import { useBalance } from "@/hooks/use-wallet";
import { VERIFY_WINDOW_MS, kickBankVerification, omr3 } from "@/lib/bank-verify";
import {
  createTopupRequest,
  formatTopupNo,
  notifyNewTopup,
  onTopupChange,
  MAX_TOPUP,
  MIN_TOPUP,
  type TopupRequest,
} from "@/lib/wallet";

export const Route = createFileRoute("/topup")({
  head: () => ({
    meta: [
      { title: "شحن الرصيد بالتحويل البنكي | NMCT" },
      {
        name: "description",
        content:
          "اشحن رصيد محفظتك في NMCT بالتحويل البنكي — يتم التحقق من التحويل تلقائياً خلال 3 دقائق ويُضاف الرصيد فوراً.",
      },
      { property: "og:title", content: "شحن الرصيد بالتحويل البنكي | NMCT" },
      { property: "og:description", content: "تحقق تلقائي من التحويل البنكي وإضافة الرصيد خلال دقائق." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TopupPage,
});

const inputCls =
  "h-12 w-full rounded-xl border border-border bg-background/60 px-3 text-sm outline-none transition-colors focus:border-primary";

const QUICK_AMOUNTS = [1, 3, 5, 10];

function TopupPage() {
  const { lang, dir } = useI18n();
  const { fmt } = useCurrency();
  const { user, promptLogin } = useAuth();
  const { balance } = useBalance();
  const router = useRouter();
  const settings = useSettings();

  const [amountText, setAmountText] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [cc, setCc] = useState(DEFAULT_COUNTRY_CODE);
  const [bankRef, setBankRef] = useState("");
  const [note, setNote] = useState("");
  const [receipt, setReceipt] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [activeId, setActiveId] = useState<string>("");

  const bank = useMemo(
    () => readPaymentMethods(settings).find((m) => m.currency === "OMR" || m.id === "bank"),
    [settings],
  );

  useEffect(() => {
    const saved = String(settings["countryCode"] || "").replace(/\D/g, "");
    if (saved && DIAL_CODES.some((d) => d.code === saved)) setCc(saved);
  }, [settings["countryCode"]]);

  useEffect(() => {
    if (user?.displayName && !name) setName(user.displayName);
  }, [user, name]);

  const amount = Math.max(0, Number(amountText.replace(",", ".")) || 0);
  const BackIcon = dir === "rtl" ? ArrowRight : ArrowLeft;

  async function submit() {
    if (!user) {
      promptLogin();
      return;
    }
    if (amount < MIN_TOPUP) {
      toast.error(lang === "ar" ? `أقل مبلغ للشحن هو ${omr3(MIN_TOPUP)}` : `Minimum top-up is ${omr3(MIN_TOPUP, "en")}`);
      return;
    }
    if (amount > MAX_TOPUP) {
      toast.error(lang === "ar" ? `أقصى مبلغ للشحن هو ${MAX_TOPUP} ر.ع` : `Maximum top-up is OMR ${MAX_TOPUP}`);
      return;
    }
    if (!name.trim()) {
      toast.error(lang === "ar" ? "أدخل اسمك" : "Enter your name");
      return;
    }
    if (phone.replace(/\D/g, "").replace(/^0+/, "").length < 6) {
      toast.error(lang === "ar" ? "أدخل رقم واتساب صحيح" : "Enter a valid WhatsApp number");
      return;
    }
    const ref = bankRef.trim();
    if (ref.replace(/\D/g, "").length < 4) {
      toast.error(
        lang === "ar"
          ? "أدخل رقم/مرجع التحويل البنكي كما ظهر لك عند التحويل"
          : "Enter the bank transfer reference exactly as shown when you transferred",
      );
      return;
    }
    if (!receipt[0]) {
      toast.error(lang === "ar" ? "أرفق صورة إيصال التحويل" : "Attach the transfer receipt image");
      return;
    }


    setBusy(true);
    try {
      const now = Date.now();
      const payload = {
        uid: user.uid,
        userName: name.trim(),
        email: user.email || "",
        photo: user.photoURL || "",
        phone: waNumber(phone, cc),
        amount: Number(amount.toFixed(3)),
        packageName: lang === "ar" ? "تحويل بنكي" : "Bank transfer",
        note: note.trim(),
        paymentMethod: "bank",
        paymentMethodName: bank?.name || "تحويل بنكي",
        paymentCurrency: "OMR",
        amountToPay: amount.toFixed(3),
        paymentProof: receipt[0] || "bank-auto",
        verification: "bank" as const,
        bankRef: ref,
        verifyDeadline: now + VERIFY_WINDOW_MS,
      };
      const created = await createTopupRequest(payload, "verifying");
      setActiveId(created.id);
      void kickBankVerification(created.id);
      void notifyNewTopup({ ...payload, status: "verifying", createdAt: now }, formatTopupNo(created));
      window.scrollTo({ top: 0, behavior: "smooth" });
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
          <h1 className="font-display text-3xl">🏦 {lang === "ar" ? "شحن الرصيد بالتحويل البنكي" : "Top up by bank transfer"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {lang === "ar"
              ? "حوّل المبلغ، أدخل مرجع التحويل، ويتحقق النظام تلقائياً خلال 3 دقائق ويضيف الرصيد فوراً."
              : "Transfer the amount, enter the reference, and the system verifies automatically within 3 minutes."}
          </p>
        </div>

        {!user ? (
          <div className="mt-6 rounded-3xl glass-panel p-8 text-center">
            <p className="text-sm text-muted-foreground">
              {lang === "ar" ? "سجّل الدخول بحساب جوجل لشحن رصيدك." : "Sign in with Google to top up."}
            </p>
            <button
              onClick={promptLogin}
              className="mt-5 inline-flex h-12 items-center justify-center gap-3 rounded-xl border border-border bg-background px-6 font-display hover:border-primary"
            >
              <GoogleMark />
              {lang === "ar" ? "تسجيل الدخول" : "Sign in"}
            </button>
          </div>
        ) : activeId ? (
          <VerificationScreen
            id={activeId}
            onNew={() => {
              setActiveId("");
              setBankRef("");
              setAmountText("");
            }}
          />
        ) : (
          <div className="mt-6 space-y-5">
            {bank && (
              <Section icon={<Landmark className="size-4" />} title={lang === "ar" ? "بيانات الحساب البنكي" : "Bank account details"}>
                <p className="mb-3 text-xs text-muted-foreground">
                  {lang === "ar"
                    ? "حوّل المبلغ بالضبط إلى الحساب التالي، ثم أدخل رقم/مرجع التحويل في النموذج أدناه."
                    : "Transfer the exact amount to this account, then enter the transfer reference below."}
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {bank.fields.map((f) => (
                    <button
                      key={f.label}
                      type="button"
                      onClick={() => {
                        void navigator.clipboard?.writeText(f.value);
                        toast.success(lang === "ar" ? "تم النسخ" : "Copied");
                      }}
                      className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-background/60 p-3 text-start hover:border-primary/50"
                    >
                      <span className="min-w-0">
                        <span className="block text-[11px] text-muted-foreground">{f.label}</span>
                        <span dir="ltr" className="block truncate font-tech text-sm">{f.value}</span>
                      </span>
                      <Copy className="size-4 shrink-0 text-muted-foreground" />
                    </button>
                  ))}
                </div>
                {(lang === "ar" ? bank.note : bank.noteEn || bank.note) && (
                  <p className="mt-3 text-xs text-muted-foreground">{lang === "ar" ? bank.note : bank.noteEn || bank.note}</p>
                )}
              </Section>
            )}

            <Section icon={<Banknote className="size-4" />} title={lang === "ar" ? "مبلغ الشحن (OMR)" : "Top-up amount (OMR)"}>
              <div className="flex flex-wrap gap-2">
                {QUICK_AMOUNTS.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => setAmountText(q.toFixed(3))}
                    className={`h-10 rounded-xl border px-4 font-tech text-sm transition-colors ${
                      amount === q ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/50"
                    }`}
                  >
                    {q.toFixed(3)}
                  </button>
                ))}
              </div>
              <div className="mt-3">
                <span className="mb-1 block text-xs text-muted-foreground">
                  {lang === "ar" ? "المبلغ بالريال العُماني *" : "Amount in OMR *"}
                </span>
                <input
                  value={amountText}
                  onChange={(e) => setAmountText(e.target.value.replace(/[^\d.,]/g, ""))}
                  inputMode="decimal"
                  dir="ltr"
                  placeholder="0.001"
                  className={`${inputCls} font-tech text-base`}
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {lang === "ar"
                    ? `الحد الأدنى ${omr3(MIN_TOPUP)} — يجب أن يطابق المبلغ المحوَّل بالضبط.`
                    : `Minimum ${omr3(MIN_TOPUP, "en")} — must match the transferred amount exactly.`}
                </p>
              </div>
              <div className="mt-4 flex items-center justify-between rounded-2xl border border-primary/40 bg-primary/5 p-4">
                <span className="text-sm text-muted-foreground">{lang === "ar" ? "الرصيد الذي سيُضاف" : "Credit to be added"}</span>
                <span className="font-display text-xl text-primary">{omr3(amount, lang)}</span>
              </div>
            </Section>

            <Section icon={<Wallet className="size-4" />} title={lang === "ar" ? "بياناتك" : "Your details"}>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-xs text-muted-foreground">{lang === "ar" ? "الاسم *" : "Name *"}</span>
                  <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
                </label>
                <label className="block min-w-0">
                  <span className="mb-1 block text-xs text-muted-foreground">
                    {lang === "ar" ? "رقم التواصل عبر واتساب *" : "WhatsApp number *"}
                  </span>
                  <div dir="ltr" className="grid w-full grid-cols-[6.5rem_minmax(0,1fr)] items-stretch gap-2">
                    <select
                      value={cc}
                      onChange={(e) => setCc(e.target.value)}
                      className={`${inputCls} appearance-none px-2 text-center text-sm`}
                      aria-label={lang === "ar" ? "مفتاح الدولة" : "Country code"}
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

              <label className="mt-3 block">
                <span className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
                  <Hash className="size-3" />
                  {lang === "ar" ? "رقم / مرجع التحويل البنكي *" : "Bank transfer reference *"}
                </span>
                <input
                  value={bankRef}
                  onChange={(e) => setBankRef(e.target.value.replace(/[^\w-]/g, "").slice(0, 40))}
                  dir="ltr"
                  inputMode="numeric"
                  placeholder="75134243"
                  className={`${inputCls} font-tech text-base tracking-wider`}
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {lang === "ar"
                    ? "الرقم/المرجع الذي استخدمته عند التحويل (يظهر في تطبيق البنك وفي رسالة التأكيد)."
                    : "The reference you used when transferring (shown in your bank app and confirmation)."}
                </p>
              </label>

              <div className="mt-4">
                <span className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
                  <Receipt className="size-3" />
                  {lang === "ar" ? "صورة إيصال التحويل *" : "Transfer receipt image *"}
                </span>
                <ImageUploader images={receipt} onChange={setReceipt} folder="topup-receipts" multiple={false} />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {lang === "ar"
                    ? "أرفق لقطة شاشة أو صورة لإيصال التحويل البنكي — إجباري لإرسال الطلب."
                    : "Attach a screenshot or photo of the bank transfer receipt — required."}
                </p>
              </div>

              <div className="mt-3">
                <span className="mb-1 block text-xs text-muted-foreground">{lang === "ar" ? "ملاحظة (اختياري)" : "Note (optional)"}</span>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  className="w-full rounded-xl border border-border bg-background/60 px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </div>
            </Section>

            <div className="rounded-3xl glass-panel p-5 sm:p-6">
              <div className="flex items-center justify-between font-display text-xl">
                <span>{lang === "ar" ? "إجمالي الشحن" : "Top-up total"}</span>
                <span className="text-primary">{omr3(amount, lang)}</span>
              </div>
              <p className="mt-2 flex items-start gap-2 text-xs text-muted-foreground">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
                {lang === "ar"
                  ? "بعد الإرسال يبدأ التحقق التلقائي لمدة 3 دقائق. عند العثور على تحويل مطابق (نفس المبلغ والمرجع) يُضاف الرصيد فوراً."
                  : "After sending, automatic verification runs for 3 minutes. Once a matching transfer is found (same amount and reference) the balance is added instantly."}
              </p>
              <button
                disabled={busy}
                onClick={() => void submit()}
                className="mt-5 hidden h-14 w-full rounded-2xl bg-primary font-display text-lg text-primary-foreground disabled:opacity-60 sm:block"
              >
                {busy ? "..." : lang === "ar" ? "إرسال طلب الشحن والتحقق" : "Send & verify"}
              </button>
            </div>
          </div>
        )}
      </section>

      {user && !activeId && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 p-3 backdrop-blur-xl sm:hidden">
          <button
            disabled={busy}
            onClick={() => void submit()}
            className="h-14 w-full rounded-2xl bg-primary font-display text-lg text-primary-foreground disabled:opacity-60"
          >
            {busy ? "..." : `${lang === "ar" ? "شحن" : "Top up"} · ${omr3(amount, lang)}`}
          </button>
        </div>
      )}
    </Layout>
  );
}

/* ---------------- شاشة الانتظار / النتيجة ---------------- */
function VerificationScreen({ id, onNew }: { id: string; onNew: () => void }) {
  const { lang } = useI18n();
  const { balance } = useBalance();
  const [t, setT] = useState<TopupRequest | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => onTopupChange(id, setT), [id]);
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, []);

  const deadline = t?.verifyDeadline || (t?.createdAt || now) + VERIFY_WINDOW_MS;
  const left = Math.max(0, deadline - now);
  const mm = String(Math.floor(left / 60000)).padStart(2, "0");
  const ss = String(Math.floor((left % 60000) / 1000)).padStart(2, "0");
  const pct = Math.min(100, Math.max(0, 100 - (left / VERIFY_WINDOW_MS) * 100));
  const status = t?.status || "verifying";

  return (
    <div className="mt-6 space-y-4">
      <div className="rounded-3xl glass-panel p-6 text-center sm:p-8">
        {status === "approved" ? (
          <>
            <CheckCircle2 className="mx-auto size-16 text-emerald-400" />
            <h2 className="mt-4 font-display text-2xl">{lang === "ar" ? "تمت عملية الشحن بنجاح 🎉" : "Top-up successful 🎉"}</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {lang === "ar"
                ? `تم التحقق من التحويل البنكي وإضافة ${omr3(t?.amount || 0)} إلى رصيدك.`
                : `Your bank transfer was verified and ${omr3(t?.amount || 0, "en")} was added to your balance.`}
            </p>
            <p className="mt-4 font-display text-3xl text-primary">{omr3(balance, lang)}</p>
            <p className="text-xs text-muted-foreground">{lang === "ar" ? "رصيدك الحالي" : "Current balance"}</p>
          </>
        ) : status === "expired" ? (
          <>
            <XCircle className="mx-auto size-16 text-destructive" />
            <h2 className="mt-4 font-display text-2xl">{lang === "ar" ? "انتهت مهلة التحقق" : "Verification timed out"}</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {lang === "ar"
                ? "لم يتمكن النظام من العثور على عملية بنكية مطابقة خلال فترة التحقق، ولم يُضف أي رصيد. تأكد من المبلغ ومرجع التحويل ثم أعد المحاولة، أو تواصل معنا على الواتساب."
                : "No matching bank transaction was found during the verification window and no balance was added. Check the amount and reference and try again, or contact us on WhatsApp."}
            </p>
          </>
        ) : status === "rejected" ? (
          <>
            <XCircle className="mx-auto size-16 text-destructive" />
            <h2 className="mt-4 font-display text-2xl">{lang === "ar" ? "تم رفض الطلب" : "Request rejected"}</h2>
            {t?.rejectionReason && <p className="mt-2 text-sm text-muted-foreground">{t.rejectionReason}</p>}
          </>
        ) : (
          <>
            <div className="relative mx-auto grid size-28 place-items-center">
              <svg className="absolute inset-0 -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="44" className="fill-none stroke-border" strokeWidth="6" />
                <circle
                  cx="50"
                  cy="50"
                  r="44"
                  className="fill-none stroke-primary transition-[stroke-dashoffset] duration-1000"
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 44}
                  strokeDashoffset={(2 * Math.PI * 44 * pct) / 100}
                />
              </svg>
              <span dir="ltr" className="font-tech text-2xl text-primary">
                {mm}:{ss}
              </span>
            </div>
            <h2 className="mt-4 flex items-center justify-center gap-2 font-display text-2xl">
              <Loader2 className="size-5 animate-spin text-primary" />
              {lang === "ar" ? "قيد التحقق من التحويل" : "Verifying your transfer"}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {lang === "ar"
                ? "نبحث عن إشعار بنكي يطابق المبلغ ومرجع التحويل. يُضاف الرصيد تلقائياً فور العثور عليه — يمكنك إبقاء هذه الصفحة مفتوحة."
                : "We are looking for a bank notification matching your amount and reference. Balance is added automatically as soon as it is found."}
            </p>
          </>
        )}

        {t && (
          <div className="mt-6 grid gap-2 rounded-2xl border border-border bg-background/60 p-4 text-start text-xs text-muted-foreground sm:grid-cols-3">
            <p>
              {lang === "ar" ? "رقم الطلب:" : "Request:"} <span className="font-tech text-foreground">#{formatTopupNo(t)}</span>
            </p>
            <p>
              {lang === "ar" ? "المبلغ:" : "Amount:"} <span className="font-tech text-foreground">{omr3(t.amount, lang)}</span>
            </p>
            <p>
              {lang === "ar" ? "المرجع:" : "Reference:"} <span dir="ltr" className="font-tech text-foreground">{t.bankRef}</span>
            </p>
          </div>
        )}

        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link to="/wallet" className="inline-flex h-11 items-center gap-2 rounded-xl border border-border px-5 font-display text-sm hover:border-primary">
            <Wallet className="size-4" />
            {lang === "ar" ? "محفظتي" : "My wallet"}
          </Link>
          {(status === "expired" || status === "rejected") && (
            <button onClick={onNew} className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 font-display text-sm text-primary-foreground">
              <Clock className="size-4" />
              {lang === "ar" ? "إنشاء طلب جديد" : "New request"}
            </button>
          )}
          {status === "approved" && (
            <Link to="/store" className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 font-display text-sm text-primary-foreground">
              {lang === "ar" ? "تسوّق الآن" : "Shop now"}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-3xl glass-panel p-5 sm:p-6">
      <div className="mb-4 flex items-center gap-2">
        <span className="grid size-9 place-items-center rounded-xl bg-primary/15 text-primary">{icon}</span>
        <h2 className="font-display text-lg">{title}</h2>
      </div>
      {children}
    </div>
  );
}
