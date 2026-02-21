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
    <div className="mt-6">
      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-600 dark:text-neutral-400">
        Tarifs dégressifs
      </h3>
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-neutral-100 dark:bg-neutral-800">
            <th className="py-2 px-3 text-left font-medium text-neutral-700 dark:text-neutral-300">
              À partir de
            </th>
            <th className="py-2 px-3 text-right font-medium text-neutral-700 dark:text-neutral-300">
              Prix unitaire HT
            </th>
          </tr>
        </thead>
        <tbody>
          {tiers.map((tier, i) => {
            let unitPrice: number | null = null;
            if (pricingType === "fixed" && tier.price != null) {
              unitPrice = tier.price;
            } else if (pricingType === "percentage" && tier.discountPercent != null) {
              unitPrice = basePrice * (1 - tier.discountPercent / 100);
            }
            return (
              <tr
                key={i}
                className="border-b border-neutral-200 dark:border-neutral-700 even:bg-neutral-50 dark:even:bg-neutral-900"
              >
                <td className="py-2 px-3 text-neutral-700 dark:text-neutral-300">
                  {tier.minQuantity} unité{tier.minQuantity > 1 ? "s" : ""}
                </td>
                <td className="py-2 px-3 text-right font-semibold text-blue-600">
                  {unitPrice != null ? formatPriceFR(unitPrice) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
