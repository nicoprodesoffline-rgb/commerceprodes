/**
 * Listes du catalogue (recherche, catégorie) : prix « à partir de » d'une Famille, filtre de prix, tri, pagination.
 *
 * Aucun prix n'est calculé ici : le prix d'une Famille est le plus bas des prix unitaires que `selectPrice` C0 retient (à l'instant serveur)
 * pour ses variantes et leurs paliers (`priceRows`) ; les montants restent des chaînes Money. Les comparaisons (filtre, tri) se font sur des
 * centimes entiers lus dans ces chaînes, jamais sur des flottants ni sur une valeur recalculée. Sans prix retenu, la Famille est « Sur devis ».
 * Le tri « populaires » et « nouveautés » de l'ancien site n'existent pas : C0 ne publie ni ventes ni date de mise en ligne.
 */
import type { Family } from "./catalog";

export type FamilyPrice = { amount: string; basis: string | null } | null;

export function cents(amount: string): bigint | null {
  const m = /^(\d+)\.(\d{2})$/.exec(amount);
  return m ? BigInt(m[1]!) * 100n + BigInt(m[2]!) : null;
}

/** Saisie d'un opérateur (« 12 », « 12,5 », « 12.50 ») → centimes ; `null` si ce n'est pas un montant. */
export function centsFromInput(raw: string): bigint | null {
  const m = /^(\d{1,7})(?:[.,](\d{1,2}))?$/.exec(raw.trim());
  return m ? BigInt(m[1]!) * 100n + BigInt((m[2] ?? "").padEnd(2, "0") || "0") : null;
}

export const SORTS = [
  ["pertinence", "Pertinence"],
  ["prix-croissant", "Prix croissant"],
  ["prix-decroissant", "Prix décroissant"],
  ["nom", "Nom (A → Z)"],
] as const;
export type SortKey = (typeof SORTS)[number][0];
export const PAGE_SIZE = 24;

export type ListingQuery = { q: string; minRaw: string; maxRaw: string; min: bigint | null; max: bigint | null; sort: SortKey; page: number; ignored: string[] };
type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

export function parseListingQuery(sp: Params, searchMax = 100): ListingQuery {
  const minRaw = one(sp["prix_min"]).slice(0, 12);
  const maxRaw = one(sp["prix_max"]).slice(0, 12);
  const min = minRaw.trim() === "" ? null : centsFromInput(minRaw);
  const max = maxRaw.trim() === "" ? null : centsFromInput(maxRaw);
  const ignored: string[] = [];
  if (minRaw.trim() !== "" && min === null) ignored.push("Prix minimum ignoré : ce n'est pas un montant.");
  if (maxRaw.trim() !== "" && max === null) ignored.push("Prix maximum ignoré : ce n'est pas un montant.");
  const sortRaw = one(sp["tri"]);
  const sort = (SORTS.find(([k]) => k === sortRaw)?.[0] ?? "pertinence") as SortKey;
  const page = Math.max(1, Math.min(9999, Number.parseInt(one(sp["page"]), 10) || 1));
  return { q: one(sp["q"]).slice(0, searchMax), minRaw, maxRaw, min, max, sort, page, ignored };
}

export type Listed = { family: Family; price: FamilyPrice };
export type Listing = { total: number; pages: number; page: number; rows: Listed[]; filtered: boolean };

/** Filtre de prix, tri et page. Le prix n'est lu (donc calculé par C0) que si le filtre ou le tri l'exige, sinon pour la page affichée seulement. */
export function listFamilies(families: Family[], query: ListingQuery, priceOf: (family: Family) => FamilyPrice): Listing {
  const needsPrice = query.min !== null || query.max !== null || query.sort === "prix-croissant" || query.sort === "prix-decroissant";
  let rows: Listed[] = families.map((family) => ({ family, price: needsPrice ? priceOf(family) : null }));
  const filtered = query.min !== null || query.max !== null;
  if (filtered) {
    rows = rows.filter((r) => {
      const c = r.price === null ? null : cents(r.price.amount);
      return c !== null && (query.min === null || c >= query.min) && (query.max === null || c <= query.max);
    });
  }
  const byPrice = (dir: 1 | -1) => (a: Listed, b: Listed) => {
    const ca = a.price ? cents(a.price.amount) : null, cb = b.price ? cents(b.price.amount) : null;
    if (ca === null && cb === null) return 0;
    if (ca === null) return 1; // sans prix : toujours en dernier
    if (cb === null) return -1;
    return ca === cb ? 0 : ca < cb ? -dir : dir;
  };
  if (query.sort === "prix-croissant") rows = [...rows].sort(byPrice(1));
  else if (query.sort === "prix-decroissant") rows = [...rows].sort(byPrice(-1));
  else if (query.sort === "nom") rows = [...rows].sort((a, b) => a.family.name.localeCompare(b.family.name, "fr", { sensitivity: "base" }));
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(query.page, pages);
  const slice = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((r) => (r.price !== null || needsPrice ? r : { ...r, price: priceOf(r.family) }));
  return { total, pages, page, rows: slice, filtered };
}
