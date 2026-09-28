import { Heart, Plus, Flame } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { availableStock, isLowStock, isOutOfStock, type Product } from "@/lib/db";
import { useCart } from "@/lib/cart";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useCurrency } from "@/lib/currency";
import { toast } from "sonner";
import { useEffect, useMemo, useState } from "react";

export function priceText(v: number, lang: "ar" | "en") {
  const n = Number(v || 0).toFixed(2);
  return lang === "ar" ? `${n} ر.ع` : `OMR ${n}`;
}

export function ProductCard({
  product,
  rank,
  autoRotate = false,
}: {
  product: Product;
  rank?: number;
  autoRotate?: boolean;
}) {
  const { add, wishlist, toggleWish, qtyOf } = useCart();
  const { requireAuth } = useAuth();
  const { t, lang } = useI18n();
  const { fmt } = useCurrency();
  const gallery = useMemo(
    () => Array.from(new Set([product.image, ...(product.images ?? [])].filter((item): item is string => Boolean(item)))),
    [product.image, product.images],
  );
  const [activeImage, setActiveImage] = useState(0);
  useEffect(() => {
    setActiveImage(0);
    if (!autoRotate || gallery.length < 2) return;
    const timer = window.setInterval(
      () => setActiveImage((current) => (current + 1) % gallery.length),
      3000,
    );
    return () => window.clearInterval(timer);
  }, [autoRotate, gallery]);
  const name = lang === "en" && product.nameEn ? product.nameEn : product.name;
  const off =
    product.oldPrice && product.oldPrice > product.price
      ? Math.round(((product.oldPrice - product.price) / product.oldPrice) * 100)
      : 0;
  const wished = wishlist.includes(product.id);
  const left = availableStock(product);
  const soldOut = isOutOfStock(product);
  const low = isLowStock(product);
  const inCart = qtyOf(product.id);
  const full = !soldOut && inCart >= left;

  return (
    <article className="group relative overflow-hidden rounded-2xl glass-panel neon-hover">
      <Link
        to="/product/$id"
        params={{ id: product.id }}
        className="block w-full text-start"
        aria-label={name}
      >
        <div className="relative aspect-square max-w-full overflow-hidden bg-secondary/50 sm:aspect-4/5">
          {gallery.length ? (
            gallery.map((src, index) => (
              <img
                key={src}
                src={src}
                alt={index === activeImage ? name : ""}
                aria-hidden={index !== activeImage}
                loading="lazy"
                className={`absolute inset-0 block size-full object-cover object-center transition-[opacity,transform] duration-700 ease-out group-hover:scale-105 ${
                  index === activeImage ? "opacity-100" : "opacity-0"
                }`}
              />
            ))

          ) : (
            <div className="grid size-full place-items-center font-display text-3xl text-muted-foreground">
              GP
            </div>
          )}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-linear-to-t from-background/70 to-transparent" />
          {autoRotate && gallery.length > 1 && (
            <div className="absolute inset-x-0 bottom-2 z-10 flex justify-center gap-1" aria-hidden="true">
              {gallery.map((src, index) => (
                <span
                  key={src}
                  className={`h-1 rounded-full transition-all duration-500 ${
                    index === activeImage ? "w-4 bg-primary" : "w-1 bg-foreground/45"
                  }`}
                />
              ))}
            </div>
          )}
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
          {product.accountProduct && (
            <span className="absolute bottom-3 rounded-full border border-accent/50 bg-background/80 px-2.5 py-1 font-tech text-[10px] text-accent ltr:left-3 rtl:right-3">
              {lang === "ar" ? "حسابات — يحتاج موافقة" : "Accounts — needs approval"}
            </span>
          )}
          {off > 0 && (
            <span className="absolute top-3 rounded-full bg-destructive px-2.5 py-1 font-tech text-xs font-bold text-destructive-foreground ltr:right-3 rtl:left-3">
              -{off}%
            </span>
          )}
        </div>

        <div className="min-w-0 space-y-1 p-3 pb-16 sm:p-4 sm:pb-16">
          <h3 className="line-clamp-2 break-words font-display text-sm leading-snug sm:text-base">{name}</h3>
          {product.platform && (
            <p className="font-tech text-[11px] uppercase tracking-wider text-accent">
              {product.platform}
            </p>
          )}
          <div className="flex items-center gap-2 pt-1">
            <span className="break-words font-display text-base text-primary sm:text-lg">{fmt(product.price)}</span>
            {off > 0 && (
              <span className="text-sm text-muted-foreground line-through">
                {fmt(product.oldPrice as number)}
              </span>
            )}
          </div>
          {!soldOut && low && (
            <p className="font-tech text-[11px] text-destructive">
              {lang === "ar" ? `متبقي ${left} فقط` : `Only ${left} left`}
            </p>
          )}
          {!soldOut && !low && (
            <p className="font-tech text-[11px] text-primary/80">
              {lang === "ar" ? `متبقي ${left}` : `${left} in stock`}
            </p>
          )}
          {!!product.soldCount && (
            <p className="text-xs text-muted-foreground">
              {product.soldCount} {t("sold")}
            </p>
          )}
        </div>
      </Link>

      <div className="absolute inset-x-3 bottom-3 flex items-center gap-2 sm:inset-x-4 sm:bottom-4">
        <button
          disabled={soldOut || full}
          onClick={() => {
            if (soldOut) return;
            if (full) {
              toast.error(
                lang === "ar"
                  ? `الحد الأقصى المتوفر ${left}`
                  : `Only ${left} available`,
              );
              return;
            }
            requireAuth(() => {
              if (add(product)) toast.success(t("added"));
              else
                toast.error(
                  lang === "ar" ? `الحد الأقصى المتوفر ${left}` : `Only ${left} available`,
                );
            });
          }}
          className={`inline-flex h-10 min-w-0 flex-1 items-center justify-center gap-1 overflow-hidden rounded-xl px-1 font-display text-xs transition-transform sm:text-sm ${
            soldOut || full
              ? "cursor-not-allowed border border-border bg-muted text-muted-foreground"
              : "bg-primary text-primary-foreground hover:scale-[1.02]"
          }`}
        >
          <Plus className="size-4" />{" "}
          {soldOut
            ? lang === "ar"
              ? "نفذ"
              : "Sold out"
            : full
              ? lang === "ar"
                ? "الحد الأقصى"
                : "Max reached"
              : t("addToCart")}
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