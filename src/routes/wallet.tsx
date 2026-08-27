import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Clock, Plus, Wallet as WalletIcon } from "lucide-react";

import { Layout } from "@/components/site/Layout";
import { useAuth, GoogleMark } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useCurrency } from "@/lib/currency";
import { useBalance, useMyTopups, useMyWalletTx } from "@/hooks/use-wallet";
import { formatTopupNo, type TopupStatus } from "@/lib/wallet";

export const Route = createFileRoute("/wallet")({
  head: () => ({
    meta: [
      { title: "محفظتي | NMCT" },
      {
        name: "description",
        content: "تابع رصيدك في NMCT، سجل عمليات الشحن وحركات الرصيد، واشحن في أي وقت.",
      },
      { property: "og:title", content: "محفظتي | NMCT" },
      { property: "og:description", content: "رصيدك وسجل عمليات الشحن في مكان واحد." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: WalletPage,
});

function statusStyle(s: TopupStatus) {
  if (s === "approved") return "bg-emerald-500/15 text-emerald-400";
  if (s === "rejected") return "bg-destructive/15 text-destructive";
  return "bg-amber-500/15 text-amber-400";
}

function statusLabel(s: TopupStatus, lang: "ar" | "en") {
  if (s === "approved") return lang === "ar" ? "مقبول" : "Approved";
  if (s === "rejected") return lang === "ar" ? "مرفوض" : "Rejected";
  return lang === "ar" ? "قيد المراجعة" : "Pending";
}

function WalletPage() {
  const { lang } = useI18n();
  const { fmt } = useCurrency();
  const { user, promptLogin } = useAuth();
  const { balance } = useBalance();
  const topups = useMyTopups();
  const txs = useMyWalletTx();
  const [tab, setTab] = useState<"topups" | "tx">("topups");

  const dateText = (ts: number) =>
    new Date(ts || Date.now()).toLocaleString(lang === "ar" ? "ar-OM" : "en-GB");

  return (
    <Layout>
      <section className="mx-auto max-w-4xl px-4 py-8">
        <div className="rounded-3xl glass-panel p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <WalletIcon className="size-4" />
                {lang === "ar" ? "رصيدك الحالي" : "Your balance"}
              </p>
              <p className="mt-1 font-display text-4xl text-primary">{fmt(balance)}</p>
            </div>
            <Link
              to="/topup"
              className="inline-flex h-12 items-center gap-2 rounded-2xl bg-primary px-5 font-display text-primary-foreground"
            >
              <Plus className="size-4" />
              {lang === "ar" ? "شحن الرصيد" : "Top up"}
            </Link>
          </div>
        </div>

        {!user ? (
          <div className="mt-6 rounded-3xl glass-panel p-8 text-center">
            <p className="text-sm text-muted-foreground">
              {lang === "ar" ? "سجّل الدخول لعرض محفظتك." : "Sign in to view your wallet."}
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
          <>
            <div className="mt-6 grid grid-cols-2 gap-2 rounded-2xl border border-border bg-background/60 p-1">
              {(["topups", "tx"] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => setTab(k)}
                  className={`rounded-xl px-3 py-2.5 font-display text-sm transition-colors ${
                    tab === k
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {k === "topups"
                    ? lang === "ar"
                      ? "سجل الشحن"
                      : "Top-up history"
                    : lang === "ar"
                      ? "حركات الرصيد"
                      : "Transactions"}
                </button>
              ))}
            </div>

            <div className="mt-4 space-y-3">
              {tab === "topups" &&
                (topups.length === 0 ? (
                  <Empty text={lang === "ar" ? "لا توجد طلبات شحن بعد." : "No top-ups yet."} />
                ) : (
                  topups.map((t) => (
                    <div key={t.id} className="rounded-2xl glass-panel p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-tech text-sm text-muted-foreground">
                          #{formatTopupNo(t)}
                        </span>
                        <span
                          className={`rounded-full px-3 py-1 text-[11px] font-semibold ${statusStyle(t.status)}`}
                        >
                          {statusLabel(t.status, lang)}
                        </span>
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-3">
                        <span className="font-display text-xl text-primary">{fmt(t.amount)}</span>
                        <span className="text-xs text-muted-foreground">
                          {t.paymentMethodName || t.paymentMethod}
                        </span>
                      </div>
                      <p className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <Clock className="size-3" />
                        {dateText(t.createdAt)}
                      </p>
                      {t.status === "rejected" && t.rejectionReason && (
                        <p className="mt-2 rounded-xl bg-destructive/10 p-2 text-xs text-destructive">
                          {t.rejectionReason}
                        </p>
                      )}
                    </div>
                  ))
                ))}

              {tab === "tx" &&
                (txs.length === 0 ? (
                  <Empty text={lang === "ar" ? "لا توجد حركات بعد." : "No transactions yet."} />
                ) : (
                  txs.map((x) => {
                    const positive = x.amount >= 0;
                    return (
                      <div
                        key={x.id}
                        className="flex items-center gap-3 rounded-2xl glass-panel p-4"
                      >
                        <span
                          className={`grid size-10 shrink-0 place-items-center rounded-xl ${
                            positive
                              ? "bg-emerald-500/15 text-emerald-400"
                              : "bg-destructive/15 text-destructive"
                          }`}
                        >
                          {positive ? (
                            <ArrowDownLeft className="size-4" />
                          ) : (
                            <ArrowUpRight className="size-4" />
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm">
                            {x.note ||
                              (positive
                                ? lang === "ar"
                                  ? "إضافة رصيد"
                                  : "Credit"
                                : lang === "ar"
                                  ? "خصم رصيد"
                                  : "Debit")}
                          </p>
                          <p className="text-[11px] text-muted-foreground">{dateText(x.createdAt)}</p>
                        </div>
                        <span
                          className={`shrink-0 font-tech text-sm ${
                            positive ? "text-emerald-400" : "text-destructive"
                          }`}
                        >
                          {positive ? "+" : "-"}
                          {fmt(Math.abs(x.amount))}
                        </span>
                      </div>
                    );
                  })
                ))}
            </div>
          </>
        )}
      </section>
    </Layout>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}
