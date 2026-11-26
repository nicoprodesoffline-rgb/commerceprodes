/**
 * CA-5 (cercle A, Owner A.4-d1, A.4-d2 et réponse du 27/11 : « le rangement à la main d'abord ») — l'ordre des familles d'une page de rubrique, calculé à l'AFFICHAGE,
 * à l'instant servi : une promotion qui commence ou une nouveauté qui expire change l'ordre sans nouvel envoi. Règle écrite dans docs/contracts/c0_site_v2.md §3.3. Fonction PURE.
 *
 * 1. Les familles rangées à la main DANS CETTE RUBRIQUE (elles ont une place) passent avant tout, par leur place ; la règle ne range pas celles-là.
 * 2. Les autres : quatre groupes dans cet ordre, une famille étant dans le premier auquel elle appartient : gamme propre, promotions, nouveautés, le reste.
 *    Dans un groupe : les nouveautés de la plus récente à la plus ancienne, les autres par nom (ordre alphabétique français, sans tenir compte des accents ni des majuscules) ;
 *    dernier départage : la clé publique de la famille (public_family_key).
 * Une ancienne nouveauté reprend sa place dans son groupe (sa place alphabétique) : jamais le bas de la liste par principe.
 */
import type { Family } from "./catalog";
import { isPromoNow } from "./merchandising.ts";

export const GROUP_OWN = 0, GROUP_PROMO = 1, GROUP_NOVELTY = 2, GROUP_REST = 3;

const collator = new Intl.Collator("fr", { sensitivity: "base" });

export function groupOf(family: Family, nowUtc: string, noveltySlugs: ReadonlySet<string>): number {
  if (family.own_range === true) return GROUP_OWN;
  if (isPromoNow(family, nowUtc)) return GROUP_PROMO;
  if (noveltySlugs.has(family.slug)) return GROUP_NOVELTY;
  return GROUP_REST;
}

export function orderRubric(families: readonly Family[], categoryKey: string, nowUtc: string, noveltySlugs: ReadonlySet<string>): Family[] {
  const placeIn = (f: Family): number | null => {
    const entry = (f.category_positions ?? []).find((p) => p.category_key === categoryKey);
    return entry === undefined ? null : entry.position;
  };
  const byKey = (a: Family, b: Family) => a.public_family_key.localeCompare(b.public_family_key);
  const rows = families.map((family) => ({ family, group: groupOf(family, nowUtc, noveltySlugs), place: placeIn(family) }));
  const placed = rows.filter((r) => r.place !== null).sort((a, b) => (a.place as number) - (b.place as number) || byKey(a.family, b.family));
  const others = rows.filter((r) => r.place === null).sort((a, b) => {
    if (a.group !== b.group) return a.group - b.group;
    if (a.group === GROUP_NOVELTY) {
      const byDate = (b.family.first_published_at_utc ?? "").localeCompare(a.family.first_published_at_utc ?? "");
      if (byDate !== 0) return byDate;
    }
    return collator.compare(a.family.name, b.family.name) || byKey(a.family, b.family);
  });
  return [...placed, ...others].map((r) => r.family);
}
