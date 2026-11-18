import { fold } from "./folding.ts";

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

/**
 * Nuancier élargi (cercle 4, ligne 4.27) : noms courants avec leurs féminins, finitions métal et bois. Les 40 noms ci-dessus restent tels quels.
 * Les noms se cherchent sur la clé de pli (`fold`, règle site_filters.v1 §1), pliés de la même façon que la valeur : « Noires » trouve « noire ».
 */
export const EXTRA_SWATCH_KEYWORDS: readonly (readonly [string, string])[] = [
  // féminins et variantes d'écriture des noms de base
  ["blanche", "#f5f5f5"], ["noire", "#1a1a1a"], ["verte", "#1a5c3a"], ["bleue", "#1a4080"], ["grise", "#606060"],
  ["brune", "#6b3a2a"], ["doree", "#c8a850"], ["argente", "#c0c0c0"], ["argentee", "#c0c0c0"], ["violette", "#6a3d8f"],
  // teintes courantes
  ["taupe", "#8b7d6b"], ["brun", "#6b3a2a"], ["creme", "#f3ead0"], ["ivoire", "#efe9d6"], ["sable", "#d8c39a"],
  ["turquoise", "#2bb3b1"], ["violet", "#6a3d8f"], ["terracotta", "#c1654a"], ["dore", "#c8a850"], ["platine", "#d6d6d2"],
  ["bleu marine", "#14284b"], ["bleu ciel", "#8ec5e8"], ["vert olive", "#6b6b2e"], ["gris perle", "#b8b8b4"],
  // finitions métal
  ["inox", "#b4b8ba"], ["galvanise", "#a7adb0"], ["galva", "#a7adb0"], ["aluminium", "#c4c8ca"], ["alu", "#c4c8ca"], ["zingue", "#aeb3b5"],
  ["laiton", "#b5a642"], ["bronze", "#8c6a3f"], ["cuivre", "#b87333"],
  // bois
  ["chene", "#b58a52"], ["hetre", "#c89b6a"], ["pin", "#d4a96a"], ["teck", "#9c6b3c"], ["noyer", "#5b3a29"], ["bambou", "#c9b27a"], ["bois", "#a97c50"],
];

function ralTable(text: string): Record<string, string> {
  const tokens = text.trim().split(/\s+/);
  const out: Record<string, string> = {};
  for (let i = 0; i < tokens.length; i += 2) out[tokens[i]!] = `#${tokens[i + 1]!.toLowerCase()}`;
  return out;
}

/** RAL classique : les codes que `RAL_SWATCHES` ne porte pas déjà (les dix premiers gardent leur teinte). Teintes d'affichage, pas de nuancier d'imprimeur. */
export const RAL_CLASSIC: Readonly<Record<string, string>> = ralTable(
  `1000 BEBD7F 1001 C2B078 1002 C6A664 1003 E5BE01 1004 CDA434 1005 A98307 1006 E4A010 1007 DC9D00 1011 8A6642 1012 C7B446 1013 EAE6CA 1014 E1CC4F 1015 E6D690 1016 EDFF21 1017 F5D033 1018 F8F32B 1019 9E9764 1020 999950 1023 FAD201 1024 AEA04B 1026 FFFF00 1027 9D9101 1028 F4A900 1032 D6AE01 1033 F3A505 1034 EFA94A 1035 6A5D4D 1036 705335 1037 F39F18
2000 ED760E 2001 C93C20 2002 CB2821 2003 FF7514 2004 F44611 2005 FF2301 2007 FFA420 2008 F75E25 2009 F54021 2010 D84B20 2011 EC7C26 2012 E55137 2013 C35831
3001 A52019 3002 A2231D 3003 9B111E 3004 75151E 3005 5E2129 3007 412227 3009 642424 3011 781F19 3012 C1876B 3013 A12312 3014 D36E70 3015 EA899A 3016 B32821 3017 E63244 3018 D53032 3020 CC0605 3022 D95030 3024 F80000 3026 FE0000 3027 C51D34 3028 CB3234 3031 B32428 3032 721422 3033 B44C43
4001 6D3F5B 4002 922B3E 4003 DE4C8A 4004 641C34 4005 6C4675 4006 A03472 4007 4A192C 4008 924E7D 4009 A18594 4010 CF3476 4011 8673A1 4012 6C6874
5000 354D73 5001 1F3438 5002 20214F 5003 1D1E33 5004 18171C 5005 1E2460 5007 3E5F8A 5008 26252D 5009 025669 5011 1A2B3C 5012 3B83BD 5013 1E213D 5014 606E8C 5015 2271B3 5017 063971 5018 3F888F 5019 1B5583 5020 1D334A 5021 256D7B 5022 252850 5023 49678D 5024 5D9B9B 5025 2A6478 5026 102C54
6000 316650 6001 287233 6002 2D572C 6003 424632 6004 1F3A3D 6006 3E3B32 6007 283424 6008 332F2C 6009 31372B 6010 35682D 6011 587246 6012 343B29 6013 6C7156 6014 474135 6015 3D3D36 6016 00694C 6017 587F40 6018 61993B 6019 B9CEAC 6020 37422F 6021 8A9977 6022 3A3327 6024 008351 6025 5E6E3B 6026 005F4E 6027 7EBAB5 6028 315442 6029 006F3D 6032 237F52 6033 46877F 6034 7AADAC 6035 194D25 6036 04574B 6037 008B29 6038 00B51A
7000 78858B 7001 8A9597 7002 7E7B52 7003 6C7059 7004 969992 7005 646B63 7006 6D6552 7008 6A5F31 7009 4D5645 7010 4C514A 7011 434B4D 7012 4E5754 7013 464531 7015 434750 7021 2E3234 7022 4B4D46 7023 818479 7024 474A51 7026 374447 7030 939388 7031 5D6970 7032 B9B9A8 7033 7D8471 7034 8F8B66 7036 7D7F7D 7037 7A7B7A 7038 B0B0A9 7039 6B665E 7040 9DA3A6 7042 8F9695 7043 4E5452 7044 CAC4B0 7045 909090 7046 82898E 7047 D0D0D0 7048 898176
8000 826C34 8001 955F20 8002 6C3B2A 8003 734222 8004 8E402A 8007 59351F 8008 6F4F28 8011 5B3A29 8012 592321 8014 382C1E 8015 633A34 8016 4C2F27 8019 403A3A 8022 212121 8023 A65E2F 8024 79553C 8025 755C48 8028 4E3B31 8029 763C28
9001 FDF4E3 9002 E7EBDA 9003 F4F4F4 9004 282828 9006 A5A5A5 9007 8F8F8F 9011 1C1C1C 9017 1E1E1E 9018 CFD3CD 9022 9C9C9C 9023 828282`
);

