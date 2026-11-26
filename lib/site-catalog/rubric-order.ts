/**
 * CA-5 (cercle A, Owner A.4-d1, A.4-d2 et réponse du 27/11 : « le rangement à la main d'abord ») — l'ordre des familles d'une page de rubrique, calculé à l'AFFICHAGE,
 * à l'instant servi : une promotion qui commence ou une nouveauté qui expire change l'ordre sans nouvel envoi.
 *
 * La règle n'est PAS écrite ici : c'est celle du contrat (c0v2/ts/src/rubric.ts, jumeau du Python de la Factory, docs/contracts/c0_site_v2.md §3.3,
 * jeux d'essai V2_RUBRIC). Ce module ne fait que dire au contrat quelles familles sont en promotion et quelles sont des nouveautés à l'instant servi
 * (isPromoNow et la règle des nouveautés restent calculés par le site), puis rend les familles dans l'ordre que le contrat donne.
 */
import type { Family } from "./catalog";
import { isPromoNow } from "./merchandising.ts";
import { orderRubric as contractOrder } from "../../c0v2/ts/src/rubric";
import type { JsonObject } from "../../c0/ts/src/jsonc";

export function orderRubric(families: readonly Family[], categoryKey: string, nowUtc: string, noveltySlugs: ReadonlySet<string>): Family[] {
  const byKey = new Map(families.map((family) => [family.public_family_key, family] as const));
  const promotions = families.filter((family) => isPromoNow(family, nowUtc)).map((family) => family.public_family_key);
  const novelties = families.filter((family) => noveltySlugs.has(family.slug)).map((family) => family.public_family_key);
  const ordered = contractOrder(families as unknown as readonly JsonObject[], categoryKey, promotions, novelties);
  return ordered.families.map((key) => byKey.get(key) as Family);
}
