/**
 * Cercle 3, paquet B — promotions, nouveautés, recherche dans les caractéristiques, documents. Fonctions PURES sur les familles servies (catalogue v2 ; v1 : rien ne s'affiche).
 * Aucun prix n'est calculé ici : une promotion est une fenêtre de prix dont la nature est « PROMOTION », en cours à l'instant serveur ; le prix barré est celui que le fichier du Calculateur
 * a fourni (`reference_unit_amount`), jamais un calcul. Une date de fin de promotion n'est jamais montrée au public.
 */
import type { Family, FamilyDocument, PriceWindow } from "./catalog";

export const PROMOTION = "PROMOTION";
export const DEFAULT_NOVELTY_DAYS = 60;
export const DEFAULT_NOVELTY_COUNT = 24;
const DAY_MS = 86_400_000;

/** Une fenêtre en cours à `nowUtc` (début inclus, fin exclue ; chaînes UTC de même forme, comparables telles quelles). */
export function isCurrent(window: Pick<PriceWindow, "valid_from_utc" | "valid_until_utc">, nowUtc: string): boolean {
  return window.valid_from_utc <= nowUtc && (window.valid_until_utc === null || nowUtc < window.valid_until_utc);
}

/** Une fenêtre « en promotion » : de nature PROMOTION, ou portant un prix barré fourni par le Calculateur (M01, M02 : le contrat v2 accepte le prix barré sur toute nature). */
export function isPromotionWindow(window: PriceWindow, nowUtc: string): boolean {
  return (window.price_nature === PROMOTION || (typeof window.reference_unit_amount === "string" && window.reference_unit_amount !== "")) && isCurrent(window, nowUtc);
}

/** La famille porte au moins une promotion en cours (M01, M06). */
export function isPromoNow(family: Family, nowUtc: string): boolean {
  return family.items.some((item) => item.windows.some((w) => isPromotionWindow(w, nowUtc)));
}

export function promoFamilies(families: readonly Family[], nowUtc: string): Family[] {
  return families.filter((f) => isPromoNow(f, nowUtc));
}

/** Économie par lot : prix barré − prix du lot, en centimes lus dans des chaînes Money ; `null` si le prix barré n'est pas supérieur. */
export function economy(reference: string, amount: string): string | null {
  const parse = (m: string): bigint | null => { const x = /^(\d+)\.(\d{2})$/.exec(m); return x ? BigInt(x[1]!) * 100n + BigInt(x[2]!) : null; };
  const r = parse(reference), a = parse(amount);
  if (r === null || a === null || r <= a) return null;
  const d = r - a;
  return `${d / 100n}.${String(d % 100n).padStart(2, "0")}`;
}

/**
 * Nouveautés (N01–N06) : les familles dont la première publication sur le SITE date de moins de `days` jours, les plus récentes d'abord, `count` au plus.
 * Une famille sans date de première publication (catalogue v1) n'est jamais une nouveauté.
 */
export function novelFamilies(families: readonly Family[], nowUtc: string, days: number, count: number): Family[] {
  const since = new Date(Date.parse(nowUtc) - days * DAY_MS).toISOString().replace(/\.\d{3}Z$/, "Z");
  return families
    .filter((f) => typeof f.first_published_at_utc === "string" && f.first_published_at_utc >= since && f.first_published_at_utc <= nowUtc)
    .sort((a, b) => (b.first_published_at_utc as string).localeCompare(a.first_published_at_utc as string) || a.slug.localeCompare(b.slug))
    .slice(0, Math.max(0, count));
}

/** Texte des caractéristiques d'une famille et de ses variantes, pour la recherche seulement (C02) : jamais affiché. */
export function characteristicsText(family: Family): string {
  const own = (family.characteristics ?? []).map((c) => `${c.label} ${c.value}`);
  const items = family.items.flatMap((i) => (i.characteristics ?? []).map((c) => `${c.label} ${c.value}`));
  return [...own, ...items].join(" ");
}

/** Liens des documents PDF d'une famille (D01, D03), servis par l'adresse des médias du SITE. */
export function documentLinks(family: Family): { label: string; href: string }[] {
  return (family.documents ?? []).filter((d: FamilyDocument) => d.mime === "application/pdf").map((d) => ({ label: d.label, href: `/media/${d.sha256}` }));
}

export type UniverseSection = { key: string; name: string; level: number; families: Family[] };

/**
 * Un univers « en miroir des rubriques » (M04) : les rubriques du menu, dans leur ordre, chacune avec ses seules familles retenues (promotions, ici) classées directement sous elle ;
 * une rubrique sans famille retenue n'y figure pas. `menu` = racines visibles de la navigation ; `anchorOf` = nœud navigable qui porte la rubrique principale d'une famille.
 */
export function mirrorSections(menu: readonly { key: string; name: string; level: number; children: readonly unknown[] }[], families: readonly Family[], anchorOf: (key: string) => string | null): UniverseSection[] {
  const byAnchor = new Map<string, Family[]>();
  for (const f of families) {
    const anchor = anchorOf(f.primary_category_key);
    if (anchor !== null) byAnchor.set(anchor, [...(byAnchor.get(anchor) ?? []), f]);
  }
  const out: UniverseSection[] = [];
  const walk = (nodes: readonly { key: string; name: string; level: number; children: readonly unknown[] }[]) => {
    for (const n of nodes) {
      const own = byAnchor.get(n.key);
      if (own) out.push({ key: n.key, name: n.name, level: n.level, families: own });
      walk(n.children as typeof nodes);
    }
  };
  walk(menu);
  return out;
}
