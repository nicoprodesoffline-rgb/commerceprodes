"use client";

import { PriceTierDisplay } from "lib/supabase/types";

function formatPriceFR(price: number): string {
  return new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2 }).format(price) + " € HT";
}

export function PriceGrid({
  tiers,
  pricingType,
  basePrice,
}: {
  tiers: PriceTierDisplay[];
  pricingType: "fixed" | "percentage" | null;
  basePrice: number;
}) {
  if (!tiers || tiers.length === 0) return null;

  return (
    <div className="mt-4 mb-2">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
        Tarifs dégressifs
      </h3>
      <div className="overflow-hidden rounded-md border border-gray-200">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="py-2 px-3 text-left font-medium text-gray-600 text-xs uppercase tracking-wide">
                Quantité
              </th>
              <th className="py-2 px-3 text-right font-medium text-gray-600 text-xs uppercase tracking-wide">
                Prix unitaire
              </th>
              <th className="py-2 px-3 text-right font-medium text-gray-600 text-xs uppercase tracking-wide">
                Économie
              </th>
            </tr>
          </thead>
          <tbody>
            {/* Ligne de référence : 1 unité */}
            <tr className="bg-gray-50 border-b border-gray-100">
              <td className="py-2 px-3 text-gray-500 text-sm">1 unité</td>
              <td className="py-2 px-3 text-right text-gray-700 font-medium">
                {formatPriceFR(basePrice)}
              </td>
              <td className="py-2 px-3 text-right text-gray-400 text-xs">—</td>
            </tr>

            {/* Paliers dégressifs */}
            {tiers.map((tier, i) => {
              let unitPrice: number | null = null;
              if (pricingType === "fixed" && tier.price != null) {
                // tier.price = discount amount, not final price
                unitPrice = basePrice - tier.price;
              } else if (pricingType === "percentage" && tier.discountPercent != null) {
                unitPrice = basePrice * (1 - tier.discountPercent / 100);
              }

              // Guard against corrupt data
              if (unitPrice !== null && (unitPrice <= 0 || unitPrice >= basePrice)) {
                unitPrice = null;
              }

              const savings =
                unitPrice != null && basePrice > 0
                  ? Math.round(((basePrice - unitPrice) / basePrice) * 100)
                  : null;

              return (
                <tr
                  key={i}
                  className="border-b border-gray-100 last:border-0 bg-white hover:bg-red-50 transition-colors"
                >
                  <td className="py-2 px-3 text-gray-700">
                    À partir de{" "}
                    <span className="font-medium">{tier.minQuantity}</span>{" "}
                    unité{tier.minQuantity > 1 ? "s" : ""}
                  </td>
                  <td className="py-2 px-3 text-right font-semibold text-[#cc1818]">
                    {unitPrice != null ? formatPriceFR(unitPrice) : "—"}
                  </td>
                  <td className="py-2 px-3 text-right">
                    {savings != null && savings > 0 ? (
                      <span className="inline-block rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">
                        -{savings} %
                      </span>
                    ) : (
                      <span className="text-gray-400 text-xs">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-1 text-xs text-gray-400">
        Prix unitaire HT — hors taxes et hors frais de livraison
      </p>
    </div>
  );
}
