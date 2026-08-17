import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { availableStock, onProductsChange, type Product } from "./db";

export type CartLine = {
  id: string;
  name: string;
  price: number;
  qty: number;
  image?: string | undefined;
  size?: string | undefined;
  /** Real available stock at the moment the line was added/refreshed. */
  max?: number | undefined;
};

type Ctx = {
  lines: CartLine[];
  count: number;
  subtotal: number;
  open: boolean;
  setOpen: (v: boolean) => void;
  /** Adds to the cart, never above the real available stock. Returns true when it fitted. */
  add: (p: Product, opts?: { size?: string; qty?: number }) => boolean;
  setQty: (key: string, qty: number) => void;
  removeLine: (key: string) => void;
  clear: () => void;
  /** Quantity already in the cart for a product (all sizes). */
  qtyOf: (id: string) => number;
  wishlist: string[];
  toggleWish: (id: string) => void;
};


const CartContext = createContext<Ctx | null>(null);
const KEY = "nmct_cart";
const WKEY = "nmct_wishlist";

export const lineKey = (l: { id: string; size?: string | undefined }) =>
  l.id + "::" + (l.size || "");

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [wishlist, setWishlist] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      setLines(JSON.parse(localStorage.getItem(KEY) || "[]"));
      setWishlist(JSON.parse(localStorage.getItem(WKEY) || "[]"));
    } catch {
      /* ignore */
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(lines));
      localStorage.setItem(WKEY, JSON.stringify(wishlist));
    } catch {
      /* ignore */
    }
  }, [lines, wishlist, ready]);

  // keep every cart line capped by the live inventory
  useEffect(() => {
    if (!ready) return;
    const unsub = onProductsChange((items) => {
      const stockById = new Map(items.map((p) => [p.id, availableStock(p)]));
      setLines((cur) => {
        let changed = false;
        const next: CartLine[] = [];
        for (const l of cur) {
          const max = stockById.get(l.id);
          if (max === undefined) {
            next.push(l);
            continue;
          }
          if (max <= 0) {
            changed = true;
            continue;
          }
          const others = cur
            .filter((o) => o.id === l.id && lineKey(o) !== lineKey(l))
            .reduce((s, o) => s + o.qty, 0);
          const qty = Math.max(1, Math.min(l.qty, Math.max(1, max - others)));
          if (qty !== l.qty || l.max !== max) changed = true;
          next.push({ ...l, qty, max });
        }
        return changed ? next : cur;
      });
    });
    return unsub;
  }, [ready]);

  const value = useMemo<Ctx>(() => {
    const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0);
    return {
      lines,
      count: lines.reduce((s, l) => s + l.qty, 0),
      subtotal,
      open,
      setOpen,
      add: (p, opts) => {
        const size = opts?.size;
        const extra = size ? p.sizes?.find((s) => s.name === size)?.price : undefined;
        const price = typeof extra === "number" && extra > 0 ? extra : p.price;
        const stock = availableStock(p);
        if (stock <= 0) return false;
        // total already in the cart for this product (all sizes share the same stock)
        const inCart = lines.filter((l) => l.id === p.id).reduce((s, l) => s + l.qty, 0);
        const room = Math.max(0, stock - inCart);
        if (room <= 0) return false;
        const wanted = Math.max(1, opts?.qty || 1);
        const qty = Math.min(wanted, room);
        const line: CartLine = {
          id: p.id,
          name: p.name,
          price,
          qty,
          max: stock,
          ...(p.image || p.images?.[0] ? { image: p.image || p.images?.[0] } : {}),
          ...(size ? { size } : {}),
        };
        setLines((cur) => {
          const k = lineKey(line);
          const found = cur.find((l) => lineKey(l) === k);
          if (found)
            return cur.map((l) =>
              lineKey(l) === k ? { ...l, max: stock, qty: l.qty + qty } : l,
            );
          return [...cur, line];
        });
        setOpen(true);
        return qty >= wanted;
      },
      setQty: (key, qty) =>
        setLines((cur) =>
          qty <= 0
            ? cur.filter((l) => lineKey(l) !== key)
            : cur.map((l) => {
                if (lineKey(l) !== key) return l;
                // other sizes of the same product also eat from the same stock
                const others = cur
                  .filter((o) => o.id === l.id && lineKey(o) !== key)
                  .reduce((s, o) => s + o.qty, 0);
                const cap =
                  typeof l.max === "number" ? Math.max(1, l.max - others) : qty;
                return { ...l, qty: Math.min(qty, cap) };
              }),
        ),
      removeLine: (key) => setLines((cur) => cur.filter((l) => lineKey(l) !== key)),
      clear: () => setLines([]),
      qtyOf: (id) => lines.filter((l) => l.id === id).reduce((s, l) => s + l.qty, 0),

      wishlist,
      toggleWish: (id) =>
        setWishlist((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id])),
    };
  }, [lines, wishlist, open]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside CartProvider");
  return ctx;
}