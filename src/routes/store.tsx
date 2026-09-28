import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Layout } from "@/components/site/Layout";
import { ProductCard } from "@/components/site/ProductCard";
import { useCategories, useProducts } from "@/hooks/use-store-data";
import { useI18n } from "@/lib/i18n";
import { useCart } from "@/lib/cart";

type StoreSearch = { q?: string | undefined; cat?: string | undefined; wish?: boolean | undefined };

export const Route = createFileRoute("/store")({
  validateSearch: (search: Record<string, unknown>): StoreSearch => ({
    q: typeof search["q"] === "string" ? (search["q"] as string) : undefined,
    cat: typeof search["cat"] === "string" ? (search["cat"] as string) : undefined,
    wish:
      search["wish"] === true || search["wish"] === "1" || search["wish"] === "true" ? true : undefined,
  }),
  head: () => ({
    meta: [
      { title: "المتجر | NMCT" },
      {
        name: "description",
        content: "تصفح كل ألعاب NMCT: أقراص، بطاقات شحن، إكسسوارات — بأسعار تنافسية.",
      },
      { property: "og:title", content: "المتجر | NMCT" },
      { property: "og:description", content: "كل ألعاب وأقراص وبطاقات NMCT في مكان واحد." },
    ],
  }),
  component: StorePage,
});

function StorePage() {
  const { t, lang } = useI18n();
  const { visible, loading } = useProducts();
  const categories = useCategories();
  const { wishlist } = useCart();
  const search = Route.useSearch();
  const [cat, setCat] = useState<string>(search.cat || "all");
  const [sort, setSort] = useState<"new" | "up" | "down" | "pop">("new");
  const q = search.q || "";
  const onlyWish = search.wish === true;

  useEffect(() => {
    if (search.cat) setCat(search.cat);
  }, [search.cat]);

  const items = useMemo(() => {
    let list = visible;
    if (cat !== "all")
      list = list.filter((p) => p.categoryId === cat || p.category === cat);
    if (onlyWish) list = list.filter((p) => wishlist.includes(p.id));
    if (q.trim()) {
      const s = q.trim().toLowerCase();
      list = list.filter((p) =>
        [p.name, p.nameEn, p.description, p.platform]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(s)),
      );
    }
    const sorted = [...list];
    if (sort === "up") sorted.sort((a, b) => a.price - b.price);
    if (sort === "down") sorted.sort((a, b) => b.price - a.price);
    if (sort === "pop") sorted.sort((a, b) => (b.soldCount || 0) - (a.soldCount || 0));
    return sorted;
  }, [visible, cat, q, sort, onlyWish, wishlist]);

  return (
    <Layout>
      <section className="mx-auto max-w-7xl px-4 py-10">
        <h1 className="font-display text-4xl">
          {onlyWish ? t("wishlist") : t("allProducts")}
        </h1>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <button
            onClick={() => setCat("all")}
            className={`rounded-xl border px-4 py-2 font-display text-sm ${
              cat === "all" ? "border-primary bg-primary/15 text-primary" : "border-border bg-card"
            }`}
          >
            {t("allProducts")}
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => setCat(c.id)}
              className={`rounded-xl border px-4 py-2 font-display text-sm ${
                cat === c.id ? "border-primary bg-primary/15 text-primary" : "border-border bg-card"
              }`}
            >
              {lang === "en" && c.nameEn ? c.nameEn : c.name}
            </button>
          ))}
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as typeof sort)}
            className="ms-auto rounded-xl border border-border bg-card px-3 py-2 text-sm"
          >
            <option value="new">{t("sortNew")}</option>
            <option value="pop">{t("sortPopular")}</option>
            <option value="up">{t("sortPriceUp")}</option>
            <option value="down">{t("sortPriceDown")}</option>
          </select>
        </div>

        {loading ? (
          <p className="py-24 text-center text-muted-foreground">{t("connecting")}</p>
        ) : items.length === 0 ? (
          <p className="py-24 text-center text-muted-foreground">{t("noProducts")}</p>
        ) : (
          <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {items.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        )}
      </section>
    </Layout>
  );
}