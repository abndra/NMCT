import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useI18n } from "@/lib/i18n";

/** Fixed conversion rate: 1 OMR = 2.5 USDT. */
export const OMR_TO_USDT = 2.5;

/** Ooredoo pricing: 750 baisa (bank) = 1 Ooredoo rial. */
export const OMR_TO_OOREDOO = 1 / 0.75;

export type Currency = "OMR" | "USDT";

export function toUsdt(omr: number) {
  return Number(omr || 0) * OMR_TO_USDT;
}

/** Converts an OMR (bank) amount into the equivalent Ooredoo balance. */
export function toOoredoo(omr: number) {
  return Number(omr || 0) * OMR_TO_OOREDOO;
}

/** Rounds up to the nearest 0.5 (9.33 -> 9.5, 9.61 -> 10). */
export function roundToHalf(v: number) {
  return Math.ceil((Number(v) || 0) * 2) / 2;
}

/** Ooredoo card amount: always a clean 0.5 / 1.0 step. */
export function ooredooCardAmount(omr: number) {
  return roundToHalf(toOoredoo(omr));
}

/** Formats an Ooredoo amount. */
export function moneyOoredoo(omr: number, lang: "ar" | "en", card = false) {
  const raw = card ? ooredooCardAmount(omr) : toOoredoo(omr);
  const v = raw.toFixed(2);
  return lang === "ar" ? `${v} ر.ع أوريدو` : `${v} OMR Ooredoo`;
}



/** Formats an OMR amount in the requested currency. */
export function money(omr: number, currency: Currency, lang: "ar" | "en") {
  const v = Number(omr || 0);
  if (currency === "USDT") return `$${toUsdt(v).toFixed(2)}`;
  return lang === "ar" ? `${v.toFixed(2)} ر.ع` : `OMR ${v.toFixed(2)}`;
}

type Ctx = {
  currency: Currency;
  setCurrency: (c: Currency) => void;
  toggle: () => void;
  /** Formats an OMR-stored price in the currently selected currency. */
  fmt: (omr: number) => string;
  /** Always in Omani Rial, whatever the selection. */
  omr: (v: number) => string;
  /** Always in USDT. */
  usdt: (v: number) => string;
  rate: number;
};

const CurrencyContext = createContext<Ctx | null>(null);
const KEY = "nmct_currency";

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const { lang } = useI18n();
  const [currency, setCurrency] = useState<Currency>("OMR");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved === "OMR" || saved === "USDT") setCurrency(saved);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, currency);
    } catch {
      /* ignore */
    }
  }, [currency]);

  const value: Ctx = {
    currency,
    setCurrency,
    toggle: () => setCurrency((c) => (c === "OMR" ? "USDT" : "OMR")),
    fmt: (v) => money(v, currency, lang),
    omr: (v) => money(v, "OMR", lang),
    usdt: (v) => money(v, "USDT", lang),
    rate: OMR_TO_USDT,
  };

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export function useCurrency() {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error("useCurrency must be used inside CurrencyProvider");
  return ctx;
}
