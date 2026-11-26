// CA-2 (cercle A, A.5-d1) — le mode maintenance PARTIEL. Module PUR (aucun accès réseau ni base).
// La maintenance ne ferme plus le site : le catalogue reste visible avec le message de la Factory en bandeau. Elle ferme seulement les envois qui créent une demande.
// Le calcul du panier (/api/site/cart/preview), la santé, la recherche et la publication par la Factory restent ouverts.

/** Les routes d'envoi fermées par la maintenance (devis, commande, message). */
export const CLOSED_BY_MAINTENANCE: ReadonlySet<string> = new Set(["/api/site/quote", "/api/site/order", "/api/site/message"]);

/** Corps du refus : même forme que « demande en ligne non ouverte », autre code, le message de la Factory tel quel (texte, jamais du HTML). */
export function maintenanceRefusalBody(message: string) {
  return { site_status: "SITE_MAINTENANCE", message, persistence: "NONE", durable: false, verdict: null } as const;
}
