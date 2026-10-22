"use client";

/**
 * Panier UNIQUE côté client = brouillon UX (localStorage, une seule clé).
 * Ne contient AUCUN prix faisant foi : les prix viennent toujours du serveur
 * (/api/site/cart/preview), et devis/commande revalident les lignes affichées.
 * Pas de cookie, pas de second panier, pas d'action serveur.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type DraftLine = {
  public_item_key: string;
  variant_axes: Record<string, string>;
  quantity: number;
  family_name: string;
};

type CartApi = {
  lines: DraftLine[];
  ready: boolean;
  add: (line: DraftLine) => void;
  setQuantity: (index: number, quantity: number) => void;
  remove: (index: number) => void;
  clear: () => void;
};

const KEY = "prodes_bc1d_cart_draft_v1";
const Ctx = createContext<CartApi | null>(null);

function sameLine(a: DraftLine, b: DraftLine) {
  return (
    a.public_item_key === b.public_item_key &&
    JSON.stringify(Object.entries(a.variant_axes).sort()) === JSON.stringify(Object.entries(b.variant_axes).sort())
  );
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) setLines(parsed as DraftLine[]);
      }
    } catch {
      /* stockage indisponible : panier vide */
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(KEY, JSON.stringify(lines));
    } catch {
      /* ignoré : brouillon seulement */
    }
  }, [lines, ready]);

  const add = useCallback((line: DraftLine) => {
    setLines((prev) => {
      const i = prev.findIndex((l) => sameLine(l, line));
      if (i === -1) return [...prev, line];
      return prev.map((l, j) => (j === i ? { ...l, quantity: l.quantity + line.quantity } : l));
    });
  }, []);
  const setQuantity = useCallback((index: number, quantity: number) => {
    setLines((prev) => prev.map((l, j) => (j === index ? { ...l, quantity } : l)));
  }, []);
  const remove = useCallback((index: number) => setLines((prev) => prev.filter((_, j) => j !== index)), []);
  const clear = useCallback(() => setLines([]), []);

  const api = useMemo(() => ({ lines, ready, add, setQuantity, remove, clear }), [lines, ready, add, setQuantity, remove, clear]);
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useCart(): CartApi {
  const c = useContext(Ctx);
  if (!c) throw new Error("useCart hors CartProvider");
  return c;
}

export function CartCount() {
  const { lines, ready } = useCart();
  const n = lines.reduce((a, l) => a + l.quantity, 0);
  return (
    <span aria-live="polite" className="ml-1 rounded-full bg-[#cc1818] px-2 py-0.5 text-xs font-semibold text-white">
      {ready ? n : "…"}
    </span>
  );
}
