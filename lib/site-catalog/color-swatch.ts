/**
 * La pastille d'un coloris (cercle 4, ligne 4.27, décision de l'Owner du 18/11) : le SITE ne devine plus aucune teinte.
 * La nuance est attribuée dans la Factory et publiée dans la caractéristique réservée « Pastille » (docs/site_filters_v1.md §4) ;
 * ce fichier ne fait que la DESSINER : teinte et motif d'un nom de la palette, deux moitiés pour « A / B » (dans l'ordre du texte),
 * arc-en-ciel pour « Multicolore », gris neutre pour « Non précisé », rien pour une valeur inconnue ou absente.
 * Les teintes sont lues dans `palette.json` et `ral.json`, recopiés à l'octet de la Factory : aucune teinte n'est écrite dans ce fichier.
 */
import type { CSSProperties } from "react";
import palette from "./fixtures/site_filters_v1/palette.json" with { type: "json" };
import ral from "./fixtures/site_filters_v1/ral.json" with { type: "json" };
import { BICOLORE_SEPARATOR, MULTICOLORE, NON_PRECISE } from "./pastille.ts";

export type Motif = "uni" | "metal" | "brosse" | "galva" | "bois" | "transparent";
/** [nom, teinte, motif] : les nuances de la palette, lues dans `fixtures/site_filters_v1/palette.json` (recopié à l'octet de la Factory). */
export const PALETTE: readonly (readonly [string, string, Motif])[] = palette.nuances.map((n) => [n.name, n.hex, n.motif as Motif] as const);

const BY_NAME = new Map(PALETTE.map(([name, hex, motif]) => [name, { hex, motif }]));

function channels(hex: string): number[] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}
/** Mélange `hex` avec du blanc (part > 0) ou du noir (part < 0) : du relief pour un motif, sans autre teinte. */
function shade(hex: string, part: number): string {
  const target = part >= 0 ? 255 : 0;
  const mixed = channels(hex).map((c) => Math.round(c + (target - c) * Math.abs(part)));
  return `#${mixed.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

/** L'image CSS d'une nuance. Chaque motif se distingue à l'œil d'une teinte unie voisine ; aucune image externe. */
function paint(hex: string, motif: Motif): string {
  switch (motif) {
    case "metal": return `linear-gradient(135deg, ${shade(hex, 0.55)} 0%, ${hex} 38%, ${shade(hex, -0.25)} 62%, ${shade(hex, 0.45)} 100%)`;
    case "brosse": return `repeating-linear-gradient(90deg, ${hex} 0 1px, ${shade(hex, 0.4)} 1px 2px, ${shade(hex, -0.12)} 2px 3px)`;
    case "galva": return `conic-gradient(from 30deg, ${hex}, ${shade(hex, 0.5)}, ${shade(hex, -0.2)}, ${shade(hex, 0.35)}, ${hex}, ${shade(hex, -0.3)}, ${hex})`;
    case "bois": return `repeating-linear-gradient(100deg, ${hex} 0 2px, ${shade(hex, -0.22)} 2px 3px, ${shade(hex, 0.12)} 3px 5px)`;
    case "transparent": return `repeating-linear-gradient(45deg, #ffffff 0 3px, ${hex} 3px 6px)`;
    default: return `linear-gradient(${hex}, ${hex})`;
  }
}

const RAINBOW = "conic-gradient(#d0141c, #f7d000, #2e9a3c, #1fb5b0, #1f5fbf, #7b3fa0, #d0141c)";
const NEUTRAL_HEX = "#d9d9d6";
const RAL_TEINTES = ral.teintes as Readonly<Record<string, string>>;

/** Seuil de la règle de sûreté (docs/site_filters_v1.md §5) : deux teintes à moins de ce ΔE CIELAB 1976, de même motif, ne se séparent pas à l'œil. UNE seule constante. */
export const INDISCERNIBLE_DELTA_E = 10;

/** Une partie dessinée : sa teinte (`null` pour l'arc-en-ciel) et son motif ; `rainbow` et `neutral` sont les deux pastilles spéciales. */
type Part = { hex: string | null; motif: Motif | "rainbow" | "neutral" };

function nuancePart(name: string): Part | null {
  if (name === MULTICOLORE) return { hex: null, motif: "rainbow" };
  if (name === NON_PRECISE) return { hex: NEUTRAL_HEX, motif: "neutral" };
  const found = BY_NAME.get(name);
  return found === undefined ? null : { hex: found.hex, motif: found.motif };
}

/**
 * Les parties dessinées par « Pastille » (et « Teinte » si elle est bien formée), ou `null` : aucune pastille.
 * Une partie `RAL NNNN` de « Teinte » prend la teinte de ral.json avec le MOTIF DE SA NUANCE ; les autres gardent leur nuance.
 * « Teinte » est ignorée en entier si son nombre de parties diffère de « Pastille », si une partie n'est ni `RAL NNNN` ni un nom de nuance,
 * si un code est absent de ral.json, ou si un RAL est posé sur Multicolore / Non précisé.
 */
