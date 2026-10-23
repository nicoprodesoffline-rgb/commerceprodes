/**
 * Projections d'affichage sur les vues du DTO (aucune lecture de source ici). Toute
 * information de prix affichée provient de `selectPrice` C0, à l'instant serveur.
 */
import type { PriceGridRow } from "@/components/product/price-grid";
import type { SelectorAxis } from "@/components/product/variant-selector";
import { selectPrice } from "@/c0/ts/src/business";
import type { C0Generation } from "@/lib/site-business/validate";
import type { Family, Item, PriceWindow } from "./catalog";

const PARIS = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", dateStyle: "short", timeStyle: "short" });

function fmt(utc: string): string {
  return `${PARIS.format(new Date(utc))} (Paris)`;
}

export function validityLabel(w: PriceWindow): string {
  if (w.valid_until_utc === null) return `dès le ${fmt(w.valid_from_utc)}, sans fin publiée`;
  return `du ${fmt(w.valid_from_utc)} au ${fmt(w.valid_until_utc)} exclu`;
}

/**
 * Grille de prix = UNE sélection C0 (`selectPrice`) par palier publié, à l'instant serveur
 * (revue A2, F-04). Les paliers sont les `quantity_min` distincts des fenêtres de l'Item, dans
 * l'ordre du DTO (déjà trié par le contrat §8.1) ; aucune comparaison locale de dates ni de
 * quantités : la fenêtre affichée est celle que `selectPrice` retient pour `quantity_min`, ou
 * le code C0 si aucune ne s'applique (ex. palier futur → `PRICE_WINDOW_UNAVAILABLE`).
 */
export function priceRows(generation: C0Generation, item: Item, nowUtc: string): PriceGridRow[] {
  const tiers: number[] = [];
  for (const w of item.windows) if (!tiers.includes(w.quantity_min)) tiers.push(w.quantity_min);
  const seen = new Set<string>();
  const rows: PriceGridRow[] = [];
  for (const tier of tiers) {
    const r = selectPrice(generation, item.public_item_key, item.variant_axes, tier, nowUtc);
    const rateId = r.accepted && r.selection ? (r.selection["rate_id"] as string) : null;
    if (rateId !== null) {
      if (seen.has(rateId)) continue;
      seen.add(rateId);
      const w = item.windows.find((x) => x.rate_id === rateId) as PriceWindow;
      rows.push({
        tier_quantity: tier,
        selected: true,
        error_codes: [],
        rate_id: w.rate_id,
        unit_amount: w.unit_amount,
        currency: w.currency,
        tax_basis_or_status: w.tax_basis_or_status,
        quantity_min: w.quantity_min,
        quantity_max: w.quantity_max,
        validity_label: validityLabel(w),
      });
    } else {
      rows.push({
        tier_quantity: tier,
        selected: false,
        error_codes: r.error_codes,
        rate_id: null,
        unit_amount: null,
        currency: null,
        tax_basis_or_status: null,
        quantity_min: tier,
        quantity_max: null,
        validity_label: null,
      });
    }
  }
  return rows;
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