export function normalizeColorName(raw: string): string {
  return raw.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

const FOLDED_KEYWORDS: readonly (readonly [string, string])[] = [...SWATCH_KEYWORDS, ...EXTRA_SWATCH_KEYWORDS].map(([name, color]) => [fold(name), color]);

/** La teinte d'UNE couleur (sans « A/B » ni « A et B ») : un code RAL d'abord, puis le nom le plus long, à longueur égale le premier. */
function hueOf(raw: string): string | null {
  const key = fold(raw);
  const words = normalizeColorName(raw).split(" "); // le code RAL se lit sans le pli : « RAL 7016x » n'est pas un code
  for (let position = 0; position < words.length - 1; position++) {
    const code = words[position + 1]!;
    if (words[position] === "ral" && /^\d{4}$/.test(code)) {
      const color = RAL_SWATCHES[code] ?? RAL_CLASSIC[code];
      if (color !== undefined) return color;
    }
  }

  // Les espaces sentinelles imposent les frontières et la contiguïté des mots.
  const padded = ` ${key} `;
  let color: string | null = null;
  let longest = 0;
  let firstPosition = Infinity;
  for (const [keyword, swatch] of FOLDED_KEYWORDS) {
    const position = padded.indexOf(` ${keyword} `);
    if (position !== -1 && (keyword.length > longest || (keyword.length === longest && position < firstPosition))) {
      color = swatch;
      longest = keyword.length;
      firstPosition = position;
    }
  }
  return color;
}

/**
 * La teinte d'un coloris, ou `null` : alors la valeur reste écrite, jamais une teinte devinée (« 7016 » sans « RAL », « standard », « transparent »,
 * « Non précisée », « selon nuancier »). Bicolore (« A/B » ou « A et B ») : une couleur CSS en dégradé net à moitié-moitié quand les DEUX parties ont une
 * teinte, sinon `null`. Fonction pure : la couverture sur les valeurs réelles se mesure hors du dépôt.
 */
export function swatchFor(raw: string): string | null {
  const parts = raw.split(/\s*\/\s*|\s+et\s+/i).filter((part) => part.trim() !== "");
  if (parts.length === 0) return null;
  if (parts.length === 1) return hueOf(parts[0]!);
  if (parts.length > 2) return null;
  const [a, b] = [hueOf(parts[0]!), hueOf(parts[1]!)];
  if (a === null || b === null) return null;
  return a === b ? a : `linear-gradient(90deg, ${a} 50%, ${b} 50%)`;
}

/** Le style d'une pastille : aplat, ou dégradé net pour un bicolore. */
export function swatchStyle(color: string): { backgroundColor: string } | { backgroundImage: string } {
  return color.startsWith("linear-gradient") ? { backgroundImage: color } : { backgroundColor: color };
}

export function isColorAxis(axisKey: string, label: string): boolean {
  return [axisKey, label].some((value) => /(?:^| )(?:couleur|coloris|color)/.test(normalizeColorName(value)));
}
