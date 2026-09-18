import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Activity,
  BookOpen,
  CheckCircle2,
  Clock,
  Download,
  Link2,
  Link2Off,
  Mail,
  RefreshCw,
  Search,
  Server,
  ShieldCheck,
  XCircle,
} from "lucide-react";

import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { downloadBankVerifyServerZip } from "@/lib/zip";
import {
  bankGmailCheck,
  bankGmailDisconnect,
  bankOauthStart,
  bankServerStatus,
  getBankVerifyConfig,
  omr3,
  onBankVerifyLog,
  onBankVerifyState,
  onUsedBankTx,
  saveBankVerifyConfig,
  type BankVerifyConfig,
  type BankVerifyLog,
  type BankVerifyState,
  type GmailCheck,
  type ServerStatus,
  type UsedBankTx,
} from "@/lib/bank-verify";

const inputCls =
  "h-12 w-full rounded-xl border border-border bg-background/60 px-3 text-sm outline-none focus:border-primary";
const cardCls = "rounded-2xl glass-panel p-5 space-y-3";
const btnPrimary =
  "inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-4 font-display text-sm text-primary-foreground disabled:opacity-60";
const btnGhost =
  "inline-flex h-11 items-center gap-2 rounded-xl border border-border px-4 font-display text-sm hover:border-primary disabled:opacity-60";

