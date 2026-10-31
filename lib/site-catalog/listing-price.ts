/** Prix « à partir de » d'une Famille : lecture serveur de `selectPrice` C0 (voir `listing.ts`, qui reste pur et testable sans serveur). */
import type { Catalog, Family } from "./catalog";
import { cents, type FamilyPrice } from "./listing";
import { priceRows } from "./view";

export function familyPrice(catalog: Catalog, family: Family, nowUtc: string): FamilyPrice {
  let best: { amount: string; basis: string | null; c: bigint } | null = null;
  for (const item of family.items) {
    for (const row of priceRows(catalog.c0Generation, item, nowUtc)) {
      if (!row.selected || row.unit_amount === null) continue;
      const c = cents(row.unit_amount);
      if (c !== null && (best === null || c < best.c)) best = { amount: row.unit_amount, basis: row.tax_basis_or_status, c };
    }
  }
  return best === null ? null : { amount: best.amount, basis: best.basis };
}

