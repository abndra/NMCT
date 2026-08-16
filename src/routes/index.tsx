import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { Flame, Sparkles } from "lucide-react";
import { Layout } from "@/components/site/Layout";
import { ProductCard } from "@/components/site/ProductCard";
import { useCategories, useProducts, useReviews } from "@/hooks/use-store-data";
import { useI18n } from "@/lib/i18n";
import { siteBackground as heroAsset } from "@/lib/assets";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "NMCT | متجر المنتجات الرقمية" },
      {
        name: "description",
        content:
          "NMCT — شرائح إنترنت eSIM، تطبيقات بلس للآيفون والآيباد، وحسابات رقمية مع تسليم فوري.",
      },
      { property: "og:title", content: "NMCT | المتجر الرقمي" },
      {
        property: "og:description",
        content: "شرائح eSIM وتطبيقات بلس وحسابات رقمية — تسليم فوري وأسعار تنافسية.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  const { t, lang } = useI18n();
  const { visible, loading } = useProducts();
  const categories = useCategories();
  const reviews = useReviews();

  // Home lists are 100% manual: only products the admin pinned to a section
  // appear, and an empty section is hidden completely (no automatic fallback).
  const mostWanted = useMemo(
    () => visible.filter((p) => p.sections?.includes("bestseller")).slice(0, 8),
    [visible],
  );

  const newArrivals = useMemo(
    () => visible.filter((p) => p.sections?.includes("new")).slice(0, 8),
    [visible],
  );

  const deals = useMemo(
    () => visible.filter((p) => p.sections?.includes("offer")).slice(0, 8),
    [visible],
  );

  // Anything the admin did not pin to a section still gets shown, under a
  // plain "المنتجات" list, so no product stays hidden from the home page.
  const others = useMemo(
    () => visible.filter((p) => !p.sections || p.sections.length === 0).slice(0, 8),
    [visible],
  );

  const stats = useMemo(
    () => [
      { ar: "منتج متاح", en: "Products in stock", value: visible.length },
      { ar: "قسم", en: "Categories", value: categories.length },
      {
        ar: "طلب مكتمل",
        en: "Orders delivered",
        value: visible.reduce((s, p) => s + (p.soldCount || 0), 0),
      },
    ],
    [visible, categories],
  );

  return (
    <Layout>
      {/* HERO */}
      <section className="relative overflow-hidden border-b border-border/60">
        <img
          src={heroAsset}
          alt=""
          width={1600}
          height={912}
          className="absolute inset-0 size-full object-cover opacity-85"
        />
        <div className="absolute inset-0 grid-lines opacity-60" />
        <div className="absolute inset-0 bg-gradient-to-b from-background/15 via-background/45 to-background/90" />

        <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 py-20 sm:py-28 lg:grid-cols-[1.15fr_1fr]">
          <div className="text-center lg:text-start">
            <span className="inline-flex items-center gap-2 font-tech text-[11px] uppercase tracking-[0.35em] text-accent">
              <span className="h-px w-8 bg-accent/70" />
              NMCT
            </span>
            <h1 className="mt-5 font-display text-4xl leading-[1.15] sm:text-6xl">
              <span className="text-gradient-gold">{t("heroTitle")}</span>
            </h1>
            <p className="mt-4 max-w-lg text-muted-foreground lg:mx-0 mx-auto">{t("heroSub")}</p>
            <div className="mt-8 flex flex-wrap justify-center gap-3 lg:justify-start">
              <Link
                to="/store"
                className="h-12 rounded-xl bg-primary px-8 font-display leading-[3rem] text-primary-foreground transition-transform hover:scale-[1.03]"
              >
                {t("shopNow")}
              </Link>
              <a
                href="#categories"
                className="h-12 rounded-xl border border-border bg-card/60 px-8 font-display leading-[3rem] text-foreground transition-colors hover:border-accent hover:text-accent"
              >
                {t("exploreCats")}
              </a>
            </div>

            <div className="mt-10 flex flex-wrap justify-center gap-2 lg:justify-start">
              {["eSIM", "iOS Plus Apps", "Accounts", "Gift Cards"].map((p) => (
                <span
                  key={p}
                  className="rounded-full border border-border/80 bg-card/50 px-3.5 py-1.5 font-tech text-[11px] uppercase tracking-wider text-muted-foreground"
                >
                  {p}
                </span>
              ))}
            </div>
          </div>

          <div className="hidden gap-3 lg:grid">
            {stats.map((s) => (
              <div
                key={s.en}
                className="flex items-baseline justify-between border-b border-border/70 pb-3"
              >
                <span className="text-sm text-muted-foreground">{lang === "ar" ? s.ar : s.en}</span>
                <span className="font-tech text-3xl text-primary">{s.value}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CATEGORIES */}
      <section id="categories" className="mx-auto max-w-7xl px-4 py-14">
        <SectionHead title={t("categories")} />
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {categories
            .filter((c) => !c.hidden)
            .map((c) => (
              <Link
                key={c.id}
                to="/store"
                search={{ cat: c.id }}
                className="group relative aspect-square overflow-hidden rounded-2xl border border-border bg-card transition hover:border-primary"
              >
                {c.image ? (
                  <img
                    src={c.image}
                    alt=""
                    loading="lazy"
                    className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                ) : (
                  <Sparkles className="absolute left-1/2 top-1/2 size-10 -translate-x-1/2 -translate-y-1/2 text-accent" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-background/95 via-background/30 to-transparent" />
                <p className="absolute inset-x-0 bottom-0 p-3 text-center font-display text-sm">
                  {lang === "en" && c.nameEn ? c.nameEn : c.name}
                </p>
              </Link>
            ))}
          {categories.length === 0 && (
            <p className="col-span-full text-center text-sm text-muted-foreground">
              {loading ? t("connecting") : t("noProducts")}
            </p>
          )}
        </div>
      </section>

      {/* MOST WANTED */}
      {mostWanted.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 py-10">
          <SectionHead
            title={t("mostWanted")}
            sub={t("mostWantedSub")}
            icon={<Flame className="size-6 text-accent" />}
          />
          <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {mostWanted.map((p, i) => (
              <ProductCard key={p.id} product={p} rank={i + 1} />
            ))}
          </div>
        </section>
      )}

      {/* DEALS */}
      {deals.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 py-10">
          <SectionHead title={t("dailyOffers")} />
          <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {deals.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}

      {/* NEW ARRIVALS */}
      {newArrivals.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 py-10">
          <SectionHead title={t("newArrivals")} />
          <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {newArrivals.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
          <div className="mt-8 text-center">
            <Link
              to="/store"
              className="inline-block h-11 rounded-xl border border-primary px-8 font-display leading-[2.75rem] text-primary"
            >
              {t("viewAll")}
            </Link>
          </div>
        </section>
      )}

      {/* OTHER PRODUCTS (no section assigned) */}
      {others.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 py-10">
          <SectionHead title={lang === "ar" ? "المنتجات" : "Products"} />
          <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {others.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
          <div className="mt-8 text-center">
            <Link
              to="/store"
              className="inline-block h-11 rounded-xl border border-primary px-8 font-display leading-[2.75rem] text-primary"
            >
              {t("viewAll")}
            </Link>
          </div>
        </section>
      )}

      {/* REVIEWS */}
      {reviews.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 py-14">
          <SectionHead title={t("reviews")} />
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {reviews.slice(0, 6).map((r) => (
              <div key={r.id} className="rounded-2xl glass-panel p-5">
                <p className="font-display text-accent">{"★".repeat(Math.max(1, r.rating || 5))}</p>
                <p className="mt-2 text-sm text-muted-foreground">{r.text}</p>
                <p className="mt-3 font-display text-sm">{r.name}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </Layout>
  );
}

function SectionHead({
  title,
  sub,
  icon,
}: {
  title: string;
  sub?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="h-8 w-1 rounded-full bg-gradient-to-b from-primary to-accent" />
      {icon}
      <div>
        <h2 className="font-display text-2xl sm:text-3xl">{title}</h2>
        {sub && <p className="text-sm text-muted-foreground">{sub}</p>}
      </div>
      <span className="ms-4 hidden h-px flex-1 bg-gradient-to-r from-border to-transparent sm:block" />
    </div>
  );
}