/** قسم إدارة نظام التحقق البنكي في لوحة التحكم. */
export function BankVerifyPanel() {
  const { lang } = useI18n();
  const { user } = useAuth();
  const ar = lang === "ar";

  const [cfg, setCfg] = useState<BankVerifyConfig>({ url: "", token: "" });
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState("");
  const [srv, setSrv] = useState<ServerStatus | null>(null);
  const [srvErr, setSrvErr] = useState("");
  const [state, setState] = useState<BankVerifyState>({});
  const [log, setLog] = useState<BankVerifyLog[]>([]);
  const [used, setUsed] = useState<UsedBankTx[]>([]);
  const [check, setCheck] = useState<GmailCheck | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    void getBankVerifyConfig().then(setCfg).catch(() => {});
  }, [user?.uid]);
  useEffect(() => onBankVerifyState(setState), []);
  useEffect(() => onBankVerifyLog(setLog), []);
  useEffect(() => onUsedBankTx(setUsed), []);
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(i);
  }, []);

  // نتيجة الرجوع من Google OAuth
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const g = q.get("gmail");
    if (!g) return;
    if (g === "connected") toast.success(ar ? "تم ربط حساب Gmail بنجاح" : "Gmail connected");
    else {
      const reason = q.get("reason") || "";
      toast.error(
        (ar ? "فشل ربط Gmail" : "Gmail link failed") +
          (reason === "no-refresh-token"
            ? ar
              ? " — أزل صلاحية التطبيق من حساب Google ثم أعد المحاولة"
              : " — remove the app from your Google account and retry"
            : reason === "scope-denied"
              ? ar
                ? " — يجب الموافقة على صلاحية قراءة الرسائل"
                : " — read permission must be granted"
              : reason
                ? ` (${reason})`
                : ""),
      );
    }
    q.delete("gmail");
    q.delete("reason");
    window.history.replaceState({}, "", window.location.pathname + (q.toString() ? "?" + q : ""));
  }, []);

  const configured = Boolean(cfg.url && cfg.token);
  const running = Boolean(state.lastPollAt && now - state.lastPollAt < 90_000);
  const gmail = state.gmail || {};
  const dt = (ts?: number) => (ts ? new Date(ts).toLocaleString(ar ? "ar-OM" : "en-GB") : "—");

  async function save() {
    setSaving(true);
    try {
      await saveBankVerifyConfig(cfg);
      toast.success(ar ? "تم الحفظ" : "Saved");
      await ping();
    } catch (e) {
      const msg = String((e as Error)?.message || e);
      const denied = msg.startsWith("permission:");
      toast.error(
        denied
          ? ar
            ? "تعذر الحفظ: القواعد ترفض الكتابة على " + msg.slice(11) + " — حدّث قواعد قاعدة البيانات في Firebase"
            : "Save failed: rules deny write to " + msg.slice(11)
          : (ar ? "تعذر الحفظ: " : "Save failed: ") + msg,
      );
    } finally {
      setSaving(false);
    }
  }

  async function ping() {
    setBusy("ping");
    setSrvErr("");
    try {
      setSrv(await bankServerStatus(cfg));
    } catch (e) {
      setSrv(null);
      const m = e instanceof Error ? e.message : "";
      setSrvErr(
        m === "token"
          ? ar
            ? "التوكن غير مطابق للخدمة (401)"
            : "Token rejected by the service (401)"
          : ar
            ? "تعذر الوصول للخدمة — تأكد من الرابط وأن الخدمة تعمل"
            : "Cannot reach the service — check the URL",
      );
    } finally {
      setBusy("");
    }
  }

  async function connectGmail() {
    setBusy("oauth");
    try {
      const url = await bankOauthStart(cfg);
      window.location.href = url;
    } catch (e) {
      const m = e instanceof Error ? e.message : "";
      toast.error(
        m.startsWith("missing:")
          ? (ar ? "متغيرات ناقصة على Railway: " : "Missing Railway variables: ") + m.slice(8)
          : m === "token"
            ? ar
              ? "التوكن غير مطابق"
              : "Token rejected"
            : ar
              ? "تعذر بدء الربط"
              : "Could not start linking",
      );
      setBusy("");
    }
  }

  async function disconnectGmail() {
    if (!window.confirm(ar ? "إلغاء ربط حساب Gmail؟ سيتوقف التحقق التلقائي." : "Disconnect Gmail? Auto-verification will stop.")) return;
    setBusy("disc");
    try {
      await bankGmailDisconnect(cfg);
      toast.success(ar ? "تم إلغاء الربط" : "Disconnected");
    } catch {
      toast.error(ar ? "تعذر إلغاء الربط" : "Disconnect failed");
    } finally {
      setBusy("");
    }
  }

  async function runCheck() {
    setBusy("check");
    setCheck(null);
    try {
      setCheck(await bankGmailCheck(cfg));
    } catch {
      setCheck({ ok: false, error: ar ? "تعذر الوصول للخدمة" : "Cannot reach the service" });
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="space-y-4">
      {/* ------- حالة سريعة ------- */}
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat
          icon={<Mail className="size-4" />}
          label={ar ? "حساب Gmail" : "Gmail account"}
          value={gmail.connected ? (ar ? "متصل" : "Connected") : ar ? "غير متصل" : "Not connected"}
          tone={gmail.connected ? "ok" : "bad"}
          sub={gmail.email || ""}
        />
        <Stat
          icon={<Activity className="size-4" />}
          label={ar ? "خدمة التحقق" : "Verification service"}
          value={running ? (ar ? "تعمل" : "Running") : ar ? "متوقفة" : "Stopped"}
          tone={running ? "ok" : "bad"}
          sub={state.lastPollAt ? `${ar ? "آخر فحص" : "Last check"}: ${dt(state.lastPollAt)}` : ""}
        />
        <Stat
          icon={<CheckCircle2 className="size-4" />}
          label={ar ? "عمليات تحقق ناجحة" : "Verified"}
          value={String(state.stats?.verified || 0)}
          tone="ok"
        />
        <Stat
          icon={<XCircle className="size-4" />}
          label={ar ? "انتهت مهلتها" : "Expired"}
          value={String(state.stats?.expired || 0)}
          tone="warn"
        />
      </div>

      {(state.lastError || gmail.error) && (
        <p className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
          ⚠️ {state.lastError || gmail.error}
        </p>
      )}

      {/* ------- إعداد الخدمة ------- */}
      <div className={cardCls}>
        <div className="flex items-center gap-2">
          <span className="grid size-9 place-items-center rounded-xl bg-primary/15 text-primary">
            <Server className="size-4" />
          </span>
          <h2 className="font-display text-lg">{ar ? "خدمة التحقق (Railway)" : "Verification service (Railway)"}</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          {ar
            ? "الصق رابط الخدمة بعد نشرها على Railway، والتوكن نفسه الذي وضعته في متغير TOKEN. التوكن يُحفظ في مسار يقرؤه الأدمن فقط."
            : "Paste the Railway service URL and the same TOKEN you configured there. The token is stored admin-only."}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <input
            value={cfg.url}
            onChange={(e) => setCfg({ ...cfg, url: e.target.value })}
            dir="ltr"
            placeholder="https://nmct-bank-verify.up.railway.app"
            className={inputCls}
          />
          <input
            value={cfg.token}
            onChange={(e) => setCfg({ ...cfg, token: e.target.value })}
            dir="ltr"
            type="password"
            placeholder={ar ? "التوكن (TOKEN)" : "Service token"}
            className={inputCls}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button disabled={saving} onClick={() => void save()} className={btnPrimary}>
            {ar ? "حفظ" : "Save"}
          </button>
          <button disabled={!configured || busy === "ping"} onClick={() => void ping()} className={btnGhost}>
            <RefreshCw className={`size-4 ${busy === "ping" ? "animate-spin" : ""}`} />
            {ar ? "فحص الاتصال" : "Test connection"}
          </button>
        </div>
        {srvErr && <p className="text-xs text-destructive">{srvErr}</p>}
        {srv && (
          <div className="grid gap-1 rounded-xl border border-border p-3 text-xs text-muted-foreground sm:grid-cols-2">
            <p className="text-emerald-400">✅ {ar ? "الخدمة متصلة والتوكن صحيح" : "Service reachable, token OK"}</p>
            <p>
              {ar ? "مهلة التحقق:" : "Window:"} {srv.verifyWindowMinutes} {ar ? "دقائق" : "min"} · {ar ? "الفحص كل" : "poll every"}{" "}
              {srv.pollSeconds}s
            </p>
            <p dir="ltr" className="truncate sm:col-span-2">
              Redirect URI: <span className="font-tech text-foreground">{srv.redirectUri || "—"}</span>
            </p>
            {!!srv.missingConfig?.length && (
              <p className="text-destructive sm:col-span-2">
                ⚠️ {ar ? "متغيرات ناقصة على Railway:" : "Missing Railway variables:"} {srv.missingConfig.join(", ")}
              </p>
            )}
          </div>
        )}
      </div>

      {/* ------- شرح المتغيرات ------- */}
      <VariablesGuide ar={ar} redirectUri={srv?.redirectUri} missing={srv?.missingConfig} />

      {/* ------- Gmail ------- */}
      <div className={cardCls}>
        <div className="flex items-center gap-2">
          <span className="grid size-9 place-items-center rounded-xl bg-primary/15 text-primary">
            <Mail className="size-4" />
          </span>
          <h2 className="font-display text-lg">{ar ? "ربط حساب Gmail" : "Gmail account"}</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          {ar
            ? "الربط عبر Google OAuth الرسمي بصلاحية قراءة الرسائل فقط (gmail.readonly). لا تُخزَّن كلمة المرور، ويمكنك إلغاء الربط في أي وقت."
            : "Official Google OAuth with read-only access (gmail.readonly). No password is stored; you can disconnect anytime."}
        </p>
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-3">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
              gmail.connected ? "bg-emerald-500/15 text-emerald-400" : "bg-destructive/15 text-destructive"
            }`}
          >
            {gmail.connected ? <Link2 className="size-3" /> : <Link2Off className="size-3" />}
            {gmail.connected ? (ar ? "متصل" : "Connected") : ar ? "غير متصل" : "Not connected"}
          </span>
          <span dir="ltr" className="font-tech text-sm">
            {gmail.email || "—"}
          </span>
          {gmail.connectedAt && gmail.connected && (
            <span className="text-xs text-muted-foreground">
              {ar ? "منذ" : "since"} {dt(gmail.connectedAt)}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {!gmail.connected ? (
            <button disabled={!configured || busy === "oauth"} onClick={() => void connectGmail()} className={btnPrimary}>
              <Link2 className="size-4" />
              {ar ? "ربط حساب Gmail" : "Link Gmail account"}
            </button>
          ) : (
            <button disabled={busy === "disc"} onClick={() => void disconnectGmail()} className={`${btnGhost} border-destructive text-destructive`}>
              <Link2Off className="size-4" />
              {ar ? "إلغاء الربط" : "Disconnect"}
            </button>
          )}
          <button disabled={!configured || !gmail.connected || busy === "check"} onClick={() => void runCheck()} className={btnGhost}>
            <Search className={`size-4 ${busy === "check" ? "animate-pulse" : ""}`} />
            {ar ? "فحص قراءة الإشعارات" : "Test notification reading"}
          </button>
        </div>
        {!configured && (
          <p className="text-xs text-amber-400">{ar ? "احفظ رابط الخدمة والتوكن أولاً." : "Save the service URL and token first."}</p>
        )}
        {check && (
          <div className="rounded-xl border border-border p-3 text-xs">
            {check.ok ? (
              <>
                <p className="text-emerald-400">
                  ✅ {ar ? "تم العثور على" : "Found"} {check.found} {ar ? "رسالة، تم تحليل" : "messages, parsed"} {check.parsed}{" "}
                  {ar ? "إشعار إيداع بنجاح" : "credit notifications"}
                </p>
                {!!check.sample?.length && (
                  <ul className="mt-2 space-y-1 text-muted-foreground">
                    {check.sample.map((s, i) => (
                      <li key={i} dir="ltr" className="font-tech">
                        {omr3(s.amount, "en")} · ref {s.reference} · {s.senderName} · {s.txDate}
                      </li>
                    ))}
                  </ul>
                )}
                <p dir="ltr" className="mt-2 truncate text-muted-foreground">
                  query: {check.query}
                </p>
              </>
            ) : (
              <p className="text-destructive">❌ {check.error}</p>
            )}
          </div>
        )}
      </div>

      {/* ------- سجل التحقق ------- */}
      <div className={cardCls}>
        <div className="flex items-center gap-2">
          <span className="grid size-9 place-items-center rounded-xl bg-primary/15 text-primary">
            <ShieldCheck className="size-4" />
          </span>
          <h2 className="font-display text-lg">{ar ? "آخر عمليات التحقق" : "Recent verifications"}</h2>
        </div>
        {log.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
            {ar ? "لا توجد عمليات بعد." : "No verifications yet."}
          </p>
        ) : (
          <div className="divide-y divide-border/60">
            {log.slice(0, 30).map((l) => (
              <div key={l.id} className="flex flex-wrap items-center gap-3 py-2 text-xs">
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-semibold ${
                    l.kind === "verified" ? "bg-emerald-500/15 text-emerald-400" : "bg-destructive/15 text-destructive"
                  }`}
                >
                  {l.kind === "verified" ? <CheckCircle2 className="size-3" /> : <XCircle className="size-3" />}
                  {l.kind === "verified" ? (ar ? "تم التحقق" : "Verified") : ar ? "انتهت المهلة" : "Expired"}
                </span>
                <span className="font-tech">#{l.topupNo}</span>
                <span className="font-tech text-primary">{omr3(l.amount, lang)}</span>
                {l.reference && (
                  <span dir="ltr" className="font-tech text-muted-foreground">
                    ref {l.reference}
                  </span>
                )}
                {l.senderName && <span className="text-muted-foreground">{l.senderName}</span>}
                {typeof l.tookMs === "number" && l.kind === "verified" && (
                  <span className="text-muted-foreground">
                    ⏱ {Math.round(l.tookMs / 1000)}s
                  </span>
                )}
                <span className="ms-auto flex items-center gap-1 text-muted-foreground">
                  <Clock className="size-3" />
                  {dt(l.at)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ------- العمليات البنكية المستخدمة ------- */}
      <div className={cardCls}>
        <div className="flex items-center gap-2">
          <span className="grid size-9 place-items-center rounded-xl bg-primary/15 text-primary">
            <CheckCircle2 className="size-4" />
          </span>
          <h2 className="font-display text-lg">{ar ? "العمليات البنكية المستخدمة" : "Used bank transactions"}</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          {ar
            ? "كل عملية هنا مرتبطة بطلب واحد فقط ولا يمكن استخدامها مرة أخرى. تُعرض بيانات مقنّعة فقط."
            : "Each transaction is bound to exactly one request and can never be reused. Only masked data is shown."}
        </p>
        {used.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
            {ar ? "لا توجد عمليات بعد." : "No transactions yet."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-muted-foreground">
                <tr className="text-start">
                  <th className="py-2 text-start">{ar ? "الطلب" : "Request"}</th>
                  <th className="py-2 text-start">{ar ? "المبلغ" : "Amount"}</th>
                  <th className="py-2 text-start">{ar ? "المرجع" : "Reference"}</th>
                  <th className="py-2 text-start">{ar ? "المحوِّل" : "Sender"}</th>
                  <th className="py-2 text-start">{ar ? "تاريخ العملية" : "Tx date"}</th>
                  <th className="py-2 text-start">{ar ? "استُخدمت في" : "Used at"}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {used.slice(0, 50).map((u) => (
                  <tr key={u.id}>
                    <td className="py-2 font-tech">#{u.topupNo}</td>
                    <td className="py-2 font-tech text-primary">{omr3(u.amount, lang)}</td>
                    <td dir="ltr" className="py-2 font-tech">
                      {u.reference}
                    </td>
                    <td className="py-2">{u.senderName || "—"}</td>
                    <td dir="ltr" className="py-2 font-tech">
                      {u.txDate || "—"}
                    </td>
                    <td className="py-2 text-muted-foreground">{dt(u.usedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ------- تحميل الملفات ------- */}
      <div className={cardCls}>
        <p className="font-display text-sm">{ar ? "ملفات نظام التحقق (Railway)" : "Verification system files (Railway)"}</p>
        <p className="text-xs text-muted-foreground">
          {ar
            ? "حمّل المشروع كاملاً (server.js, src/*, package.json, .env.example, README.md بالشرح خطوة بخطوة) وارفعه على GitHub ثم انشره على Railway. لا يحتوي أي أسرار — كل المفاتيح توضع في متغيرات البيئة."
            : "Download the full project (server.js, src/*, package.json, .env.example, README.md with a step-by-step guide), push it to GitHub and deploy on Railway. It contains no secrets — everything goes in environment variables."}
        </p>
        <button
          onClick={async () => {
            try {
              await downloadBankVerifyServerZip();
              toast.success(ar ? "تم التحميل" : "Downloaded");
            } catch {
              toast.error(ar ? "تعذر تحميل الملفات" : "Download failed");
            }
          }}
          className="inline-flex h-11 items-center gap-2 rounded-xl bg-accent px-5 font-display text-sm text-accent-foreground"
        >
          <Download className="size-4" />
          {ar ? "تحميل ملفات نظام التحقق" : "Download verification system files"}
        </button>
      </div>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  tone: "ok" | "bad" | "warn";
}) {
  const color = tone === "ok" ? "text-emerald-400" : tone === "bad" ? "text-destructive" : "text-amber-400";
  return (
    <div className="rounded-2xl glass-panel p-4">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </p>
      <p className={`mt-1 font-display text-xl ${color}`}>{value}</p>
      {sub && (
        <p dir="ltr" className="truncate text-[11px] text-muted-foreground">
          {sub}
        </p>
      )}
    </div>
  );
}

/** دليل متغيرات البيئة داخل الصفحة: ماذا يعني كل متغير وكيف تضيفه. */
function VariablesGuide({ ar, redirectUri, missing }: { ar: boolean; redirectUri?: string | undefined; missing?: string[] | undefined }) {
  const vars: { name: string; descAr: string; descEn: string; where: { ar: string; en: string } }[] = [
    {
      name: "TOKEN",
      descAr: "كلمة سر طويلة تخترعها أنت (أي نص عشوائي). نفس القيمة تُكتب في حقل التوكن أعلاه.",
      descEn: "A long random string you invent. The same value goes in the token field above.",
      where: { ar: "تختارها بنفسك", en: "You choose it" },
    },
    {
      name: "ENCRYPTION_KEY",
      descAr: "مفتاح تشفير 64 حرفاً لتشفير رمز Gmail قبل حفظه. أنشئه بالأمر: openssl rand -hex 32",
      descEn: "64-char hex key encrypting the Gmail token. Generate with: openssl rand -hex 32",
      where: { ar: "أنشئه محلياً بالأمر", en: "Generate locally" },
    },
    {
      name: "GOOGLE_CLIENT_ID",
      descAr: "معرّف عميل OAuth من Google Cloud.",
      descEn: "OAuth client ID from Google Cloud.",
      where: { ar: "Google Cloud › APIs & Services › Credentials › Create OAuth client ID (Web)", en: "Google Cloud › Credentials › Create OAuth client ID (Web)" },
    },
    {
      name: "GOOGLE_CLIENT_SECRET",
      descAr: "السر المرافق لعميل OAuth من نفس الصفحة.",
      descEn: "The OAuth client secret from the same page.",
      where: { ar: "نفس صفحة Credentials في Google Cloud", en: "Same Google Cloud Credentials page" },
    },
    {
      name: "PUBLIC_URL",
      descAr: "رابط خدمتك العام على Railway بدون / في النهاية، مثال: https://xxxx.up.railway.app",
      descEn: "Your public Railway URL without trailing slash, e.g. https://xxxx.up.railway.app",
      where: { ar: "Railway › Settings › Domains", en: "Railway › Settings › Domains" },
    },
    {
      name: "SITE_URL",
      descAr: "رابط الموقع الحالي (يُستخدم للرجوع بعد ربط Gmail وللسماح بالاتصال).",
      descEn: "This site's URL (OAuth return + allowed origin).",
      where: { ar: "انسخ رابط موقعك من المتصفح", en: "Copy your site URL from the browser" },
    },
    {
      name: "FIREBASE_DB_URL",
      descAr: "رابط قاعدة البيانات، مثال: https://xxxx-default-rtdb.firebaseio.com",
      descEn: "Realtime Database URL, e.g. https://xxxx-default-rtdb.firebaseio.com",
      where: { ar: "Firebase › Realtime Database (أعلى الصفحة)", en: "Firebase › Realtime Database (top of page)" },
    },
    {
      name: "FIREBASE_DB_SECRET",
      descAr: "سر قاعدة البيانات (Database secret) — قديم لكنه ما زال يعمل، ويمنح الخدمة وصولاً كاملاً.",
      descEn: "Database secret — grants the service full database access.",
      where: { ar: "Firebase › Project settings › Service accounts › Database secrets", en: "Firebase › Project settings › Service accounts › Database secrets" },
    },
    {
      name: "FIREBASE_API_KEY",
      descAr: "مفتاح الويب العام لمشروع Firebase (للتحقق من هوية المستخدمين فقط).",
      descEn: "Public Firebase web API key (user identity checks only).",
      where: { ar: "Firebase › Project settings › General › Web API Key", en: "Firebase › Project settings › General › Web API Key" },
    },
  ];

  return (
    <div className={cardCls}>
      <div className="flex items-center gap-2">
        <span className="grid size-9 place-items-center rounded-xl bg-primary/15 text-primary">
          <BookOpen className="size-4" />
        </span>
        <h2 className="font-display text-lg">{ar ? "شرح المتغيرات وكيفية إضافتها" : "Variables guide"}</h2>
      </div>

      {!!missing?.length && (
        <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-400">
          ⚠️ {ar ? "لهذا السبب يظهر «تعذر بدء الربط» — المتغيرات التالية ناقصة على Railway: " : "This is why linking fails — missing on Railway: "}
          <span dir="ltr" className="font-tech">{missing.join(", ")}</span>
        </p>
      )}

      <div className="space-y-2 text-xs text-muted-foreground">
        <p className="font-semibold text-foreground">{ar ? "كيف أضيف المتغيرات؟" : "How do I add variables?"}</p>
        <ol className="list-decimal space-y-1 ps-5">
          <li>{ar ? "افتح مشروعك في Railway › اختر الخدمة › تبويب Variables." : "Open your Railway project › service › Variables tab."}</li>
          <li>{ar ? "اضغط New Variable، اكتب الاسم تماماً كما في الجدول، والصق القيمة." : "Click New Variable, type the exact name, paste the value."}</li>
          <li>{ar ? "بعد إضافة كل المتغيرات أعد النشر (Redeploy) ثم اضغط «فحص الاتصال» هنا." : "After adding all of them, redeploy, then press Test connection here."}</li>
        </ol>
        <p className="font-semibold text-foreground">{ar ? "قبل ذلك: فعّل Gmail API وأنشئ عميل OAuth" : "Before that: enable Gmail API and create the OAuth client"}</p>
        <ol className="list-decimal space-y-1 ps-5">
          <li>{ar ? "console.cloud.google.com › أنشئ مشروعاً › APIs & Services › Library › فعّل Gmail API." : "console.cloud.google.com › create a project › Library › enable Gmail API."}</li>
          <li>{ar ? "OAuth consent screen › External › أكمل الإعداد وأضف بريدك كـ Test user." : "OAuth consent screen › External › finish setup and add your email as a Test user."}</li>
          <li>
            {ar ? "Credentials › Create OAuth client ID (Web) › أضف Redirect URI التالي بالضبط:" : "Credentials › Create OAuth client ID (Web) › add exactly this Redirect URI:"}
            <span dir="ltr" className="mt-1 block select-all rounded-lg border border-border bg-background/60 p-2 font-tech text-foreground">
              {redirectUri || "https://<your-service>.up.railway.app/oauth/google/callback"}
            </span>
          </li>
          <li>{ar ? "انسخ Client ID و Client Secret إلى متغيرات Railway." : "Copy Client ID and Client Secret into Railway variables."}</li>
        </ol>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-xs">
          <thead className="bg-background/40 text-muted-foreground">
            <tr className="text-start">
              <th className="p-2 text-start">{ar ? "المتغير" : "Variable"}</th>
              <th className="p-2 text-start">{ar ? "المعنى" : "Meaning"}</th>
              <th className="p-2 text-start">{ar ? "من أين أحصل عليه" : "Where to get it"}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {vars.map((v) => (
              <tr key={v.name} className={missing?.includes(v.name) ? "bg-amber-500/5" : ""}>
                <td dir="ltr" className="p-2 font-tech text-primary">
                  {v.name}
                  {missing?.includes(v.name) && <span className="ms-1 text-amber-400">⚠️</span>}
                </td>
                <td className="p-2">{ar ? v.descAr : v.descEn}</td>
                <td className="p-2 text-muted-foreground">{ar ? v.where.ar : v.where.en}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
