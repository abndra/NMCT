import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Product } from "./db";

export type CartLine = {
  id: string;
  name: string;
  price: number;
  qty: number;
  image?: string | undefined;
  size?: string | undefined;
};

type Ctx = {
  lines: CartLine[];
  count: number;
  subtotal: number;
  open: boolean;
  setOpen: (v: boolean) => void;
  add: (p: Product, opts?: { size?: string; qty?: number }) => void;
  setQty: (key: string, qty: number) => void;
  removeLine: (key: string) => void;
  clear: () => void;
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
        const line: CartLine = {
          id: p.id,
          name: p.name,
          price,
          qty: opts?.qty || 1,
          ...(p.image || p.images?.[0] ? { image: p.image || p.images?.[0] } : {}),
          ...(size ? { size } : {}),
        };
        setLines((cur) => {
          const k = lineKey(line);
          const found = cur.find((l) => lineKey(l) === k);
          if (found)
            return cur.map((l) => (lineKey(l) === k ? { ...l, qty: l.qty + line.qty } : l));
          return [...cur, line];
        });
        setOpen(true);
      },
      setQty: (key, qty) =>
        setLines((cur) =>
          qty <= 0
            ? cur.filter((l) => lineKey(l) !== key)
            : cur.map((l) => (lineKey(l) === key ? { ...l, qty } : l)),
        ),
      removeLine: (key) => setLines((cur) => cur.filter((l) => lineKey(l) !== key)),
      clear: () => setLines([]),
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