function partsOf(pastille: string | null | undefined, teinte?: string | null): Part[] | null {
  if (typeof pastille !== "string" || pastille === "") return null;
  const names = pastille.split(BICOLORE_SEPARATOR);
  if (names.length > 2) return null;
  const base = names.map(nuancePart);
  if (base.some((part) => part === null)) return null;
  const parts = base as Part[];
  if (typeof teinte !== "string" || teinte === "") return parts;
  const fine = teinte.split(BICOLORE_SEPARATOR);
  if (fine.length !== parts.length) return parts;
  const refined = fine.map((text, i) => {
    const code = /^RAL (\d{4})$/.exec(text)?.[1];
    if (code === undefined) return nuancePart(text) === null ? null : parts[i]!;
    const hex = RAL_TEINTES[code];
    const nuance = parts[i]!;
    return hex === undefined || nuance.hex === null || nuance.motif === "neutral" ? null : { hex, motif: nuance.motif };
  });
  return refined.some((part) => part === null) ? parts : (refined as Part[]);
}

const image = (part: Part): string => (part.hex === null ? RAINBOW : paint(part.hex, part.motif === "rainbow" || part.motif === "neutral" ? "uni" : part.motif));

/**
 * Le style CSS de la pastille d'une valeur de « Pastille » (avec sa « Teinte » fine si elle est bien formée), ou `null` : alors aucune pastille.
 * « A / B » = deux moitiés, A puis B ; si l'une des deux parties est inconnue, aucune pastille (jamais une moitié devinée). Aucun visuel « bicolore » générique.
 */
export function pastilleStyle(value: string | null | undefined, teinte?: string | null): CSSProperties | null {
  const parts = partsOf(value, teinte);
  if (parts === null) return null;
  if (parts.length === 1) return { backgroundImage: image(parts[0]!) };
  return { backgroundImage: `${image(parts[0]!)}, ${image(parts[1]!)}`, backgroundSize: "50% 100%, 50% 100%", backgroundPosition: "left top, right top", backgroundRepeat: "no-repeat" };
}

function lab(hex: string): [number, number, number] {
  const [r, g, b] = channels(hex).map((c) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }) as [number, number, number];
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const x = f((0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047);
  const y = f(0.2126729 * r + 0.7151522 * g + 0.072175 * b);
  const z = f((0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

/** ΔE CIELAB 1976 entre deux teintes `#rrggbb`. */
export function deltaE76(a: string, b: string): number {
  const [l1, a1, b1] = lab(a);
  const [l2, a2, b2] = lab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

/** Le motif DESSINÉ : « Non précisé » (neutral) est un aplat comme « uni » ; l'arc-en-ciel reste à part, comme chaque motif à relief (metal, brosse, galva, bois, transparent). */
const drawnMotif = (part: Part): Part["motif"] => (part.motif === "neutral" ? "uni" : part.motif);

function indiscernible(x: Part[], y: Part[]): boolean {
  return x.length === y.length && x.every((p, i) => drawnMotif(p) === drawnMotif(y[i]!) && (p.hex === null || y[i]!.hex === null ? p.hex === y[i]!.hex : deltaE76(p.hex, y[i]!.hex) < INDISCERNIBLE_DELTA_E));
}

/**
 * Règle de sûreté du sélecteur : deux valeurs d'axe DIFFÉRENTES ne s'affichent jamais sous deux pastilles que l'œil ne sépare pas sans rien d'autre.
 * La clé de comparaison est le RENDU FINAL (« Pastille », avec « Teinte » si elle existe), partie par partie : même motif et ΔE < INDISCERNIBLE_DELTA_E.
 * Rend les valeurs qui gardent leur nom à côté de leur pastille : celles indiscernables d'une autre valeur de l'axe, et « Non précisé » (pastille neutre), toujours.
 * Une valeur sans pastille dessinée n'est jamais concernée (elle garde le rendu texte).
 */
export function namedValues(
  items: readonly { variant_axes: Record<string, string>; pastille?: string | undefined; teinte?: string | undefined }[],
  axis: string,
  values: readonly string[],
): Set<string> {
  const drawn = [...new Set(values)].flatMap((value) => {
    const carrier = items.find((i) => i.variant_axes[axis] === value);
    const parts = partsOf(carrier?.pastille, carrier?.teinte);
    return parts === null ? [] : [{ value, parts, plain: carrier?.pastille === NON_PRECISE }];
  });
  return new Set(drawn.filter((d) => d.plain || drawn.some((o) => o.value !== d.value && indiscernible(d.parts, o.parts))).map((d) => d.value));
}

/** Axe qui porte le coloris du produit (clé ou libellé) : où dessiner la pastille dans le sélecteur de variantes. Ne devine aucune teinte. */
export function isColorAxis(axisKey: string, label: string): boolean {
  return [axisKey, label].some((value) => /(?:^| )(?:couleur|coloris|color)/.test(value.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim()));
}
