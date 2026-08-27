import { useEffect, useState } from "react";
import { Check, Copy, Loader2, Plus, Upload, X } from "lucide-react";
import { toast } from "sonner";

import { useI18n } from "@/lib/i18n";
import { useCurrency, toUsdt, toOoredoo, moneyOoredoo, ooredooCardAmount } from "@/lib/currency";
import { readPaymentMethods, type PaymentMethod } from "@/lib/db";
import { uploadImage } from "@/lib/uploads";
import { useSettings } from "@/hooks/use-store-data";

import bankIcon from "@/assets/flag-oman.png";
import binanceIcon from "@/assets/binance.png";
import usdtIcon from "@/assets/usdt.png";
import ooredooIcon from "@/assets/ooredoo.png";

const inputCls =
  "h-12 w-full rounded-xl border border-border bg-background/60 px-3 text-sm outline-none transition-colors focus:border-primary";

export type PaymentState = {
  methodId: string;
  payMode: "transfer" | "card";
  receipts: string[];
  cardNumbers: string[];
};

export const emptyPaymentState: PaymentState = {
  methodId: "",
  payMode: "transfer",
  receipts: [],
  cardNumbers: [""],
};

export function methodLogo(m: PaymentMethod) {
  if (m.logo) return m.logo;
  if (m.icon === "binance") return binanceIcon;
  if (m.icon === "ooredoo" || m.currency === "OOREDOO") return ooredooIcon;
  if (m.icon === "usdt" || m.currency === "USDT") return usdtIcon;
  return bankIcon;
}

export function payAmountText(
  m: PaymentMethod | undefined,
  total: number,
  lang: "ar" | "en",
  card: boolean,
  omr: (v: number) => string,
  usdt: (v: number) => string,
) {
  if (!m) return omr(total);
  if (m.currency === "USDT") return usdt(total);
  if (m.currency === "OOREDOO") return moneyOoredoo(total, lang, card);
  return omr(total);
}

export function payAmountRaw(m: PaymentMethod | undefined, total: number, card: boolean) {
  if (m?.currency === "USDT") return toUsdt(total).toFixed(2);
  if (m?.currency === "OOREDOO")
    return (card ? ooredooCardAmount(total) : toOoredoo(total)).toFixed(2);
  return total.toFixed(2);
}

/**
 * صندوق الدفع المشترك — نفس طرق الدفع وواجهة الإيصال المستخدمة في المتجر.
 */
export function PaymentPicker({
  total,
  state,
  setState,
}: {
  total: number;
  state: PaymentState;
  setState: (s: PaymentState) => void;
}) {
  const { lang } = useI18n();
  const { omr, usdt } = useCurrency();
  const settings = useSettings();
  const [uploading, setUploading] = useState(false);
  const [copiedKey, setCopiedKey] = useState("");

  const methods = readPaymentMethods(settings);
  const method = methods.find((m) => m.id === state.methodId) || methods[0];
  const allowCard = method?.allowCard === true || method?.currency === "OOREDOO";
  const cardMode = allowCard && state.payMode === "card";

  const bank = (settings["bank"] as Record<string, string> | undefined) || {};
  const bankImage = bank["image"] || "";

  useEffect(() => {
    if (!state.methodId && methods.length)
      setState({ ...state, methodId: methods[0]!.id });
  }, [methods.length]);

  function copyLine(key: string, value: string) {
    void navigator.clipboard?.writeText(value);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(""), 1500);
  }

  async function pickReceipts(files: File[]) {
    if (!files.length) return;
    setUploading(true);
    try {
      const urls: string[] = [];
      for (const f of files.slice(0, 10)) urls.push(await uploadImage(f, "nmct_receipts"));
      setState({ ...state, receipts: [...state.receipts, ...urls].slice(0, 10) });
      toast.success(lang === "ar" ? "تم رفع الصور" : "Images uploaded");
    } catch {
      toast.error(lang === "ar" ? "تعذر رفع الصورة" : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  const amountText = payAmountText(method, total, lang, cardMode, omr, usdt);

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-background/40 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {methods.map((m) => {
          const active = m.id === (method?.id || "");
          return (
            <button
              key={m.id}
              type="button"
              onClick={() =>
                setState({ ...state, methodId: m.id, payMode: "transfer", cardNumbers: [""] })
              }
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
                  {payAmountText(m, total, lang, false, omr, usdt)}
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
              <p className="font-tech text-sm text-primary">{amountText}</p>
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
              onClick={() => copyLine("amount", payAmountRaw(method, total, cardMode))}
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
              onClick={() => setState({ ...state, payMode: mode })}
              className={`rounded-xl px-3 py-2 text-xs font-semibold transition-colors ${
                state.payMode === mode
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
          {state.cardNumbers.map((c, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                className={inputCls}
                inputMode="numeric"
                dir="ltr"
                value={c}
                onChange={(e) =>
                  setState({
                    ...state,
                    cardNumbers: state.cardNumbers.map((v, k) => (k === i ? e.target.value : v)),
                  })
                }
                placeholder={lang === "ar" ? `الكود رقم ${i + 1}` : `Card code #${i + 1}`}
              />
              {state.cardNumbers.length > 1 && (
                <button
                  type="button"
                  aria-label="remove"
                  onClick={() =>
                    setState({
                      ...state,
                      cardNumbers: state.cardNumbers.filter((_, k) => k !== i),
                    })
                  }
                  className="grid size-11 shrink-0 place-items-center rounded-xl border border-border text-muted-foreground hover:border-destructive hover:text-destructive"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
          ))}
          {state.cardNumbers.length < 10 && (
            <button
              type="button"
              onClick={() => setState({ ...state, cardNumbers: [...state.cardNumbers, ""] })}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-accent px-3 text-xs text-accent"
            >
              <Plus className="size-3.5" />
              {lang === "ar" ? "إضافة كود آخر" : "Add another code"}
            </button>
          )}
        </div>
      )}

      {state.receipts.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {state.receipts.map((r, i) => (
            <div key={r + i} className="relative">
              <img
                src={r}
                alt=""
                className="h-24 w-full rounded-xl border border-border object-cover"
              />
              <button
                type="button"
                aria-label="remove image"
                onClick={() =>
                  setState({ ...state, receipts: state.receipts.filter((_, k) => k !== i) })
                }
                className="absolute end-1 top-1 grid size-7 place-items-center rounded-lg bg-background/90 text-destructive"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {state.receipts.length < 10 && (
        <label className="flex h-28 cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border text-center text-sm text-muted-foreground hover:border-primary hover:text-primary">
          {uploading ? (
            <Loader2 className="size-5 animate-spin" />
          ) : (
            <>
              <Upload className="size-5" />
              {cardMode
                ? lang === "ar"
                  ? "ارفع صور رسائل البطاقات (اختياري)"
                  : "Upload card message photos (optional)"
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
  );
}

export function usePaymentMethodOf(state: PaymentState) {
  const settings = useSettings();
  const methods = readPaymentMethods(settings);
  return methods.find((m) => m.id === state.methodId) || methods[0];
}
