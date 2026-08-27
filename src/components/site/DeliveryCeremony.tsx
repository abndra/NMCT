import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, Zap } from "lucide-react";

import { useI18n } from "@/lib/i18n";

/**
 * أنيميشن التسليم الفوري (3 ثوانٍ) لطلبات الدفع بالرصيد.
 * لا يحتاج أي موافقة من الأدمن — المحتوى يوصل تلقائياً.
 */
export function DeliveryCeremony({
  state,
}: {
  state: "working" | "done" | "queued";
}) {
  const { lang } = useI18n();
  const [step, setStep] = useState(0);

  const steps =
    lang === "ar"
      ? ["تم خصم المبلغ من رصيدك", "جاري تجهيز طلبك من المخزون", "الإرسال على واتساب"]
      : ["Balance charged", "Preparing your items", "Sending on WhatsApp"];

  useEffect(() => {
    const a = setTimeout(() => setStep(1), 900);
    const b = setTimeout(() => setStep(2), 1900);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, []);

  const title =
    state === "done"
      ? lang === "ar"
        ? "تم التسليم فوراً ✅"
        : "Delivered instantly ✅"
      : state === "queued"
        ? lang === "ar"
          ? "تم الدفع — التسليم بعد لحظات"
          : "Paid — delivery in a moment"
        : lang === "ar"
          ? "جاري التسليم الفوري…"
          : "Instant delivery…";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/90 px-4 backdrop-blur-xl">
      <div className="delivery-pop w-full max-w-sm rounded-3xl border border-primary/40 bg-card/90 p-8 text-center shadow-[0_0_80px_-20px_var(--color-primary)]">
        <div className="relative mx-auto grid size-24 place-items-center">
          <span className="delivery-ring absolute inset-0 rounded-full border-2 border-primary/50" />
          <span className="delivery-ring absolute inset-0 rounded-full border-2 border-accent/40 [animation-delay:.4s]" />
          {state === "done" ? (
            <CheckCircle2 className="size-12 text-primary delivery-pop" />
          ) : (
            <Zap className="size-12 text-primary delivery-bolt" />
          )}
        </div>

        <h2 className="mt-6 font-display text-xl">{title}</h2>

        <ul className="mt-5 space-y-2 text-start text-sm">
          {steps.map((s, i) => {
            const active = state === "done" ? true : i <= step;
            return (
              <li
                key={s}
                className={`flex items-center gap-2 transition-all duration-500 ${
                  active ? "text-foreground opacity-100" : "text-muted-foreground opacity-50"
                }`}
              >
                {active && (state === "done" || i < step) ? (
                  <CheckCircle2 className="size-4 text-primary" />
                ) : (
                  <Loader2 className={`size-4 ${active ? "animate-spin text-primary" : ""}`} />
                )}
                {s}
              </li>
            );
          })}
        </ul>

        <p className="mt-5 font-tech text-xs text-muted-foreground">
          {lang === "ar" ? "تجد المحتوى في صفحة «طلباتي»" : "Find your content in “My orders”"}
        </p>
      </div>
    </div>
  );
}
