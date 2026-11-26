/**
 * CA-5 (cercle A, Owner A.4-d1 et A.4-d2) — l'ordre des familles d'une page de rubrique, calculé à l'AFFICHAGE, à l'instant servi : une promotion qui commence ou une nouveauté qui
 * expire change l'ordre sans nouvel envoi. Règle écrite dans docs/contracts/c0_site_v2.md §3.3. Fonction PURE.
 *
 * Quatre groupes, dans cet ordre ; une famille est dans le premier auquel elle appartient : gamme propre, promotions, nouveautés, le reste.
 * Dans un groupe : d'abord les familles rangées à la main DANS CETTE RUBRIQUE (par leur place), puis les autres — les nouveautés de la plus récente à la plus ancienne,
 * les autres par nom (ordre alphabétique français, sans tenir compte des accents ni des majuscules) ; dernier départage : la clé publique de la famille (public_family_key).
 * Une ancienne nouveauté reprend sa place dans son groupe : jamais le bas de la liste par principe.
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
  const rows = families.map((family) => ({ family, group: groupOf(family, nowUtc, noveltySlugs), place: placeIn(family) }));
  rows.sort((a, b) => {
    if (a.group !== b.group) return a.group - b.group;
    if (a.place !== null && b.place !== null) return a.place - b.place || a.family.public_family_key.localeCompare(b.family.public_family_key);
    if (a.place !== null) return -1;
    if (b.place !== null) return 1;
    if (a.group === GROUP_NOVELTY) {
      const byDate = (b.family.first_published_at_utc ?? "").localeCompare(a.family.first_published_at_utc ?? "");
      if (byDate !== 0) return byDate;
    }
    return collator.compare(a.family.name, b.family.name) || a.family.public_family_key.localeCompare(b.family.public_family_key);
  });
  return rows.map((r) => r.family);
}
