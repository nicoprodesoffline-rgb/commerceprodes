/**
 * Filtres de la page de rubrique : la règle d'affichage de « site_filters.v1 » (docs/site_filters_v1.md §3), la même que celle de la Factory.
 * Le SITE ne plie rien : les libellés et les valeurs se comparent à l'octet ; c'est la Factory qui regroupe les formes à la publication.
 */
import type { Family } from "./catalog";

/** Les réglages, en UNE seule constante. Un test la compare à `reglages_par_defaut` du jeu d'essai commun : pour en changer, modifier d'abord la règle. */
export const FILTER_SETTINGS = { seuil_pct: 30, valeurs_min: 2, familles_min: 5 } as const;
export type FilterSettings = { seuil_pct: number; valeurs_min: number; familles_min: number };

/** Les trois libellés filtrables, dans l'ordre d'affichage, avec le nom de leur paramètre d'adresse. */
export const FILTER_LABELS = [
  { label: "Coloris", param: "coloris" },
  { label: "Matière", param: "matiere" },
  { label: "Type", param: "type" },
] as const;

export type FilterOption = { value: string; families: number };
export type FilterGroup = { label: string; param: string; options: FilterOption[] };
type Carrier = Pick<Family, "characteristics"> & { items: readonly { characteristics?: { label: string; value: string }[] }[] };

/** Les valeurs qu'une famille porte pour un libellé : les siennes et celles de ses variantes, sans doublon. */
export function valuesOf(family: Carrier, label: string): string[] {
  const out = new Set<string>();
  for (const c of family.characteristics ?? []) if (c.label === label) out.add(c.value);
  for (const item of family.items) for (const c of item.characteristics ?? []) if (c.label === label) out.add(c.value);
  return [...out];
}

const byCodePoints = (a: string, b: string): number => {
  const x = [...a], y = [...b];
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const d = x[i]!.codePointAt(0)! - y[i]!.codePointAt(0)!;
    if (d !== 0) return d;
  }
  return x.length - y.length;
};

/** Les filtres à afficher pour l'ensemble des familles listées (sous-arbre compris), avant tout filtre choisi. */
export function filterGroups(families: readonly Carrier[], settings: FilterSettings = FILTER_SETTINGS): FilterGroup[] {
  if (families.length < settings.familles_min) return [];
  const groups: FilterGroup[] = [];
  for (const { label, param } of FILTER_LABELS) {
    const counts = new Map<string, number>();
    let carrying = 0;
    for (const family of families) {
      const values = valuesOf(family, label);
      if (values.length > 0) carrying++;
      for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    if (carrying * 100 < settings.seuil_pct * families.length || counts.size < settings.valeurs_min) continue;
    const options = [...counts].map(([value, n]) => ({ value, families: n })).sort((a, b) => b.families - a.families || byCodePoints(a.value, b.value));
    groups.push({ label, param, options });
  }
  return groups;
}

export type FilterChoice = Record<string, string[]>;

/** Les choix de l'adresse (`?coloris=…&coloris=…&type=…`), répétables ; une valeur vide est ignorée. */
export function parseFilterChoice(sp: Record<string, string | string[] | undefined>): FilterChoice {
  const out: FilterChoice = {};
  for (const { param } of FILTER_LABELS) {
    const raw = sp[param];
    const values = (Array.isArray(raw) ? raw : raw === undefined ? [] : [raw]).map((v) => v.slice(0, 200)).filter((v) => v !== "");
    if (values.length > 0) out[param] = [...new Set(values)].slice(0, 50);
  }
  return out;
}

/** OU dans un filtre, ET entre les filtres. Un choix qui ne figure pas dans les options affichées est ignoré (adresse ancienne ou fabriquée). */
export function applyFilters<T extends Carrier>(families: readonly T[], groups: readonly FilterGroup[], choice: FilterChoice): T[] {
  const active = groups.flatMap((g) => {
    const known = new Set(g.options.map((o) => o.value));
    const wanted = (choice[g.param] ?? []).filter((v) => known.has(v));
    return wanted.length > 0 ? [{ label: g.label, wanted: new Set(wanted) }] : [];
  });
  if (active.length === 0) return [...families];
  return families.filter((f) => active.every((a) => valuesOf(f, a.label).some((v) => a.wanted.has(v))));
}
