/**
 * Projections d'affichage sur les vues du DTO (aucune lecture de source ici). Les fenêtres
 * affichées sont celles PUBLIÉES, telles quelles ; le prix faisant foi reste `selectPrice`.
 */
import type { PriceGridRow } from "@/components/product/price-grid";
import type { SelectorAxis } from "@/components/product/variant-selector";
import { type Family, type PriceWindow, windowState } from "./catalog";

const PARIS = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", dateStyle: "short", timeStyle: "short" });

function fmt(utc: string): string {
  return `${PARIS.format(new Date(utc))} (Paris)`;
}

export function validityLabel(w: PriceWindow): string {
  if (w.valid_until_utc === null) return `dès le ${fmt(w.valid_from_utc)}, sans fin publiée`;
  return `du ${fmt(w.valid_from_utc)} au ${fmt(w.valid_until_utc)} exclu`;
}

/** Fenêtres publiées, ordonnées par quantité minimale puis début de validité. */
export function priceRows(windows: PriceWindow[], nowUtc: string): PriceGridRow[] {
  return [...windows]
    .sort((a, b) => a.quantity_min - b.quantity_min || (a.valid_from_utc < b.valid_from_utc ? -1 : a.valid_from_utc > b.valid_from_utc ? 1 : 0))
    .map((w) => ({
      rate_id: w.rate_id,
      unit_amount: w.unit_amount,
      currency: w.currency,
      tax_basis_or_status: w.tax_basis_or_status,
      quantity_min: w.quantity_min,
      quantity_max: w.quantity_max,
      state: windowState(w, nowUtc),
      validity_label: validityLabel(w),
    }));
}

/**
 * Axes de la Famille (ordre et libellés du DTO) et, pour chacun, les valeurs portées par au
 * moins un Item PUBLIÉ. Aucune combinaison n'est construite : la sélection résout toujours
 * vers un Item publié existant.
 */
export function selectorAxes(f: Family): SelectorAxis[] {
  return f.axes.map((a) => {
    const values: string[] = [];
    for (const i of f.items) {
      const v = i.variant_axes[a.axis_key];
      if (v !== undefined && !values.includes(v)) values.push(v);
    }
    return { axis: a.axis_key, label: a.label, values };
  });
}
