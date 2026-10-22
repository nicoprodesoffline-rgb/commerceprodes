/**
 * Projections d'affichage construites sur l'adaptateur DTO (pas de lecture
 * de fixture ici). Les libellés de date sont calculés côté serveur.
 */
import type { PriceGridRow } from "@/components/product/price-grid";
import { formatAxisName } from "@/lib/format";
import { type Family, type SellWindow, windowState } from "./index";

const PARIS = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Paris",
  dateStyle: "short",
  timeStyle: "short",
});

function fmt(utc: string): string {
  return `${PARIS.format(new Date(utc))} (Paris)`;
}

export function validityLabel(w: SellWindow): string {
  const from = `dès le ${fmt(w.valid_from_utc)}`;
  if (w.valid_until_utc === null) return `${from}, sans fin publiée`;
  return `du ${fmt(w.valid_from_utc)} au ${fmt(w.valid_until_utc)} exclu`;
}

export function priceRows(windows: SellWindow[], instantUtc: string): PriceGridRow[] {
  return windows
    .map((w) => ({
      rate_id: w.rate_id,
      layer: w.layer,
      unit_amount: w.unit_amount,
      currency: w.currency,
      tax_basis_or_status: w.tax_basis_or_status,
      quantity_min: w.quantity_min,
      quantity_max: w.quantity_max,
      state: windowState(w, instantUtc),
      validity_label: validityLabel(w),
    }))
    .sort((a, b) => (a.layer === b.layer ? a.quantity_min - b.quantity_min : a.layer === "PROMO" ? 1 : -1));
}

/** Combinaisons du produit cartésien des axes qui ne sont PAS publiées. */
export function unavailableCombinations(f: Family): string[] {
  if (f.variant_axes_schema.length === 0) return [];
  let combos: Record<string, string>[] = [{}];
  for (const a of f.variant_axes_schema) {
    combos = combos.flatMap((c) => a.values.map((v) => ({ ...c, [a.axis]: v })));
  }
  return combos
    .filter((c) => !f.items.some((i) => Object.entries(c).every(([k, v]) => i.variant_axes[k] === v)))
    .map((c) => {
      const label = Object.entries(c).map(([k, v]) => `${formatAxisName(k)} ${v}`).join(" × ");
      const forbidden = f.forbidden_combinations.some((fc) => Object.entries(fc).every(([k, v]) => c[k] === v));
      return `${label}${forbidden ? " (interdite)" : " (non publiée)"}`;
    });
}
