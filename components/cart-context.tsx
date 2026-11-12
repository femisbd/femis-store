"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { detail, lineKey, type CartLine, type DetailedLine } from "@/lib/order";
import { findProduct, type Product } from "@/lib/products";

type Cart = {
  ready: boolean;
  products: Product[];
  getProduct: (slug: string) => Product | undefined;
  lines: DetailedLine[];
  count: number;
  subtotal: number;
  isOpen: boolean;
  open: () => void;
  close: () => void;
  add: (line: CartLine, openDrawer?: boolean) => void;
  setQty: (key: string, qty: number) => void;
  remove: (key: string) => void;
  clear: () => void;
};

const Ctx = createContext<Cart | null>(null);
const STORAGE_KEY = "femis-cart-v1";

export function CartProvider({ products, children }: { products: Product[]; children: React.ReactNode }) {
  const [raw, setRaw] = useState<CartLine[]>([]);
  const [ready, setReady] = useState(false);
  const [isOpen, setOpen] = useState(false);

  // Load the saved cart after the page is interactive (keeps the static HTML identical for everyone).
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setRaw(JSON.parse(saved));
    } catch {}
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(raw));
    } catch {}
  }, [raw, ready]);

  const add = useCallback((line: CartLine, openDrawer = true) => {
    setRaw((prev) => {
      const k = lineKey(line);
      const found = prev.find((l) => lineKey(l) === k);
      if (found) return prev.map((l) => (lineKey(l) === k ? { ...l, qty: Math.min(20, l.qty + line.qty) } : l));
      return [...prev, line];
    });
    if (openDrawer) setOpen(true);
  }, []);
  const setQty = useCallback((key: string, qty: number) => {
    setRaw((prev) => prev.map((l) => (lineKey(l) === key ? { ...l, qty: Math.max(1, Math.min(20, qty)) } : l)));
  }, []);
  const remove = useCallback((key: string) => setRaw((prev) => prev.filter((l) => lineKey(l) !== key)), []);
  const clear = useCallback(() => setRaw([]), []);

  const value = useMemo<Cart>(() => {
    const lines = detail(raw, products);
    return {
      ready,
      products,
      getProduct: (slug: string) => findProduct(products, slug),
      lines,
      count: lines.reduce((s, l) => s + l.qty, 0),
      subtotal: lines.reduce((s, l) => s + l.lineTotal, 0),
      isOpen,
      open: () => setOpen(true),
      close: () => setOpen(false),
      add,
      setQty,
      remove,
      clear,
    };
  }, [raw, ready, isOpen, add, setQty, remove, clear, products]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCart(): Cart {
  const c = useContext(Ctx);
  if (!c) throw new Error("useCart must be used inside CartProvider");
  return c;
}
