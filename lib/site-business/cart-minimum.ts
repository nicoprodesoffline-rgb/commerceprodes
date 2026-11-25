/**
 * Cercle 9, 9.8 : le minimum de commande nommé dans le panier. Fonctions pures, sans dépendance, lues par l'aperçu du panier
 * (`app/api/site/cart/preview/route.ts`) et par la ligne du panier (`components/cart/cart-summary.tsx`).
 */

/** Le plus petit palier publié d'un article, quand il dépasse 1 (la Factory l'aligne sur le PCB) ; sinon rien. */
export function cartMinimum(quantityMins: readonly number[]): number | undefined {
  const tiers = quantityMins.filter((n) => Number.isSafeInteger(n) && n >= 1);
  const minimum = tiers.length ? Math.min(...tiers) : 1;
  return minimum > 1 ? minimum : undefined;
}

/** Le minimum nommé, nombre lu dans le catalogue servi. */
export function minimumText(minimum: number): string {
  return `minimum : ${minimum} pièces`;
}

/** Les messages d'une ligne refusée : sous le minimum, « minimum : N pièces » remplace « prix indisponible » ; jamais un multiple (9-Q2). */
export function lineMessages(
  line: { quantity: number; minimum_quantity?: number; error_codes: readonly string[] },
  message: (code: string) => string,
): string[] {
  const minimum = line.minimum_quantity;
  const below = minimum !== undefined && line.quantity < minimum;
  return line.error_codes.map((code) => (below && code === "PRICE_WINDOW_UNAVAILABLE" ? minimumText(minimum) : message(code)));
}
