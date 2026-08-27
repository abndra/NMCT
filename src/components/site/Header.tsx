import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Menu, Search, ShoppingCart, Heart, Globe, UserRound, Wallet } from "lucide-react";
import { useState } from "react";
import { siteLogo } from "@/lib/assets";
import { useI18n } from "@/lib/i18n";
import { useCurrency } from "@/lib/currency";
import omanFlag from "@/assets/flag-oman.png";
import usdtIcon from "@/assets/usdt.png";
import { useCart } from "@/lib/cart";
import { useAuth } from "@/lib/auth";
import { Input } from "@/components/ui/input";
import { useBalance } from "@/hooks/use-wallet";

export function Header() {
  const { t, lang, toggle } = useI18n();
  const { currency, toggle: toggleCurrency, fmt } = useCurrency();
  const { count, setOpen, wishlist } = useCart();
  const { user, promptLogin, signOut } = useAuth();
  const { balance } = useBalance();

  const [q, setQ] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const path = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();

  const nav = [
    { to: "/", label: t("home") },
    { to: "/store", label: t("store") },
    { to: "/orders", label: t("trackOrders") },
    { to: "/wallet", label: lang === "ar" ? "محفظتي" : "Wallet" },
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-border/70 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-1.5 px-3 sm:h-18 sm:gap-5 sm:px-4 sm:py-3">
        <button
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-card sm:size-10 sm:rounded-xl md:hidden"
          onClick={() => setMobileOpen((v) => !v)}
          aria-label="menu"
        >
          <Menu className="size-4.5 sm:size-5" />
        </button>

        <Link to="/" className="flex shrink-0 items-center gap-2">
          <img src={siteLogo} alt="NMCT" className="h-8 w-auto sm:h-11" />
        </Link>


        <nav className="hidden items-center gap-1 rounded-full border border-border/70 bg-card/50 p-1 md:flex">
          {nav.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className={`rounded-full px-4 py-1.5 font-display text-sm transition-colors ${
                path === n.to
                  ? "bg-primary/15 text-primary shadow-[inset_0_0_0_1px_var(--color-primary)]"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {n.label}
            </Link>
          ))}
        </nav>

        <form
          className="relative hidden flex-1 sm:block"
          onSubmit={(e) => {
            e.preventDefault();
            navigate({ to: "/store", search: { q } });
          }}
        >
          <Search className="pointer-events-none absolute top-1/2 size-4 -translate-y-1/2 text-muted-foreground ltr:left-3 rtl:right-3" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("search")}
            className="h-11 rounded-xl border-border bg-card/70 ltr:pl-9 rtl:pr-9"
          />
        </form>

        <div className="ms-auto flex items-center gap-1.5 sm:gap-2">
          {user && (
            <Link
              to="/wallet"
              title={lang === "ar" ? "رصيدي" : "My balance"}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-2 font-tech text-[10px] text-primary sm:h-10 sm:rounded-xl sm:px-3 sm:text-xs"
            >
              <Wallet className="size-3.5 sm:size-4" />
              {fmt(balance)}
            </Link>
          )}

          <button
            onClick={toggleCurrency}
            title={lang === "ar" ? "تغيير العملة" : "Change currency"}
            aria-label={lang === "ar" ? "تغيير العملة" : "Change currency"}
            className="inline-flex h-9 items-center gap-1 rounded-lg border border-border bg-card px-1.5 font-tech text-[10px] text-muted-foreground transition-colors hover:text-foreground sm:h-10 sm:gap-1.5 sm:rounded-xl sm:px-2.5 sm:text-xs"
          >
            <img
              src={currency === "OMR" ? omanFlag : usdtIcon}
              alt={currency === "OMR" ? "OMR" : "$"}
              loading="lazy"
              width={20}
              height={20}
              className="size-4 rounded-full object-contain sm:size-5"
            />
            {currency === "OMR" ? (lang === "ar" ? "ر.ع" : "OMR") : "$"}
          </button>

          <button
            onClick={toggle}
            className="inline-flex h-9 items-center gap-1 rounded-lg border border-border bg-card px-2 font-tech text-[10px] text-muted-foreground transition-colors hover:text-foreground sm:h-10 sm:rounded-xl sm:px-3 sm:text-xs"
          >
            <Globe className="size-3.5 sm:size-4" />
            {lang === "ar" ? "EN" : "ع"}
          </button>


          <Link
            to="/store"
            search={{ wish: true }}
            className="relative hidden size-10 items-center justify-center rounded-xl border border-border bg-card sm:inline-flex"
            aria-label={t("wishlist")}
          >
            <Heart className="size-5" />
            {wishlist.length > 0 && (
              <span className="absolute -top-1 size-4 rounded-full bg-primary text-[10px] font-bold leading-4 text-primary-foreground ltr:-right-1 rtl:-left-1">
                {wishlist.length}
              </span>
            )}
          </Link>

          <button
            onClick={() => setOpen(true)}
            className="relative inline-flex size-9 items-center justify-center rounded-lg border border-primary/40 bg-primary/10 text-primary sm:size-10 sm:rounded-xl"
            aria-label={t("cart")}
          >
            <ShoppingCart className="size-4.5 sm:size-5" />
            {count > 0 && (
              <span className="absolute -top-1 size-4 rounded-full bg-primary text-[10px] font-bold leading-4 text-primary-foreground ltr:-right-1 rtl:-left-1">
                {count}
              </span>
            )}
          </button>

          {user ? (
            <div className="flex items-center gap-2">
              <img
                src={user.photoURL || ""}
                alt={user.displayName || "user"}
                className="size-9 rounded-lg border border-border object-cover sm:size-10 sm:rounded-xl"
              />
              <button
                onClick={() => void signOut()}
                className="hidden h-10 items-center rounded-xl border border-border bg-card px-3 font-display text-xs text-muted-foreground hover:text-foreground sm:inline-flex"
              >
                {lang === "ar" ? "خروج" : "Sign out"}
              </button>
            </div>
          ) : (
            <button
              onClick={promptLogin}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-2 font-display text-[10px] hover:border-primary hover:text-primary sm:h-10 sm:gap-2 sm:rounded-xl sm:px-3 sm:text-xs"
            >
              <UserRound className="size-3.5 sm:size-4" />
              {lang === "ar" ? "دخول" : "Sign in"}
            </button>
          )}
        </div>

      </div>

      {mobileOpen && (
        <nav className="grid gap-1 border-t border-border px-4 py-3 md:hidden">
          {nav.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              onClick={() => setMobileOpen(false)}
              className="rounded-lg px-3 py-2 font-display text-sm text-muted-foreground"
            >
              {n.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}