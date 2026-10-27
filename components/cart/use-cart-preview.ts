"use client";

/**
 * Aperçu serveur du panier courant (C0 `selectPrice` par ligne, instant serveur) — partagé par panier, devis et
 * commande. Différé de 300 ms après chaque changement, annulé si le panier change entre-temps. États : chargement,
 * prêt, refusé (4xx, codes C0), indisponible (503 : catalogue ou configuration, le panier est conservé), réseau.
 */
import { useCallback, useEffect, useState } from "react";
import { useCart, type DraftLine } from "@/components/cart/cart-provider";
import { previewCart } from "@/components/site/api";
import type { PreviewJson } from "@/lib/site-business/client-types";

export type PreviewState =
  | { kind: "empty" }
  | { kind: "loading" }
  | { kind: "ready"; preview: PreviewJson }
  | { kind: "refused"; status: number; codes: string[] }
  | { kind: "unavailable"; code: string }
  | { kind: "network" };

export function useCartPreview(): { state: PreviewState; lines: DraftLine[]; refresh: () => void; stale: boolean } {
  const { lines, ready, ackSequence } = useCart();
  const [state, setState] = useState<PreviewState>({ kind: "loading" });
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!ready) return;
    if (lines.length === 0) {
      setState({ kind: "empty" });
      return;
    }
    const ctrl = new AbortController();
    setState({ kind: "loading" });
    const timer = setTimeout(async () => {
      try {
        const r = await previewCart(lines.map(({ public_item_key, variant_axes, quantity }) => ({ public_item_key, variant_axes, quantity })), ctrl.signal);
        if (r.network) return setState({ kind: "network" });
        if (r.status === 200 && r.json && Array.isArray(r.json.lines) && r.json.lines.length === lines.length) return setState({ kind: "ready", preview: r.json });
        if (r.status === 503) return setState({ kind: "unavailable", code: r.json?.site_status ?? "CATALOG_UNAVAILABLE" });
        setState({ kind: "refused", status: r.status, codes: r.json?.error_codes?.length ? r.json.error_codes : [r.json?.site_status ?? "TRANSPORT_ERROR"] });
      } catch {
        /* annulé : un nouvel aperçu suit */
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [lines, ready, tick]);

  const stale = state.kind === "ready" && ackSequence !== null && state.preview.catalogue_sequence !== ackSequence;
  return { state: ready ? state : { kind: "loading" }, lines, refresh, stale };
}

/** Bases fiscales des lignes chiffrées de l'aperçu. */
export function bases(preview: PreviewJson): Set<string> {
  const out = new Set<string>();
  for (const l of preview.lines) if (l.accepted && l.selection) out.add(l.selection.tax_basis_or_status);
  return out;
}

/** Devis possible : toute ligne est chiffrée ou seulement sans prix maintenant (devis non chiffré, C0 §10.2). */
export function quoteAllowed(preview: PreviewJson): boolean {
  return preview.lines.every((l) => l.accepted || (l.error_codes.length === 1 && l.error_codes[0] === "PRICE_WINDOW_UNAVAILABLE"));
}
