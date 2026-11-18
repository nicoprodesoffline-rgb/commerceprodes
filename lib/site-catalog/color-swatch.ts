/**
 * La pastille d'un coloris (cercle 4, ligne 4.27, décision de l'Owner du 18/11) : le SITE ne devine plus aucune teinte.
 * La nuance est attribuée dans la Factory et publiée dans la caractéristique réservée « Pastille » (docs/site_filters_v1.md §4) ;
 * ce fichier ne fait que la DESSINER : teinte et motif d'un nom de la palette, deux moitiés pour « A / B » (dans l'ordre du texte),
 * arc-en-ciel pour « Multicolore », gris neutre pour « Non précisé », rien pour une valeur inconnue ou absente.
 * La table PALETTE est la copie de `fixtures/site_filters_v1/palette.json` (recopié à l'octet de la Factory) ; un test les compare.
 */
import type { CSSProperties } from "react";
import { BICOLORE_SEPARATOR, MULTICOLORE, NON_PRECISE } from "./pastille.ts";

export type Motif = "uni" | "metal" | "brosse" | "galva" | "bois" | "transparent";
/** [nom, teinte, motif] : les nuances de la palette, dans l'ordre du fichier commun. */
export const PALETTE: readonly (readonly [string, string, Motif])[] = [
  ["Blanc", "#f7f7f5", "uni"],
  ["Crème", "#efe2bb", "uni"],
  ["Beige", "#d2b48c", "uni"],
  ["Taupe", "#86735e", "uni"],
  ["Marron", "#6b3e26", "uni"],
  ["Bordeaux", "#6d1a2a", "uni"],
  ["Rouge", "#d0141c", "uni"],
  ["Rose", "#f2a0bd", "uni"],
  ["Fuchsia", "#c2187a", "uni"],
  ["Orange", "#f07c12", "uni"],
  ["Corail", "#f78a6c", "uni"],
  ["Jaune", "#f7d000", "uni"],
  ["Ocre", "#c48a1e", "uni"],
  ["Vert clair", "#8fd16a", "uni"],
  ["Vert", "#2e9a3c", "uni"],
  ["Vert foncé", "#164d2c", "uni"],
  ["Kaki", "#74723a", "uni"],
  ["Turquoise", "#1fb5b0", "uni"],
  ["Bleu clair", "#86c3ec", "uni"],
  ["Bleu", "#1f5fbf", "uni"],
  ["Bleu marine", "#16244a", "uni"],
  ["Violet", "#7b3fa0", "uni"],
  ["Gris clair", "#cfcfcb", "uni"],
  ["Gris", "#8a8a88", "uni"],
  ["Anthracite", "#3c3f42", "uni"],
  ["Noir", "#1a1a1a", "uni"],
  ["Terracotta", "#c2603e", "uni"],
  ["Argent", "#c4c7c9", "metal"],
  ["Or", "#c9a640", "metal"],
  ["Inox", "#a9b0b4", "brosse"],
  ["Galvanisé", "#9aa2a5", "galva"],
  ["Cuivre", "#b8713a", "metal"],
  ["Bronze", "#8a6a3a", "metal"],
  ["Corten", "#8e4a26", "uni"],
  ["Bois clair", "#ddb57e", "bois"],
  ["Bois", "#a8743f", "bois"],
  ["Bois foncé", "#5a3722", "bois"],
  ["Transparent", "#eef4f7", "transparent"],
];

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
const NEUTRAL = "linear-gradient(#d9d9d6, #d9d9d6)";

function layer(name: string): string | null {
  if (name === MULTICOLORE) return RAINBOW;
  if (name === NON_PRECISE) return NEUTRAL;
  const found = BY_NAME.get(name);
  return found === undefined ? null : paint(found.hex, found.motif);
}

/**
 * Le style CSS de la pastille d'une valeur de « Pastille », ou `null` : alors aucune pastille. « A / B » = deux moitiés, A puis B ;
 * si l'une des deux parties est inconnue, aucune pastille (jamais une moitié devinée). Aucun visuel « bicolore » générique.
 */
export function pastilleStyle(value: string | null | undefined): CSSProperties | null {
  if (typeof value !== "string" || value === "") return null;
  const parts = value.split(BICOLORE_SEPARATOR);
  if (parts.length === 1) {
    const image = layer(value);
    return image === null ? null : { backgroundImage: image };
  }
  if (parts.length !== 2) return null;
  const a = layer(parts[0]!);
  const b = layer(parts[1]!);
  if (a === null || b === null) return null;
  return { backgroundImage: `${a}, ${b}`, backgroundSize: "50% 100%, 50% 100%", backgroundPosition: "left top, right top", backgroundRepeat: "no-repeat" };
}

/** Axe qui porte le coloris du produit (clé ou libellé) : où dessiner la pastille dans le sélecteur de variantes. Ne devine aucune teinte. */
export function isColorAxis(axisKey: string, label: string): boolean {
  return [axisKey, label].some((value) => /(?:^| )(?:couleur|coloris|color)/.test(value.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim()));
}
