/**
 * Navigation des catégories (CAT-07) : fonction pure du DTO `site_snapshot.v1` (`categories`, `families`).
 * Aucune donnée hors DTO, aucun import (testable seul par `node --test`).
 *
 * Règles :
 * - 3 niveaux au maximum (racine = 1). Le DTO C0 ne borne pas la profondeur : une catégorie de niveau 4 ou plus n'est
 *   JAMAIS un nœud de navigation (ni menu, ni fil d'Ariane, ni page) ; ses familles sont rattachées à son ancêtre
 *   de niveau 3, et la page de ce niveau 3 les affiche.
 * - Les rubriques non validées n'arrivent pas ici : Factory n'émet que les catégories ACTIVE à chaîne valide.
 * - Une rubrique dont le sous-arbre ne contient aucune famille est masquée des menus (`visible`), mais reste résolue
 *   (sa page répond, vide, au lieu de casser un lien externe).
 * - Une catégorie dont la chaîne est cassée (parent absent, cycle) n'est pas placée : le DTO valide l'interdit,
 *   la garde est défensive.
 */
export const MAX_NAV_LEVEL = 3;

export type NavCategory = { category_key: string; name: string; parent_category_key: string | null };
export type NavFamily = { slug: string; primary_category_key: string; secondary_category_keys: string[] };

export type NavNode = {
  key: string;
  name: string;
  /** 1 = racine. */
  level: number;
  parentKey: string | null;
  /** Enfants navigables (niveau <= 3), ordre du DTO, TOUS (y compris sans famille). */
  children: NavNode[];
  /** Familles distinctes classées dans ce nœud, dans ses descendants navigables ou dans les catégories rattachées. */
  subtreeFamilyCount: number;
  /** Familles distinctes classées directement ici (ou rattachées depuis un niveau 4+). */
  ownFamilyCount: number;
};

export type Navigation = {
  /** Racines visibles ; chaque nœud ne garde que ses enfants visibles (récursivement). */
  menu: NavNode[];
  /** Nœud navigable (niveau 1 à 3) y compris vide, sinon `null` (inconnu, niveau 4+, chaîne cassée). */
  node(key: string): NavNode | null;
  /** Enfants visibles (sous-arbre non vide) d'un nœud navigable. */
  visibleChildren(key: string): NavNode[];
  /** Racine -> nœud, au plus 3 éléments ; `[]` si `key` n'est pas navigable. */
  chain(key: string): NavNode[];
  /** Nœud navigable qui porte `key` : lui-même (niveau <= 3) ou son ancêtre de niveau 3 ; `null` si non placé. */
  anchor(key: string): string | null;
  /** Slugs de familles affichés sur la page de `key` (ordre du DTO), rattachements inclus. */
  familySlugs(key: string): string[];
};

type Mutable = Omit<NavNode, "children"> & { children: Mutable[] };

export function buildNavigation(categories: readonly NavCategory[], families: readonly NavFamily[]): Navigation {
  const byKey = new Map<string, NavCategory>();
  for (const c of categories) if (!byKey.has(c.category_key)) byKey.set(c.category_key, c);

  /** Chaîne racine -> catégorie, ou `null` (parent absent, cycle). */
  const fullChain = (key: string): NavCategory[] | null => {
    const out: NavCategory[] = [];
    const seen = new Set<string>();
    let cur = byKey.get(key);
    while (cur) {
      if (seen.has(cur.category_key)) return null;
      seen.add(cur.category_key);
      out.unshift(cur);
      if (cur.parent_category_key === null) return out;
      cur = byKey.get(cur.parent_category_key);
    }
    return null;
  };

  const anchorOf = new Map<string, string>();
  const nodes = new Map<string, Mutable>();
  for (const c of categories) {
    const chain = fullChain(c.category_key);
    if (chain === null) continue;
    anchorOf.set(c.category_key, chain[Math.min(chain.length, MAX_NAV_LEVEL) - 1]!.category_key);
    if (chain.length <= MAX_NAV_LEVEL && !nodes.has(c.category_key)) {
      nodes.set(c.category_key, { key: c.category_key, name: c.name, level: chain.length, parentKey: c.parent_category_key, children: [], subtreeFamilyCount: 0, ownFamilyCount: 0 });
    }
  }
  const roots: Mutable[] = [];
  for (const c of categories) {
    const n = nodes.get(c.category_key);
    if (!n) continue;
    if (n.parentKey === null) roots.push(n);
    else nodes.get(n.parentKey)?.children.push(n);
  }

  // Familles distinctes par nœud navigable (une famille classée en principal ET en secondaire compte une fois).
  const own = new Map<string, Set<string>>();
  const slugsOrdered = new Map<string, string[]>();
  for (const f of families) {
    for (const k of new Set([f.primary_category_key, ...f.secondary_category_keys])) {
      const a = anchorOf.get(k);
      if (a === undefined) continue;
      const set = own.get(a) ?? own.set(a, new Set()).get(a)!;
      if (!set.has(f.slug)) {
        set.add(f.slug);
        (slugsOrdered.get(a) ?? slugsOrdered.set(a, []).get(a)!).push(f.slug);
      }
    }
  }
  const fill = (n: Mutable): Set<string> => {
    const all = new Set(own.get(n.key) ?? []);
    n.ownFamilyCount = all.size;
    for (const child of n.children) for (const s of fill(child)) all.add(s);
    n.subtreeFamilyCount = all.size;
    return all;
  };
  for (const r of roots) fill(r);

  const pruned = (n: Mutable): NavNode => ({ ...n, children: n.children.filter((c) => c.subtreeFamilyCount > 0).map(pruned) });
  const menu = roots.filter((r) => r.subtreeFamilyCount > 0).map(pruned);

  return {
    menu,
    node: (key) => nodes.get(key) ?? null,
    visibleChildren: (key) => (nodes.get(key)?.children ?? []).filter((c) => c.subtreeFamilyCount > 0),
    chain(key) {
      const chain = nodes.has(key) ? fullChain(key) : null;
      return chain === null ? [] : chain.map((c) => nodes.get(c.category_key)!);
    },
    anchor: (key) => anchorOf.get(key) ?? null,
    familySlugs: (key) => (nodes.has(key) ? [...(slugsOrdered.get(key) ?? [])] : []),
  };
}
