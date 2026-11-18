"use client";

/**
 * Cercle 5 : les réglages de vente côté navigateur et la séquence RETENUE avec le panier (attendu M04). Un panier ouvert sous un autre taux demande une nouvelle confirmation
 * avant l'envoi : `needsReconfirm` vaut vrai tant que la séquence servie n'est pas celle que le client a vue. Seul un numéro est gardé dans le navigateur (aucune donnée personnelle).
 */
import { useCallback, useEffect, useState } from "react";
import type { PublicCommerce } from "@/lib/site-commerce/public";

const STORAGE_KEY = "prodes_site_commerce_seen_v1";

function readSeen(): number | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw !== null && /^[1-9][0-9]{0,15}$/.test(raw) ? Number(raw) : null;
  } catch {
    return null;
  }
}
function writeSeen(sequence: number): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(sequence));
  } catch {
    // Stockage indisponible : la séquence vue vaut celle de cette page (aucune reconfirmation possible, le serveur reste l'autorité).
  }
}

export type CommerceState = { kind: "loading" } | { kind: "ready"; commerce: Extract<PublicCommerce, { ready: true }> } | { kind: "not_ready" } | { kind: "network" };

export function useCommerce(): { state: CommerceState; needsReconfirm: boolean; seenSequence: number | null; acknowledge: () => void; refresh: () => void } {
  const [state, setState] = useState<CommerceState>({ kind: "loading" });
  const [seen, setSeen] = useState<number | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/site/commerce", { cache: "no-store", credentials: "same-origin" });
        const body = (await res.json()) as PublicCommerce;
        if (!alive) return;
        if (!body.ready) return setState({ kind: "not_ready" });
        const stored = readSeen();
        // Première visite : la séquence servie est celle que le client voit maintenant, elle est retenue avec le panier.
        if (stored === null) writeSeen(body.sequence);
        setSeen(stored ?? body.sequence);
        setState({ kind: "ready", commerce: body });
      } catch {
        if (alive) setState({ kind: "network" });
      }
    })();
    return () => { alive = false; };
  }, [tick]);

  const acknowledge = useCallback(() => {
    if (state.kind !== "ready") return;
    writeSeen(state.commerce.sequence);
    setSeen(state.commerce.sequence);
  }, [state]);
  const refresh = useCallback(() => setTick((n) => n + 1), []);
  const needsReconfirm = state.kind === "ready" && seen !== null && seen !== state.commerce.sequence;
  return { state, needsReconfirm, seenSequence: seen, acknowledge, refresh };
}
