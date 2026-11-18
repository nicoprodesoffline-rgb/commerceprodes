/**
 * Filtre par tranches des dimensions et du poids (docs/site_filters_v1.md §6, `tranches.json`) : la même règle que la Factory.
 * Pas de curseur : des tranches demi-ouvertes [bas, haut), proposées comme des cases. Le SITE lit seulement « nombre unité » (cm, kg pour Poids) ;
 * aucune unité n'est devinée, ce que la Factory a normalisé n'est pas retouché ici.
 */
import type { FilterSettings } from "./filters.ts";

/** Les libellés réservés, dans l'ordre d'affichage (après Coloris, Matière, Type), avec leur unité et le nom de leur paramètre d'adresse. */
export const DIMENSION_LABELS = [
  { label: "Longueur", param: "longueur", unit: "cm" },
  { label: "Largeur", param: "largeur", unit: "cm" },
  { label: "Hauteur", param: "hauteur", unit: "cm" },
  { label: "Profondeur", param: "profondeur", unit: "cm" },
  { label: "Diamètre", param: "diametre", unit: "cm" },
  { label: "Épaisseur", param: "epaisseur", unit: "cm" },
  { label: "Poids", param: "poids", unit: "kg" },
] as const;

/** Mantisses des bornes rondes et nombre de tranches au plus : UNE constante, comparée à `tranches.json` par un test. */
export const ROUND_MANTISSAS: readonly number[] = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 7.5, 8, 10];
export const TRANCHES_MAX = 5;

type Carrier = { characteristics?: readonly { label: string; value: string }[] | undefined; items: readonly { characteristics?: readonly { label: string; value: string }[] | undefined }[] };
export type DimensionOption = { value: string; text: string; families: number; min: number | null; max: number | null };
export type DimensionGroup = { label: string; param: string; unit: string; options: DimensionOption[] };

/** « 1 200 cm », « 3,5 kg », « 80cm » → le nombre ; tout autre texte (autre unité, texte libre, point décimal) → `null`. Espaces et insécables ignorées, virgule décimale. */
export function readMeasure(value: string, unit: string): number | null {
  const compact = value.replace(/[\s  ]/g, "");
  const match = /^(\d+(?:,\d+)?)([a-z]+)$/.exec(compact);
  if (match === null || match[2] !== unit) return null;
  const n = Number(match[1]!.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** Le libellé d'un axe déduit, publié par la Factory pour le filtre seulement : « Filtre : Longueur ». Jamais affiché (voir `isReservedLabel`). */
export const deducedLabel = (label: string): string => `Filtre : ${label}`;

/**
 * Les valeurs lisibles qu'une famille porte pour un libellé : celles de « X » et de « Filtre : X », sur la famille et sur ses variantes, chaque valeur
 * distincte une fois. Un axe déduit sert au filtre seulement ; la fiche garde le texte source.
 */
export function measuresOf(family: Carrier, label: string, unit: string): number[] {
  const wanted = new Set([label, deducedLabel(label)]);
  const out = new Set<number>();
  const read = (list: readonly { label: string; value: string }[] | undefined) => {
    for (const c of list ?? []) if (wanted.has(c.label)) { const n = readMeasure(c.value, unit); if (n !== null) out.add(n); }
  };
  read(family.characteristics);
  for (const item of family.items) read(item.characteristics);
  return [...out];
}

/** Borne ronde : brute = m·10^e avec 1 ≤ m < 10 ; on prend l'élément de ROUND_MANTISSAS le moins éloigné de m (le plus petit à écart égal) ; si e < 0, on divise par 10^(−e), même ordre d'opérations que la Factory. */
export function roundBound(brute: number): number {
  if (!(brute > 0)) return 0;
  let e = Math.floor(Math.log10(brute));
  const mantissa = (): number => (e >= 0 ? brute / 10 ** e : brute * 10 ** -e);
  while (mantissa() >= 10) e += 1;
  while (mantissa() < 1) e -= 1;
  const m = mantissa();
  let best = ROUND_MANTISSAS[0]!;
  for (const candidate of ROUND_MANTISSAS) if (Math.abs(candidate - m) < Math.abs(best - m)) best = candidate;
  return e >= 0 ? best * 10 ** e : best / 10 ** -e;
}

const group3 = (digits: string): string => digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
/** Le nombre comme sur la fiche : virgule décimale, milliers séparés par une espace insécable. */
export function formatNumber(n: number): string {
  const [whole, decimals] = String(Number(n.toPrecision(12))).split(".");
  return group3(whole!) + (decimals === undefined ? "" : `,${decimals}`);
}

const nb = " ";
export function trancheText(min: number | null, max: number | null, unit: string): string {
  if (min === null) return `moins de ${formatNumber(max!)}${nb}${unit}`;
  if (max === null) return `${formatNumber(min)}${nb}${unit} et plus`;
  return `${formatNumber(min)} à ${formatNumber(max)}${nb}${unit}`;
}

/** L'adresse d'une tranche : `80-150`, `-80`, `300-` (point décimal). */
export const trancheToken = (min: number | null, max: number | null): string => `${min ?? ""}-${max ?? ""}`;

export function inTranche(value: number, min: number | null, max: number | null): boolean {
  return (min === null || value >= min) && (max === null || value < max);
}

/** Les filtres de dimensions à afficher pour l'ensemble des familles listées (sous-arbre compris), avant tout filtre choisi. */
export function dimensionGroups(families: readonly Carrier[], settings: FilterSettings): DimensionGroup[] {
  if (families.length < settings.familles_min) return [];
  const groups: DimensionGroup[] = [];
  for (const { label, param, unit } of DIMENSION_LABELS) {
    const perFamily = families.map((f) => measuresOf(f, label, unit)).filter((values) => values.length > 0);
    if (perFamily.length === 0 || perFamily.length * 100 < settings.seuil_pct * families.length) continue;
    const L = perFamily.flat().sort((a, b) => a - b);
    const n = L.length;
    const bounds = new Set<number>();
    for (let i = 1; i <= TRANCHES_MAX - 1; i++) {
      const b = roundBound(L[Math.floor((i * n) / TRANCHES_MAX)]!);
      if (L[0]! < b && b <= L[n - 1]!) bounds.add(b);
    }
    const sorted = [...bounds].sort((a, b) => a - b);
    const edges: [number | null, number | null][] = sorted.length === 0 ? [] : [[null, sorted[0]!], ...sorted.slice(1).map((b, i): [number, number] => [sorted[i]!, b]), [sorted[sorted.length - 1]!, null]];
    const options = edges
      .map(([min, max]) => ({ value: trancheToken(min, max), text: trancheText(min, max, unit), min, max, families: perFamily.filter((values) => values.some((v) => inTranche(v, min, max))).length }))
      .filter((option) => option.families > 0);
    if (options.length >= settings.valeurs_min) groups.push({ label, param, unit, options });
  }
  return groups;
}

/** Les choix d'une adresse de tranche : `80-150`, `-80`, `300-` (point décimal) ; tout autre texte → `null` (ancienne adresse inconnue, ignorée). */
export function parseTranche(token: string): { min: number | null; max: number | null } | null {
  const match = /^(\d+(?:\.\d+)?)?-(\d+(?:\.\d+)?)?$/.exec(token);
  if (match === null || (match[1] === undefined && match[2] === undefined)) return null;
  return { min: match[1] === undefined ? null : Number(match[1]), max: match[2] === undefined ? null : Number(match[2]) };
}
