"use client";

/**
 * Panier UNIQUE côté client = brouillon (localStorage, une seule clé, aucune donnée personnelle, aucun prix).
 * - Une ligne par `(public_item_key, variant_axes)` (C0 §10, R-01) : ajouter la même variante INCRÉMENTE la ligne.
 * - `ackSequence` = génération (`catalogue_sequence`) dont le client a VU les prix en dernier (ajout ou
 *   « J'ai vérifié les nouveaux prix »). C'est elle qui est envoyée au serveur : si le catalogue a changé
 *   entre-temps, le serveur répond `CART_STALE` / `CATALOG_CHANGED` (revue A2 F-10), jamais un prix reconduit.
 * - Les prix affichés viennent TOUJOURS de `/api/site/cart/preview` ; devis et commande revalident tout.
 * Pas de cookie, pas de second panier, pas d'action serveur.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { AxisDisplay } from "@/components/site/format";

export type DraftLine = {
  public_item_key: string;
  variant_axes: Record<string, string>;
  quantity: number;
  family_name: string;
  family_slug: string;
  axes: AxisDisplay[];
};

type CartApi = {
  lines: DraftLine[];
  ackSequence: number | null;
  ready: boolean;
  add: (line: DraftLine, catalogueSequence: number, opts?: { announce?: boolean; opener?: HTMLElement | null }) => void;
  setQuantity: (index: number, quantity: number) => void;
  acknowledge: (sequence: number) => void;
  remove: (index: number) => void;
  clear: () => void;
};

export const CART_ADDED_EVENT = "prodes:cart-added";
const KEY = "prodes_site_cart_draft_v3";
export const MAX_QUANTITY = 1_000_000; // C0 §6
const Ctx = createContext<CartApi | null>(null);

/** Identité de ligne C0 : clé + axes (ordre des axes indifférent, valeurs NFC). */
export function lineIdentity(l: { public_item_key: string; variant_axes: Record<string, string> }): string {
  const axes = Object.entries(l.variant_axes)
    .map(([k, v]) => [k, v.normalize("NFC")] as const)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `${l.public_item_key}\u0000${JSON.stringify(axes)}`;
}

function isDraftLine(x: unknown): x is DraftLine {
  if (!x || typeof x !== "object") return false;
  const l = x as Record<string, unknown>;
  return (
    typeof l.public_item_key === "string" &&
    /^PI-[0-9A-Z]{9}$/.test(l.public_item_key) &&
    !!l.variant_axes &&
    typeof l.variant_axes === "object" &&
    Object.values(l.variant_axes as object).every((v) => typeof v === "string") &&
    Number.isSafeInteger(l.quantity) &&
    (l.quantity as number) >= 1 &&
    (l.quantity as number) <= MAX_QUANTITY &&
    typeof l.family_name === "string" &&
    typeof l.family_slug === "string" &&
    Array.isArray(l.axes)
  );
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [ackSequence, setAck] = useState<number | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (raw) {
        const p = JSON.parse(raw) as { lines?: unknown; ack_sequence?: unknown };
        if (Array.isArray(p.lines)) {
          const seen = new Set<string>();
          const valid = p.lines.filter(isDraftLine).filter((l) => !seen.has(lineIdentity(l)) && seen.add(lineIdentity(l)));
          setLines(valid);
          setAck(Number.isSafeInteger(p.ack_sequence) ? (p.ack_sequence as number) : null);
        }
      }
    } catch {
      /* stockage indisponible ou illisible : panier vide */
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(KEY, JSON.stringify({ ack_sequence: ackSequence, lines }));
    } catch {
      /* brouillon seulement */
    }
  }, [lines, ackSequence, ready]);

  // Synchronisation entre onglets : un autre onglet a modifié le brouillon.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== KEY) return;
      try {
        const p = e.newValue ? (JSON.parse(e.newValue) as { lines?: unknown; ack_sequence?: unknown }) : { lines: [] };
        setLines(Array.isArray(p.lines) ? p.lines.filter(isDraftLine) : []);
        setAck(Number.isSafeInteger(p.ack_sequence) ? (p.ack_sequence as number) : null);
      } catch {
        /* ignoré */
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const add = useCallback((line: DraftLine, sequence: number, opts?: { announce?: boolean; opener?: HTMLElement | null }) => {
    setLines((prev) => {
      const id = lineIdentity(line);
      const i = prev.findIndex((l) => lineIdentity(l) === id);
      if (i === -1) return [...prev, line];
      return prev.map((l, j) => (j === i ? { ...l, quantity: Math.min(MAX_QUANTITY, l.quantity + line.quantity) } : l));
    });
    // Le premier ajout fixe la génération vue ; un ajout sur une autre génération ne l'écrase pas silencieusement :
    // la page panier signalera l'écart et demandera une vérification explicite.
    setAck((prev) => (prev === null ? sequence : prev));
    // Le tiroir du panier s'ouvre à chaque ajout (V-E21-02), sauf quand l'appelant enchaîne sur une autre page (`announce: false`).
    if (opts?.announce !== false && typeof window !== "undefined") window.dispatchEvent(new CustomEvent(CART_ADDED_EVENT, { detail: { opener: opts?.opener ?? null } }));
  }, []);
  const setQuantity = useCallback((index: number, quantity: number) => {
    const q = Math.max(1, Math.min(MAX_QUANTITY, Math.floor(quantity)));
    setLines((prev) => prev.map((l, j) => (j === index ? { ...l, quantity: q } : l)));
  }, []);
  const acknowledge = useCallback((sequence: number) => setAck(sequence), []);
  const remove = useCallback((index: number) => {
    setLines((prev) => {
      const next = prev.filter((_, j) => j !== index);
      if (next.length === 0) setAck(null);
      return next;
    });
  }, []);
  const clear = useCallback(() => {
    setLines([]);
    setAck(null);
  }, []);

  const api = useMemo(
    () => ({ lines, ackSequence, ready, add, setQuantity, acknowledge, remove, clear }),
    [lines, ackSequence, ready, add, setQuantity, acknowledge, remove, clear],
  );
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useCart(): CartApi {
  const c = useContext(Ctx);
  if (!c) throw new Error("useCart hors CartProvider");
  return c;
}

/** Nombre de lignes (variantes) du panier, annoncé poliment. */
export function CartCount() {
  const { lines, ready } = useCart();
  const n = lines.length;
  return (
    <span className="tabular ml-1.5 inline-flex min-w-6 justify-center rounded-full bg-ink px-1.5 text-xs font-semibold leading-5 text-white" aria-label={ready ? `${n} ligne${n > 1 ? "s" : ""}` : "chargement"}>
      {ready ? n : "…"}
    </span>
  );
}
