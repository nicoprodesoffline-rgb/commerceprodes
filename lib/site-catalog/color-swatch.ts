/** Nuancier générique public : 35 noms de base, puis 5 expressions supplémentaires. */
export const SWATCH_KEYWORDS: readonly (readonly [string, string])[] = [
  ["blanc", "#f5f5f5"],
  ["white", "#f5f5f5"],
  ["noir", "#1a1a1a"],
  ["black", "#1a1a1a"],
  ["rouge", "#cc0000"],
  ["red", "#cc0000"],
  ["bleu fonce", "#1a4080"],
  ["bleu pastel", "#7bb8d4"],
  ["bleu", "#1a4080"],
  ["blue", "#1a4080"],
  ["bordeaux", "#5e1a1a"],
  ["vert fonce", "#1a5c3a"],
  ["vert pastel", "#7bc47e"],
  ["vert", "#1a5c3a"],
  ["green", "#1a5c3a"],
  ["gris soie", "#a0a09a"],
  ["gris ardoise", "#606060"],
  ["gris", "#606060"],
  ["grey", "#606060"],
  ["gray", "#606060"],
  ["jaune", "#f5c400"],
  ["yellow", "#f5c400"],
  ["marron", "#6b3a2a"],
  ["brown", "#6b3a2a"],
  ["magenta", "#cc3399"],
  ["rose", "#e8a0b4"],
  ["saumon", "#f2937a"],
  ["beige", "#d4b896"],
  ["anthracite", "#3a3a3a"],
  ["chrome", "#c0c0c0"],
  ["argent", "#c0c0c0"],
  ["silver", "#c0c0c0"],
  ["or", "#c8a850"],
  ["gold", "#c8a850"],
  ["orange", "#e07820"],
  // 5 ajouts génériques, distincts du compte des 35 noms de base.
  ["gris anthracite", "#3a3a3a"],
  ["gris clair", "#c8c8c4"],
  ["bleu gentiane", "#1f3a93"],
  ["vert mousse", "#2f5233"],
  ["blanc pur", "#f4f4f0"],
];

/** Dix codes RAL publics courants ; un code absent ne reçoit aucune teinte implicite. */
export const RAL_SWATCHES: Readonly<Record<string, string>> = {
  "1021": "#f3b400",
  "3000": "#a72920",
  "5010": "#0e4c92",
  "6005": "#2f4538",
  "7016": "#293133",
  "7035": "#cbd0cc",
  "8017": "#45322e",
  "9005": "#0e0e10",
  "9010": "#f4f4f4",
  "9016": "#f6f6f6",
};

export function normalizeColorName(raw: string): string {
  return raw.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export function swatchFor(raw: string): string | null {
  const normalized = normalizeColorName(raw);
  const words = normalized.split(" ");
  for (let position = 0; position < words.length - 1; position++) {
    const code = words[position + 1]!;
    if (words[position] === "ral" && /^\d{4}$/.test(code)) {
      const color = RAL_SWATCHES[code];
      if (color !== undefined) return color;
    }
  }

  // Les espaces sentinelles imposent les frontières et la contiguïté des mots.
  const padded = ` ${normalized} `;
  let color: string | null = null;
  let longest = 0;
  let firstPosition = Infinity;
  for (const [keyword, swatch] of SWATCH_KEYWORDS) {
    const position = padded.indexOf(` ${keyword} `);
    if (position !== -1 && (keyword.length > longest || (keyword.length === longest && position < firstPosition))) {
      color = swatch;
      longest = keyword.length;
      firstPosition = position;
    }
  }
  return color;
}

export function isColorAxis(axisKey: string, label: string): boolean {
  return [axisKey, label].some((value) => /(?:^| )(?:couleur|coloris|color)/.test(normalizeColorName(value)));
}
