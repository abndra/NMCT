import { Heart, Plus, Flame } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { availableStock, isLowStock, isOutOfStock, type Product } from "@/lib/db";
import { useCart } from "@/lib/cart";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useCurrency } from "@/lib/currency";
import { toast } from "sonner";

export function priceText(v: number, lang: "ar" | "en") {
  const n = Number(v || 0).toFixed(2);
  return lang === "ar" ? `${n} ر.ع` : `OMR ${n}`;
}

export function ProductCard({ product, rank }: { product: Product; rank?: number }) {
  const { add, wishlist, toggleWish } = useCart();
  const { requireAuth } = useAuth();
  const { t, lang } = useI18n();
  const { fmt } = useCurrency();
  const img = product.image || product.images?.[0];
  const name = lang === "en" && product.nameEn ? product.nameEn : product.name;
  const off =
    product.oldPrice && product.oldPrice > product.price
      ? Math.round(((product.oldPrice - product.price) / product.oldPrice) * 100)
      : 0;
  const wished = wishlist.includes(product.id);
  const left = availableStock(product);
  const soldOut = isOutOfStock(product);
  const low = isLowStock(product);

  return (
    <article className="group relative overflow-hidden rounded-2xl glass-panel neon-hover">
      <Link
        to="/product/$id"
        params={{ id: product.id }}
        className="block w-full text-start"
        aria-label={name}
      >
        <div className="relative aspect-4/5 overflow-hidden bg-secondary/50">
          {img ? (
            <img
              src={img}
              alt={name}
              loading="lazy"
              className="block size-full object-cover object-center transition-transform duration-500 group-hover:scale-105"
            />

          ) : (
            <div className="grid size-full place-items-center font-display text-3xl text-muted-foreground">
              GP
            </div>
          )}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-linear-to-t from-background/70 to-transparent" />
          {rank ? (
            <span className="absolute top-3 inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 font-tech text-xs font-bold text-primary-foreground ltr:left-3 rtl:right-3">
              <Flame className="size-3" /> #{rank}
            </span>
          ) : null}
          {soldOut && (
            <span className="absolute inset-0 z-10 grid place-items-center bg-background/70 backdrop-blur-[2px]">
              <span className="rounded-full border border-border bg-card px-4 py-1.5 font-display text-sm">
                {lang === "ar" ? "نفذت الكمية" : "Sold out"}
              </span>
            </span>
          )}
          {off > 0 && (
            <span className="absolute top-3 rounded-full bg-destructive px-2.5 py-1 font-tech text-xs font-bold text-destructive-foreground ltr:right-3 rtl:left-3">
              -{off}%
            </span>
          )}
        </div>

        <div className="space-y-1 p-4 pb-16">
          <h3 className="line-clamp-2 font-display text-base leading-tight">{name}</h3>
          {product.platform && (
            <p className="font-tech text-[11px] uppercase tracking-wider text-accent">
              {product.platform}
            </p>
          )}
          <div className="flex items-center gap-2 pt-1">
            <span className="font-display text-lg text-primary">{fmt(product.price)}</span>
            {off > 0 && (
              <span className="text-sm text-muted-foreground line-through">
                {fmt(product.oldPrice as number)}
              </span>
            )}
          </div>
          {!soldOut && low && (
            <p className="font-tech text-[11px] text-destructive">
              {lang === "ar" ? `آخر ${left} قطع` : `Only ${left} left`}
            </p>
          )}
          {!soldOut && !low && (
            <p className="font-tech text-[11px] text-primary/80">
              {lang === "ar" ? `متوفر · ${left}` : `In stock · ${left}`}
            </p>
          )}
          {!!product.soldCount && (
            <p className="text-xs text-muted-foreground">
              {product.soldCount} {t("sold")}
            </p>
          )}
        </div>
      </Link>

      <div className="absolute inset-x-4 bottom-4 flex items-center gap-2">
        <button
          disabled={soldOut}
          onClick={() => {
            if (soldOut) return;
            requireAuth(() => {
              add(product);
              toast.success(t("added"));
            });
          }}
          className={`inline-flex h-10 flex-1 items-center justify-center gap-1 rounded-xl font-display text-sm transition-transform ${
            soldOut
              ? "cursor-not-allowed border border-border bg-muted text-muted-foreground"
              : "bg-primary text-primary-foreground hover:scale-[1.02]"
          }`}
        >
          <Plus className="size-4" /> {soldOut ? (lang === "ar" ? "نفذ" : "Sold out") : t("addToCart")}
        </button>
        <button
          onClick={() => toggleWish(product.id)}
          aria-label="wishlist"
          className={`grid size-10 place-items-center rounded-xl border border-border ${
            wished ? "bg-destructive/20 text-destructive" : "bg-card text-muted-foreground"
          }`}
        >
          <Heart className={`size-4 ${wished ? "fill-current" : ""}`} />
        </button>
      </div>
    </article>
  );
}