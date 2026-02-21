import type { DbPriceTier } from "./types";

type PriceProduct = {
  regular_price: number | null;
  pbq_pricing_type: "fixed" | "percentage" | null;
  pbq_enabled: boolean;
};

type PriceVariant = {
  id: string;
  regular_price: number | null;
};

/**
 * Calcule le prix unitaire d'un variant selon la grille PBQ.
 *
 * Priorité : paliers du variant > paliers du produit.
 * pbq_pricing_type = 'percentage' → regular_price * (1 - discount_percent/100)
 * pbq_pricing_type = 'fixed'      → price du palier
 * Aucun palier applicable          → regular_price
 */
export function calculatePrice(
  product: PriceProduct,
  variant: PriceVariant,
  priceTiers: DbPriceTier[],
  quantity: number,
): number {
  const basePrice =
    variant.regular_price != null
      ? Number(variant.regular_price)
      : Number(product.regular_price) || 0;

  if (!product.pbq_enabled || priceTiers.length === 0) return basePrice;

  // Paliers spécifiques au variant, sinon paliers du produit
  const variantTiers = priceTiers.filter((t) => t.variant_id === variant.id);
  const productTiers = priceTiers.filter(
    (t) => t.product_id !== null && t.variant_id === null,
  );
  const activeTiers = variantTiers.length > 0 ? variantTiers : productTiers;

  if (activeTiers.length === 0) return basePrice;

  // Trier DESC par min_quantity, prendre le premier palier où min_quantity <= quantity
  const sorted = [...activeTiers].sort(
    (a, b) => b.min_quantity - a.min_quantity,
  );
  const tier = sorted.find((t) => t.min_quantity <= quantity);

  if (!tier) return basePrice;

  if (
    product.pbq_pricing_type === "percentage" &&
    tier.discount_percent != null
  ) {
    return basePrice * (1 - Number(tier.discount_percent) / 100);
  }

  if (product.pbq_pricing_type === "fixed" && tier.price != null) {
    return Number(tier.price);
  }

  return basePrice;
}
