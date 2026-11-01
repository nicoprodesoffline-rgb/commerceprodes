/**
 * « Prix sur devis » : une fenêtre de prix dont le `rate_id` commence par « rq- » (montant de convention « 0.01 ») ne se vend pas en ligne.
 * Le montant de convention n'est JAMAIS affiché ni compté : le site rend la variante « sur devis », sans « Ajouter au panier », et le serveur
 * refuse toute commande qui en porte une ligne. Sans fenêtre « rq- » dans la génération servie, rien ne change.
 */
export const QUOTE_ONLY_RATE_PREFIX = "rq-";
export const QUOTE_ONLY_CODE = "QUOTE_ONLY";

export function isQuoteOnlyRate(rateId: unknown): boolean {
  return typeof rateId === "string" && rateId.startsWith(QUOTE_ONLY_RATE_PREFIX);
}

/** Seule raison de ne pas chiffrer une ligne : pas de prix publié maintenant, ou « prix sur devis » (fenêtre `rq-`) : la demande de devis reste possible. */
export function isUnpricedOnly(codes: readonly string[]): boolean {
  return codes.length === 1 && (codes[0] === "PRICE_WINDOW_UNAVAILABLE" || codes[0] === QUOTE_ONLY_CODE);
}
