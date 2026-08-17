import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, ArrowLeft, Heart, ShoppingCart, Minus, Plus, ShieldCheck, Truck, Zap } from "lucide-react";
import { toast } from "sonner";
import { Layout } from "@/components/site/Layout";
import { ProductCard, priceText } from "@/components/site/ProductCard";
import { useProducts } from "@/hooks/use-store-data";
import { useI18n } from "@/lib/i18n";
import { useCurrency } from "@/lib/currency";
import { useCart } from "@/lib/cart";
import { useAuth } from "@/lib/auth";
import { availableStock, isLowStock, isOutOfStock } from "@/lib/db";

export const Route = createFileRoute("/product/$id")({
  head: () => ({
    meta: [
      { title: "تفاصيل المنتج | NMCT" },
      { name: "description", content: "تفاصيل المنتج، الصور، الأسعار والمقاسات في متجر NMCT." },
      { property: "og:title", content: "تفاصيل المنتج | NMCT" },
      { property: "og:description", content: "تفاصيل المنتج والأسعار في متجر NMCT." },
    ],
  }),
  component: ProductPage,
});

function ProductPage() {
  const { id } = Route.useParams();
  const router = useRouter();
  const { visible, loading } = useProducts();
  const { t, lang, dir } = useI18n();
  const { fmt } = useCurrency();
  const { add, wishlist, toggleWish } = useCart();
  const { requireAuth } = useAuth();
  const [active, setActive] = useState(0);
  const [size, setSize] = useState<string | undefined>(undefined);
  const [qty, setQty] = useState(1);

  const product = useMemo(() => visible.find((p) => p.id === id), [visible, id]);
  const left = product ? availableStock(product) : 0;
  const soldOut = product ? isOutOfStock(product) : false;
  const low = product ? isLowStock(product) : false;

  useEffect(() => {
    setActive(0);
    setQty(1);
    setSize(product?.sizes?.[0]?.name);
    window.scrollTo({ top: 0 });
  }, [product?.id]);

  const related = useMemo(
    () => visible.filter((p) => p.id !== id && p.categoryId === product?.categoryId).slice(0, 4),
    [visible, id, product?.categoryId],
  );

  const BackIcon = dir === "rtl" ? ArrowRight : ArrowLeft;
  const back = (
    <button
      onClick={() => (window.history.length > 1 ? router.history.back() : router.navigate({ to: "/store" }))}
      className="inline-flex h-11 items-center gap-2 rounded-xl border border-border bg-card/70 px-4 font-display text-sm backdrop-blur transition-colors hover:border-primary hover:text-primary"
    >
      <BackIcon className="size-4" />
      {lang === "ar" ? "رجوع" : "Back"}
    </button>
  );

  if (loading && !product)
    return (
      <Layout>
        <div className="mx-auto max-w-6xl px-4 py-10">{back}</div>
        <p className="py-24 text-center text-muted-foreground">{t("connecting")}</p>
      </Layout>
    );

  if (!product)
    return (
      <Layout>
        <div className="mx-auto max-w-6xl space-y-6 px-4 py-10">
          {back}
          <p className="py-20 text-center text-muted-foreground">{t("noProducts")}</p>
          <div className="text-center">
            <Link to="/store" className="font-display text-primary underline">
              {t("allProducts")}
            </Link>
          </div>
        </div>
      </Layout>
    );

  const gallery = product.images?.length ? product.images : product.image ? [product.image] : [];
  const name = lang === "en" && product.nameEn ? product.nameEn : product.name;
  const desc = lang === "en" && product.descriptionEn ? product.descriptionEn : product.description;
  const sizePrice = product.sizes?.find((s) => s.name === size)?.price;
  const unit = typeof sizePrice === "number" && sizePrice > 0 ? sizePrice : product.price;
  const off =
    product.oldPrice && product.oldPrice > product.price
      ? Math.round(((product.oldPrice - product.price) / product.oldPrice) * 100)
      : 0;
  const wished = wishlist.includes(product.id);

  return (
    <Layout>
      <div className="sticky top-[4.5rem] z-30 border-b border-border/60 bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          {back}
          <span className="line-clamp-1 font-display text-sm text-muted-foreground">{name}</span>
        </div>
      </div>

      <section className="mx-auto max-w-6xl px-4 py-6 sm:py-10">
        <div className="grid gap-6 md:grid-cols-2 md:gap-10">
          <div className="space-y-3">
            <div className="relative aspect-4/5 overflow-hidden rounded-3xl glass-panel">
              {gallery[active] ? (
                <img src={gallery[active]} alt={name} className="size-full object-cover" />
              ) : (
                <div className="grid size-full place-items-center font-display text-5xl text-muted-foreground">GP</div>
              )}
              {off > 0 && (
                <span className="absolute top-4 rounded-full bg-destructive px-3 py-1 font-tech text-xs font-bold text-destructive-foreground ltr:right-4 rtl:left-4">
                  -{off}%
                </span>
              )}
            </div>
            {gallery.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {gallery.map((g, i) => (
                  <button
                    key={g + i}
                    onClick={() => setActive(i)}
                    className={`size-20 shrink-0 overflow-hidden rounded-2xl border-2 ${i === active ? "border-primary" : "border-border"}`}
                  >
                    <img src={g} alt="" className="size-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-5">
            {product.platform && (
              <span className="inline-block rounded-full border border-accent/50 px-3 py-1 font-tech text-xs uppercase text-accent">
                {product.platform}
              </span>
            )}
            <h1 className="font-display text-3xl leading-tight sm:text-4xl">{name}</h1>

            <div className="flex flex-wrap items-center gap-3">
              <span className="font-display text-4xl text-primary">{fmt(unit)}</span>
              {product.oldPrice && product.oldPrice > product.price && (
                <span className="text-lg text-muted-foreground line-through">
                  {fmt(product.oldPrice)}
                </span>
              )}
              {!!product.soldCount && (
                <span className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
                  {product.soldCount} {t("sold")}
                </span>
              )}
            </div>

            {desc && <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{desc}</p>}

            {!!product.sizes?.length && (
              <div className="space-y-2">
                <p className="font-display text-sm">{lang === "ar" ? "الخيارات" : "Options"}</p>
                <div className="flex flex-wrap gap-2">
                  {product.sizes.map((s) => (
                    <button
                      key={s.name}
                      onClick={() => setSize(s.name)}
                      className={`rounded-xl border px-4 py-2 text-sm ${
                        size === s.name ? "border-primary bg-primary/15 text-primary" : "border-border bg-card"
                      }`}
                    >
                      {s.name}
                      {s.price ? ` · ${fmt(s.price)}` : ""}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div
              className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm ${
                soldOut
                  ? "border-border bg-muted text-muted-foreground"
                  : low
                    ? "border-destructive/50 bg-destructive/10 text-destructive"
                    : "border-primary/40 bg-primary/10 text-primary"
              }`}
            >
              <span className="size-2 rounded-full bg-current" />
              {soldOut
                ? lang === "ar"
                  ? "نفذت الكمية حالياً"
                  : "Out of stock"
                : low
                  ? lang === "ar"
                    ? `سارع! آخر ${left} قطع`
                    : `Hurry, only ${left} left`
                  : lang === "ar"
                    ? `متوفر · ${left} قطعة`
                    : `In stock · ${left} units`}
              {product.digital && (
                <span className="opacity-80">
                  · {lang === "ar" ? "تسليم فوري بعد القبول" : "instant delivery"}
                </span>
              )}
            </div>

            <div className="flex items-center gap-3">
              <div className="flex h-12 items-center gap-4 rounded-xl border border-border bg-card px-3">
                <button onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="-"><Minus className="size-4" /></button>
                <span className="w-6 text-center font-tech">{qty}</span>
                <button
                  onClick={() => setQty((q) => Math.min(Math.max(1, left), q + 1))}
                  aria-label="+"
                >
                  <Plus className="size-4" />
                </button>
              </div>
              <button
                onClick={() => toggleWish(product.id)}
                className={`grid size-12 place-items-center rounded-xl border border-border ${
                  wished ? "bg-destructive/20 text-destructive" : "bg-card text-muted-foreground"
                }`}
                aria-label="wishlist"
              >
                <Heart className={`size-5 ${wished ? "fill-current" : ""}`} />
              </button>
            </div>

            <button
              disabled={soldOut}
              onClick={() => {
                if (soldOut) return;
                requireAuth(() => {
                  add(product, { qty: Math.min(qty, left), ...(size ? { size } : {}) });
                  toast.success(t("added"));
                });
              }}
              className={`inline-flex h-14 w-full items-center justify-center gap-2 rounded-2xl font-display text-lg transition-transform ${
                soldOut
                  ? "cursor-not-allowed border border-border bg-muted text-muted-foreground"
                  : "bg-primary text-primary-foreground hover:scale-[1.01]"
              }`}
            >
              <ShoppingCart className="size-5" />{" "}
              {soldOut
                ? lang === "ar"
                  ? "نفذت الكمية"
                  : "Out of stock"
                : `${t("addToCart")} · ${fmt(unit * qty)}`}
            </button>

            <div className="grid grid-cols-3 gap-2 pt-2">
              {[
                { icon: <Zap className="size-4 text-accent" />, ar: "تسليم رقمي فوري", en: "Instant digital" },
                { icon: <ShieldCheck className="size-4 text-accent" />, ar: "منتج أصلي", en: "Authentic" },
                { icon: <Truck className="size-4 text-accent" />, ar: "تسليم داخل الموقع", en: "In-site delivery" },
              ].map((f) => (
                <div key={f.en} className="rounded-xl border border-border bg-card/60 p-3 text-center">
                  <div className="flex justify-center">{f.icon}</div>
                  <p className="mt-1 text-[11px] text-muted-foreground">{lang === "ar" ? f.ar : f.en}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {related.length > 0 && (
          <div className="mt-14">
            <h2 className="font-display text-2xl">{lang === "ar" ? "منتجات مشابهة" : "Related products"}</h2>
            <div className="mt-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
              {related.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </div>
        )}
      </section>
    </Layout>
  );
}
