import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import type { User } from "firebase/auth";
import { ShieldBan } from "lucide-react";
import {
  onAuthChange,
  signInWithGoogle,
  logoutUser,
  handleRedirectResult,
  onBanChange,
  registerDevice,
} from "@/lib/db";
import { getDeviceId, getFingerprint } from "@/lib/device";
import { useI18n } from "@/lib/i18n";

type AuthCtx = {
  user: User | null;
  loading: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  /** Runs the action when signed in, otherwise opens the login dialog. */
  requireAuth: (action?: () => void) => boolean;
  promptLogin: () => void;
};

const Ctx = createContext<AuthCtx | null>(null);

/** Full-screen wall shown to banned accounts / devices. Nothing else renders. */
function BannedScreen() {
  return (
    <div className="fixed inset-0 z-[9999] grid place-items-center bg-background p-6 text-center">
      <div className="w-full max-w-md rounded-3xl border-2 border-destructive/60 bg-destructive/10 p-10 shadow-2xl">
        <ShieldBan className="mx-auto size-16 text-destructive" />
        <h1 className="mt-5 font-display text-4xl text-destructive">أنت محظور</h1>
        <p className="mt-3 text-sm text-destructive/90">
          تم حظر حسابك وجهازك من الوصول إلى هذا الموقع نهائياً.
        </p>
        <p className="mt-1 text-xs text-muted-foreground" dir="ltr">
          You are banned. This account and device are permanently blocked.
        </p>
      </div>
    </div>
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState(false);
  const [busy, setBusy] = useState(false);
  const [banned, setBanned] = useState(false);
  const [device, setDevice] = useState<{ id: string; fp: string } | null>(null);
  const { lang } = useI18n();

  useEffect(() => {
    let unsub = () => {};
    try {
      void handleRedirectResult();
      unsub = onAuthChange((u) => {
        setUser(u);
        setLoading(false);
        if (u) setDialog(false);
      });
    } catch {
      setLoading(false);
    }
    return () => unsub();
  }, []);

  // device identity (id + fingerprint) used by the ban system
  useEffect(() => {
    let alive = true;
    void (async () => {
      const id = getDeviceId();
      const fp = await getFingerprint();
      if (alive) setDevice({ id, fp });
    })();
    return () => {
      alive = false;
    };
  }, []);

  // live ban watch: device, fingerprint and signed-in account
  useEffect(() => {
    if (!device) return;
    let unsub = () => {};
    try {
      unsub = onBanChange({ deviceId: device.id, fp: device.fp, uid: user?.uid || "" }, (b) => {
        setBanned(b);
        if (b && user?.uid) void logoutUser(user.uid);
      });
    } catch {
      /* ignore */
    }
    return () => unsub();
  }, [device, user?.uid]);

  // remember every device this account signs in from
  useEffect(() => {
    if (!device || !user?.uid) return;
    void registerDevice(user.uid, device.id, device.fp);
  }, [device, user?.uid]);

  const signIn = useCallback(async () => {
    setBusy(true);
    try {
      const res = await signInWithGoogle();
      toast.success(lang === "ar" ? "تم تسجيل الدخول" : "Signed in");
      setDialog(false);

    } catch (err) {
      const msg = (err as Error)?.message;
      const code = (err as { code?: string })?.code;
      console.error("Google sign-in failed", { code, message: msg });
      toast.error(
        msg === "banned"
          ? lang === "ar"
            ? "هذا الحساب محظور"
            : "This account is banned"
          : code === "auth/unauthorized-domain"
            ? lang === "ar"
              ? "رابط الموقع غير مضاف ضمن النطاقات المصرح بها في Firebase"
              : "This site domain is not authorized in Firebase"
            : code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request"
              ? lang === "ar"
                ? "أُغلقت نافذة جوجل قبل إكمال الدخول"
                : "The Google window was closed before sign-in completed"
              : code === "auth/popup-blocked"
                ? lang === "ar"
                  ? "من فضلك اسمح بالنوافذ المنبثقة لهذا الموقع ثم حاول مجدداً"
                  : "Please allow pop-ups for this site, then try again"
                : code === "auth/operation-not-supported-in-this-environment"
                  ? lang === "ar"
                    ? "افتح الموقع مباشرة في Safari أو Chrome لإكمال الدخول"
                    : "Open this site directly in Safari or Chrome to sign in"
              : lang === "ar"
                ? `تعذر تسجيل الدخول بجوجل${code ? ` (${code})` : ""}`
                : `Google sign-in failed${code ? ` (${code})` : ""}`,
      );
    } finally {
      setBusy(false);
    }
  }, [lang]);

  const signOut = useCallback(async () => {
    await logoutUser(user?.uid);
    toast.success(lang === "ar" ? "تم تسجيل الخروج" : "Signed out");
  }, [user, lang]);

  const promptLogin = useCallback(() => setDialog(true), []);

  const requireAuth = useCallback(
    (action?: () => void) => {
      if (user) {
        action?.();
        return true;
      }
      setDialog(true);
      toast.info(
        lang === "ar"
          ? "سجّل الدخول بحساب جوجل لإتمام العملية"
          : "Sign in with Google to continue",
      );
      return false;
    },
    [user, lang],
  );

  if (banned) return <BannedScreen />;

  return (
    <Ctx.Provider value={{ user, loading, signIn, signOut, requireAuth, promptLogin }}>
      {children}
      {dialog && (
        <div
          className="fixed inset-0 z-[100] grid place-items-center bg-background/80 p-4 backdrop-blur-sm"
          onClick={() => setDialog(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-3xl border border-border bg-card p-7 text-center shadow-2xl"
          >
            <h2 className="font-display text-2xl">
              {lang === "ar" ? "تسجيل الدخول" : "Sign in"}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {lang === "ar"
                ? "التصفح متاح للجميع، لكن الإضافة للسلة وإتمام الطلب تتطلب حساب جوجل."
                : "Browsing is open, but adding to cart and ordering require a Google account."}
            </p>
            <button
              onClick={() => void signIn()}
              disabled={busy}
              className="mt-6 inline-flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-border bg-background font-display transition-colors hover:border-primary disabled:opacity-60"
            >
              <GoogleMark />
              {busy
                ? lang === "ar"
                  ? "جارٍ الدخول..."
                  : "Signing in..."
                : lang === "ar"
                  ? "المتابعة بحساب جوجل"
                  : "Continue with Google"}
            </button>
            <button
              onClick={() => setDialog(false)}
              className="mt-3 h-10 w-full rounded-xl text-sm text-muted-foreground hover:text-foreground"
            >
              {lang === "ar" ? "لاحقاً" : "Later"}
            </button>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}

export function GoogleMark({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.6 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.3 13.2 17.6 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.2-.4-4.7H24v9h12.7c-.5 3-2.2 5.5-4.7 7.2l7.3 5.7c4.3-3.9 7.2-9.8 7.2-17.2z" />
      <path fill="#FBBC05" d="M10.4 28.7a14.6 14.6 0 0 1 0-9.4l-7.8-6.1a24 24 0 0 0 0 21.6l7.8-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.3-5.7c-2 1.4-4.7 2.3-8.6 2.3-6.4 0-11.7-3.7-13.6-9.1l-7.8 6.1C6.5 42.6 14.6 48 24 48z" />
    </svg>
  );
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}