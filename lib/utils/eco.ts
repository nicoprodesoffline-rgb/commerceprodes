/**
 * Eco-participation display logic.
 * 3 display cases depending on product type.
 */

export type EcoDisplayResult =
  | { show: false; type: 'none'; amount: 0 }
  | { show: true; type: 'included' | 'per-unit'; amount: number };

/**
 * Returns how to display eco-participation on a product page.
 * @param ecoParticipation  - Amount from product.ecoContribution
 * @param hasLotsVariant    - Whether the product has pa_les-lots variants
 */
export function getEcoDisplay(
  ecoParticipation: number | null | undefined,
  hasLotsVariant: boolean,
): EcoDisplayResult {
  if (!ecoParticipation || ecoParticipation === 0) {
    return { show: false, type: 'none', amount: 0 };
  }
  if (hasLotsVariant) {
    return { show: true, type: 'included', amount: ecoParticipation };
  }
  return { show: true, type: 'per-unit', amount: ecoParticipation };
}
