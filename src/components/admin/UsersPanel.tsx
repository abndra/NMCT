import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Minus, Plus, Search, UserRound, Wallet } from "lucide-react";

import { useI18n } from "@/lib/i18n";
import { banUser, onUsersChange } from "@/lib/db";
import { adjustBalance, setBalance } from "@/lib/wallet";

type AppUser = {
  id: string;
  name?: string;
  displayName?: string;
  email?: string;
  photoURL?: string;
  photo?: string;
  balance?: number;
  banned?: boolean;
};

const money = (n: number) => `${(Number(n) || 0).toFixed(2)} ر.ع`;

/** إدارة المستخدمين وأرصدتهم. */
export function UsersPanel() {
  const { lang } = useI18n();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [q, setQ] = useState("");
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");

  useEffect(() => onUsersChange((items) => setUsers(items as AppUser[])), []);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    const base = [...users].sort((a, b) => (Number(b.balance) || 0) - (Number(a.balance) || 0));
    if (!s) return base;
    return base.filter((u) =>
      [u.name, u.displayName, u.email, u.id].some((v) => String(v || "").toLowerCase().includes(s)),
    );
  }, [users, q]);

  function amountOf(uid: string) {
    return Math.abs(Number(String(amounts[uid] || "").replace(",", ".")) || 0);
  }

  async function change(uid: string, sign: 1 | -1) {
    const value = amountOf(uid);
    if (!value) {
      toast.error(lang === "ar" ? "أدخل المبلغ أولاً" : "Enter an amount first");
      return;
    }
    setBusy(uid);
    try {
      const after = await adjustBalance(
        uid,
        sign * value,
        sign > 0 ? "إضافة رصيد من الإدارة" : "خصم رصيد من الإدارة",
      );
      setAmounts((p) => ({ ...p, [uid]: "" }));
      toast.success(`${lang === "ar" ? "الرصيد الحالي" : "New balance"}: ${money(after)}`);
    } catch {
      toast.error(lang === "ar" ? "تعذر تعديل الرصيد" : "Could not update balance");
    } finally {
      setBusy("");
    }
  }

  async function exact(uid: string) {
    const value = amountOf(uid);
    setBusy(uid);
    try {
      const after = await setBalance(uid, value, "ضبط الرصيد من الإدارة");
      setAmounts((p) => ({ ...p, [uid]: "" }));
      toast.success(`${lang === "ar" ? "الرصيد الحالي" : "New balance"}: ${money(after)}`);
    } catch {
      toast.error(lang === "ar" ? "تعذر ضبط الرصيد" : "Could not set balance");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 size-4 -translate-y-1/2 text-muted-foreground ltr:left-3 rtl:right-3" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={lang === "ar" ? "ابحث بالاسم أو البريد" : "Search by name or email"}
          className="h-12 w-full rounded-xl border border-border bg-background/60 px-3 text-sm outline-none focus:border-primary ltr:pl-9 rtl:pr-9"
        />
      </div>

      {list.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          {lang === "ar" ? "لا يوجد مستخدمون." : "No users."}
        </p>
      ) : (
        <div className="grid gap-3">
          {list.map((u) => (
            <div key={u.id} className="rounded-2xl glass-panel p-4">
              <div className="flex flex-wrap items-center gap-3">
                {u.photoURL || u.photo ? (
                  <img
                    src={u.photoURL || u.photo}
                    alt=""
                    className="size-10 rounded-xl object-cover"
                  />
                ) : (
                  <span className="grid size-10 place-items-center rounded-xl bg-muted text-muted-foreground">
                    <UserRound className="size-4" />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-sm">
                    {u.displayName || u.name || (lang === "ar" ? "بدون اسم" : "No name")}
                  </p>
                  <p dir="ltr" className="truncate text-xs text-muted-foreground">
                    {u.email || u.id}
                  </p>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-xl border border-primary/40 bg-primary/10 px-3 py-1.5 font-tech text-sm text-primary">
                  <Wallet className="size-3.5" />
                  {money(Number(u.balance) || 0)}
                </span>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input
                  value={amounts[u.id] || ""}
                  onChange={(e) =>
                    setAmounts((p) => ({ ...p, [u.id]: e.target.value.replace(/[^\d.,]/g, "") }))
                  }
                  inputMode="decimal"
                  dir="ltr"
                  placeholder="0.00"
                  className="h-11 w-28 rounded-xl border border-border bg-background/60 px-3 text-sm outline-none focus:border-primary"
                />
                <button
                  disabled={busy === u.id}
                  onClick={() => void change(u.id, 1)}
                  className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-primary px-4 font-display text-sm text-primary-foreground disabled:opacity-60"
                >
                  <Plus className="size-4" />
                  {lang === "ar" ? "إضافة" : "Add"}
                </button>
                <button
                  disabled={busy === u.id}
                  onClick={() => void change(u.id, -1)}
                  className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-destructive px-4 font-display text-sm text-destructive disabled:opacity-60"
                >
                  <Minus className="size-4" />
                  {lang === "ar" ? "خصم" : "Deduct"}
                </button>
                <button
                  disabled={busy === u.id}
                  onClick={() => void exact(u.id)}
                  className="inline-flex h-11 items-center rounded-xl border border-border px-4 text-sm text-muted-foreground hover:border-primary hover:text-primary disabled:opacity-60"
                >
                  {lang === "ar" ? "ضبط على المبلغ" : "Set exact"}
                </button>
                <button
                  onClick={() => void banUser(u.id, !u.banned)}
                  className="inline-flex h-11 items-center rounded-xl border border-border px-4 text-sm text-muted-foreground hover:border-destructive hover:text-destructive"
                >
                  {u.banned
                    ? lang === "ar"
                      ? "إلغاء الحظر"
                      : "Unban"
                    : lang === "ar"
                      ? "حظر"
                      : "Ban"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
