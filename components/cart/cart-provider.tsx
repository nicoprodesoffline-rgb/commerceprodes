"use client";

/**
 * Panier UNIQUE côté client = brouillon UX (localStorage, une seule clé).
 * Une ligne par `(public_item_key, variant_axes)` (C0 §10, R-01) : ajouter la même variante
 * INCRÉMENTE la ligne. Le panier porte la génération (`catalogue_sequence`) de ses derniers
 * prix affichés ; il ne contient AUCUN prix faisant foi : les prix viennent de
 * `/api/site/cart/preview` (C0 `selectPrice`) et devis/commande revalident tout côté serveur.
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
  catalogueSequence: number | null;
  ready: boolean;
  add: (line: DraftLine, catalogueSequence: number) => void;
  setQuantity: (index: number, quantity: number) => void;
  setCatalogueSequence: (sequence: number) => void;
  remove: (index: number) => void;
  clear: () => void;
};

const KEY = "prodes_site_cart_draft_v2";
const Ctx = createContext<CartApi | null>(null);

/** Identité de ligne C0 : clé + axes (ordre des axes indifférent). */
export function lineIdentity(l: { public_item_key: string; variant_axes: Record<string, string> }): string {
  return `${l.public_item_key}\u0000${JSON.stringify(Object.entries(l.variant_axes).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))}`;
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [catalogueSequence, setSequence] = useState<number | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (parsed && typeof parsed === "object" && Array.isArray((parsed as { lines?: unknown }).lines)) {
          const p = parsed as { lines: DraftLine[]; catalogue_sequence?: unknown };
          setLines(p.lines);
          setSequence(typeof p.catalogue_sequence === "number" ? p.catalogue_sequence : null);
        }
      }
    } catch {
      /* stockage indisponible : panier vide */
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(KEY, JSON.stringify({ catalogue_sequence: catalogueSequence, lines }));
    } catch {
      /* ignoré : brouillon seulement */
    }
  }, [lines, catalogueSequence, ready]);

  const add = useCallback((line: DraftLine, sequence: number) => {
    setSequence(sequence);
    setLines((prev) => {
      const id = lineIdentity(line);
      const i = prev.findIndex((l) => lineIdentity(l) === id);
      if (i === -1) return [...prev, line];
      return prev.map((l, j) => (j === i ? { ...l, quantity: l.quantity + line.quantity } : l));
    });
  }, []);
  const setQuantity = useCallback((index: number, quantity: number) => {
    setLines((prev) => prev.map((l, j) => (j === index ? { ...l, quantity } : l)));
  }, []);
  const setCatalogueSequence = useCallback((sequence: number) => setSequence(sequence), []);
  const remove = useCallback((index: number) => setLines((prev) => prev.filter((_, j) => j !== index)), []);
  const clear = useCallback(() => {
    setLines([]);
    setSequence(null);
  }, []);

  const api = useMemo(
    () => ({ lines, catalogueSequence, ready, add, setQuantity, setCatalogueSequence, remove, clear }),
    [lines, catalogueSequence, ready, add, setQuantity, setCatalogueSequence, remove, clear],
  );
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
