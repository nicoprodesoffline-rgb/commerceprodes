// Cercle A, CA-5 (Owner A.4-d1, A.4-d2 ; 82e série, 27/11): the order of the families of a rubric page, twin of
// c0v2/python/c0_contracts_v2/rubric.py (same rule, same results). docs/contracts/c0_site_v2.md §3.3:
// 1. the families placed by hand in THIS rubric (category_positions), by their position: a novelty placed by hand stays at its place;
// 2. then the others, in four groups: own range (own_range, absent reads false), promotions, novelties, the rest; novelties newest
//    first (first_published_at_utc); then the name without accents nor capitals, compared code point by code point (no numeric order:
//    « Banc 10 » before « Banc 2 »); last tie-break public_family_key. A former novelty takes back its place by its name.

import { Json, JsonObject } from "../../../c0/ts/src/jsonc";
import { Verdict, verdict } from "./errors";

export const HAND = "hand", OWN_RANGE = "own_range", PROMOTIONS = "promotions", NOVELTIES = "novelties", REST = "rest";
export const PARTS = [HAND, OWN_RANGE, PROMOTIONS, NOVELTIES, REST];

/** The name as it is compared: lower case, decomposed, every combining mark removed (Unicode category M). */
export function nameKey(name: Json | undefined): string {
  return String(name ?? "").toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
}

function compareText(a: string, b: string): number {
  const left = Array.from(a), right = Array.from(b);
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    const difference = (left[index] as string).codePointAt(0)! - (right[index] as string).codePointAt(0)!;
    if (difference !== 0) return difference < 0 ? -1 : 1;
  }
  return left.length === right.length ? 0 : left.length < right.length ? -1 : 1;
}

function positionIn(family: JsonObject, categoryKey: string): number | null {
  const entries = (family["category_positions"] ?? []) as JsonObject[];
  const entry = entries.find((candidate) => candidate["category_key"] === categoryKey);
  return entry === undefined ? null : (entry["position"] as number);
}

export function partOf(family: JsonObject, categoryKey: string, promotions: ReadonlySet<string>, novelties: ReadonlySet<string>): string {
  const key = family["public_family_key"] as string;
  if (positionIn(family, categoryKey) !== null) return HAND;
  if (family["own_range"] === true) return OWN_RANGE;
  if (promotions.has(key)) return PROMOTIONS;
  if (novelties.has(key)) return NOVELTIES;
  return REST;
}

/** The order of two families of the rubric: negative when a comes first. */
export function compare(a: JsonObject, b: JsonObject, categoryKey: string, promotions: ReadonlySet<string>, novelties: ReadonlySet<string>): number {
  const partA = partOf(a, categoryKey, promotions, novelties), partB = partOf(b, categoryKey, promotions, novelties);
  const byKey = () => compareText(a["public_family_key"] as string, b["public_family_key"] as string);
  if (partA !== partB) return PARTS.indexOf(partA) - PARTS.indexOf(partB);
  if (partA === HAND) return (positionIn(a, categoryKey)! - positionIn(b, categoryKey)!) || byKey();
  if (partA === NOVELTIES) {
    const newest = compareText(String(b["first_published_at_utc"] ?? ""), String(a["first_published_at_utc"] ?? ""));
    if (newest !== 0) return newest;
  }
  return compareText(nameKey(a["name"]), nameKey(b["name"])) || byKey();
}

export interface RubricOrder extends Verdict {
  families: string[];
  parts: string[];
}

/** families: the families of the rubric as the catalogue gives them; promotions and novelties: their public keys at the instant
 *  served. Returns the public keys in the order of the page and, beside each, its part (hand, own_range…). */
export function orderRubric(families: readonly JsonObject[], categoryKey: string, promotions: Iterable<string>, novelties: Iterable<string>): RubricOrder {
  const promo = new Set(promotions), novel = new Set(novelties);
  const ordered = [...families].sort((a, b) => compare(a, b, categoryKey, promo, novel));
  return { ...verdict(true, "ORDERED", []), families: ordered.map((f) => f["public_family_key"] as string), parts: ordered.map((f) => partOf(f, categoryKey, promo, novel)) };
}
