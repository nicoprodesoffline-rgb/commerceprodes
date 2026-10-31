/** Suggestions de la recherche instantanée (T-T05) : forme pure, testable sans serveur. Les textes de prix sont formatés par le serveur (aucun calcul dans le navigateur). */
import type { Family } from "./catalog";
import type { FamilyPrice } from "./listing";

export const SUGGEST_MIN = 2;
export const SUGGEST_MAX = 8;
export type Suggestion = { slug: string; name: string; category: string | null; imageSha: string | null; priceText: string };

export function suggestionsOf(families: Family[], priceText: (p: FamilyPrice) => string, categoryOf: (f: Family) => string | null, priceOf: (f: Family) => FamilyPrice): Suggestion[] {
  return families.slice(0, SUGGEST_MAX).map((f) => ({
    slug: f.slug, name: f.name, category: categoryOf(f), imageSha: f.image_main_sha256 || null, priceText: priceText(priceOf(f)),
  }));
}
