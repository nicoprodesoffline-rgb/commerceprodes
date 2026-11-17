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

/** Cercle 3 : `position` (ordre parmi les sœurs) et `hidden` (absente du menu, pas des adresses) n'existent qu'en catalogue v2 ; `category_positions` ordonne les familles DANS une rubrique. */
export type NavCategory = { category_key: string; name: string; parent_category_key: string | null; position?: number; hidden?: boolean };
export type NavFamily = { slug: string; primary_category_key: string; secondary_category_keys: string[]; category_positions?: readonly { category_key: string; position: number }[] };

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
  /** Slugs distincts de tout le sous-arbre de `key` (ordre du DTO), rattachements inclus. */
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
  // Ordre des rubriques : leur position quand le catalogue en donne une (v2), sinon l'ordre du DTO ; le tri est stable.
  const positionOf = new Map<string, number>(categories.flatMap((c): [string, number][] => (typeof c.position === "number" ? [[c.category_key, c.position]] : [])));
  const hidden = new Set(categories.filter((c) => c.hidden === true).map((c) => c.category_key));
  const roots: Mutable[] = [];
  for (const c of categories) {
    const n = nodes.get(c.category_key);
    if (!n) continue;
    if (n.parentKey === null) roots.push(n);
    else nodes.get(n.parentKey)?.children.push(n);
  }

  // Familles distinctes par nœud navigable (une famille classée en principal ET en secondaire compte une fois).
  const own = new Map<string, Set<string>>();
  const subtree = new Map<string, Set<string>>();
  const familyOrder = [...new Set(families.map((f) => f.slug))];
  for (const f of families) {
    for (const k of new Set([f.primary_category_key, ...f.secondary_category_keys])) {
      const a = anchorOf.get(k);
      if (a === undefined) continue;
      const set = own.get(a) ?? own.set(a, new Set()).get(a)!;
      set.add(f.slug);
    }
  }
  const fill = (n: Mutable): Set<string> => {
    const all = new Set(own.get(n.key) ?? []);
    n.ownFamilyCount = all.size;
    for (const child of n.children) for (const s of fill(child)) all.add(s);
    n.subtreeFamilyCount = all.size;
    subtree.set(n.key, all);
    return all;
  };
  for (const r of roots) fill(r);

  const bySiblingOrder = (a: Mutable, b: Mutable) => (positionOf.get(a.key) ?? 0) - (positionOf.get(b.key) ?? 0);
  const shown = (n: Mutable) => n.subtreeFamilyCount > 0 && !hidden.has(n.key);   // une rubrique masquée quitte le menu, jamais les adresses ni la recherche
  const ordered = (list: Mutable[]) => (positionOf.size === 0 ? list : [...list].sort(bySiblingOrder));
  const pruned = (n: Mutable): NavNode => ({ ...n, children: ordered(n.children).filter(shown).map(pruned) });
  const menu = ordered(roots).filter(shown).map(pruned);

  // Ordre des familles dans une rubrique : celles qui ont une place dans CETTE rubrique d'abord (par place), les autres ensuite dans l'ordre du DTO.
  const rankIn = new Map<string, Map<string, number>>();
  for (const f of families) for (const p of f.category_positions ?? []) (rankIn.get(p.category_key) ?? rankIn.set(p.category_key, new Map()).get(p.category_key)!).set(f.slug, p.position);

  return {
    menu,
    node: (key) => nodes.get(key) ?? null,
    visibleChildren: (key) => ordered(nodes.get(key)?.children ?? []).filter(shown),
    chain(key) {
      const chain = nodes.has(key) ? fullChain(key) : null;
      return chain === null ? [] : chain.map((c) => nodes.get(c.category_key)!);
    },
    anchor: (key) => anchorOf.get(key) ?? null,
    familySlugs(key) {
      const slugs = familyOrder.filter((slug) => subtree.get(key)?.has(slug));
      const ranks = rankIn.get(key);
      return ranks === undefined ? slugs : slugs.map((slug, index) => ({ slug, index })).sort((a, b) => (ranks.get(a.slug) ?? Infinity) - (ranks.get(b.slug) ?? Infinity) || a.index - b.index).map((e) => e.slug);
    },
  };
}
