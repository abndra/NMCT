import { Minus, Plus, Trash2, X } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useCart, lineKey } from "@/lib/cart";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useCurrency } from "@/lib/currency";
import { priceText } from "./ProductCard";

export function CartDrawer() {
  const { open, setOpen, lines, subtotal, setQty, removeLine } = useCart();
  const { t, lang } = useI18n();
  const { fmt } = useCurrency();
  const { requireAuth } = useAuth();
  const navigate = useNavigate();

  return (
    <>
      <div
        onClick={() => setOpen(false)}
        className={`fixed inset-0 z-60 bg-background/70 backdrop-blur-sm transition-opacity ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      <aside
        className={`fixed inset-y-0 z-70 flex w-full max-w-md flex-col border-border bg-card transition-transform duration-300 ltr:right-0 ltr:border-l rtl:left-0 rtl:border-r ${
          open ? "translate-x-0" : "ltr:translate-x-full rtl:-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-border p-4">
          <h2 className="font-display text-xl">{t("cart")}</h2>
          <button onClick={() => setOpen(false)} aria-label="close">
            <X className="size-5" />
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {lines.length === 0 && (
            <p className="py-16 text-center text-muted-foreground">{t("emptyCart")}</p>
          )}
          {lines.map((l) => {
            const k = lineKey(l);
            return (
              <div key={k} className="flex gap-3 rounded-2xl border border-border bg-background/40 p-3">
                {l.image && (
                  <img src={l.image} alt={l.name} className="size-20 rounded-xl object-cover" />
                )}
                <div className="flex-1">
                  <p className="line-clamp-2 font-display text-sm">{l.name}</p>
                  {l.size && <p className="text-xs text-muted-foreground">{l.size}</p>}
                  <p className="mt-1 font-display text-primary">{fmt(l.price)}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      className="grid size-7 place-items-center rounded-lg border border-border"
                      onClick={() => setQty(k, l.qty - 1)}
                    >
                      <Minus className="size-3" />
                    </button>
                    <span className="font-tech text-sm">{l.qty}</span>
                    <button
                      className="grid size-7 place-items-center rounded-lg border border-border"
                      onClick={() => setQty(k, l.qty + 1)}
                    >
                      <Plus className="size-3" />
                    </button>
                    <button
                      className="ms-auto text-destructive"
                      onClick={() => removeLine(k)}
                      aria-label={t("remove")}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {lines.length > 0 && (
          <div className="space-y-3 border-t border-border p-4">
            <div className="flex items-center justify-between font-display text-lg">
              <span>{t("subtotal")}</span>
              <span className="text-primary">{fmt(subtotal)}</span>
            </div>
            <button
              onClick={() =>
                requireAuth(() => {
                  setOpen(false);
                  void navigate({ to: "/checkout" });
                })
              }
              className="grid h-12 w-full place-items-center rounded-xl bg-primary font-display text-primary-foreground animate-pulse-glow"
            >
              {t("checkout")}
            </button>
          </div>
        )}
      </aside>
    </>
  );
}