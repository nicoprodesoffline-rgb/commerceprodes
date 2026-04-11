export type FamilySuggestStrategy =
  | "auto"
  | "parent_sku"
  | "sku_root"
  | "title_root";

export interface ProductLite {
  id: string;
  name: string;
  sku: string | null;
  parent_sku: string | null;
  status: string;
}

export interface FamilySuggestion {
  parent: { id: string; name: string; sku: string | null };
  children: Array<{ id: string; name: string; sku: string | null }>;
  strategy: Exclude<FamilySuggestStrategy, "auto">;
  score: number;
  reasons: string[];
}

const NOISE_WORDS = new Set([
  "avec",
  "sans",
  "version",
  "coloris",
  "couleur",
  "lot",
  "lots",
  "pack",
  "packs",
  "blanc",
  "bleu",
  "noir",
  "gris",
  "anthracite",
  "marron",
  "vert",
  "rouge",
  "jaune",
  "orange",
  "beige",
  "ral",
  "cm",
  "mm",
  "m",
  "kg",
  "l",
  "places",
  "place",
]);

function normalizeBase(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[–—]/g, "-")
    .replace(/[^a-z0-9\-()\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTitleRoot(name: string): string {
  let s = normalizeBase(name);
  s = s.replace(/\([^)]*\)/g, " ");

  // Keep head part first, which usually carries the family name in this catalog.
  const dashParts = s.split(" - ");
  if ((dashParts[0] ?? "").trim().length >= 10) {
    s = dashParts[0]!;
  }

  // Remove common dimension/volume tokens.
  s = s
    .replace(
      /\b\d+(?:[.,]\d+)?\s?(?:x\s?\d+(?:[.,]\d+)?\s?)*(?:cm|mm|m|kg|l|cl)\b/g,
      " ",
    )
    .replace(/\b\d+(?:[.,]\d+)?\s?(?:places?|flux)\b/g, " ");

  const tokens = s
    .split(/\s+/)
    .filter(
      (t) => t && !NOISE_WORDS.has(t) && !/^\d+$/.test(t) && t.length >= 2,
    );

  return tokens.join(" ").trim();
}

function normalizeSkuRoot(sku: string): string | null {
  const normalized = sku.toUpperCase().replace(/\s+/g, "").trim();
  if (!normalized) return null;

  const parts = normalized.split("-").filter(Boolean);
  if (parts.length >= 2) {
    const root = parts.slice(0, -1).join("-");
    return root.length >= 3 ? root : null;
  }

  // Fallback for SKUs without hyphen: remove trailing short suffix/digits.
  const compact = normalized.replace(/[^A-Z0-9]/g, "");
  const fallback = compact.replace(/(?:[A-Z]{1,3}|\d{1,3})$/, "");
  if (fallback.length >= 4) return fallback;
  return null;
}

function toLite(product: ProductLite) {
  return { id: product.id, name: product.name, sku: product.sku };
}

function pickParentFromGroup(
  members: ProductLite[],
  strategy: Exclude<FamilySuggestStrategy, "auto">,
  rootValue?: string,
): ProductLite {
  const sorted = [...members].sort((a, b) => {
    const scoreA = scoreParentCandidate(a, strategy, rootValue);
    const scoreB = scoreParentCandidate(b, strategy, rootValue);
    if (scoreA !== scoreB) return scoreA - scoreB;
    return a.name.length - b.name.length;
  });
  return sorted[0]!;
}

function scoreParentCandidate(
  p: ProductLite,
  strategy: Exclude<FamilySuggestStrategy, "auto">,
  rootValue?: string,
): number {
  let score = 0;
  const sku = (p.sku ?? "").toUpperCase();
  if (strategy === "sku_root" && rootValue && sku === rootValue) score -= 30;
  if (strategy === "parent_sku") score -= 20;
  score += sku.length;
  score += p.name.length / 3;
  return score;
}

function dedupeAndRank(
  suggestions: FamilySuggestion[],
  limit: number,
): FamilySuggestion[] {
  const sorted = [...suggestions].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.children.length - a.children.length;
  });

  const unique: FamilySuggestion[] = [];
  const seenKeys = new Set<string>();
  const usedChildren = new Set<string>();

  for (const suggestion of sorted) {
    const children = suggestion.children.filter(
      (c) => c.id !== suggestion.parent.id && !usedChildren.has(c.id),
    );
    if (children.length === 0) continue;
    const key = `${suggestion.parent.id}::${children
      .map((c) => c.id)
      .sort()
      .join(",")}`;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    children.forEach((c) => usedChildren.add(c.id));
    unique.push({ ...suggestion, children });
    if (unique.length >= limit) break;
  }

  return unique;
}

function buildParentSkuSuggestions(
  products: ProductLite[],
  excludedChildren: Set<string>,
): FamilySuggestion[] {
  const bySku = new Map<string, ProductLite>();
  for (const p of products) {
    if (p.sku) bySku.set(p.sku.toUpperCase(), p);
  }

  const groups = new Map<string, ProductLite[]>();
  for (const p of products) {
    if (!p.parent_sku || excludedChildren.has(p.id)) continue;
    const key = p.parent_sku.toUpperCase().trim();
    if (!key) continue;
    const arr = groups.get(key) ?? [];
    arr.push(p);
    groups.set(key, arr);
  }

  const suggestions: FamilySuggestion[] = [];
  for (const [parentSku, members] of groups.entries()) {
    if (members.length === 0) continue;
    const parent = bySku.get(parentSku);
    if (!parent) continue;
    const children = members.filter((m) => m.id !== parent.id);
    if (children.length === 0) continue;
    suggestions.push({
      parent: toLite(parent),
      children: children.map(toLite),
      strategy: "parent_sku",
      score: Math.min(100, 90 + children.length * 2),
      reasons: [`parent_sku=${parentSku}`],
    });
  }
  return suggestions;
}

function buildSkuRootSuggestions(
  products: ProductLite[],
  excludedChildren: Set<string>,
): FamilySuggestion[] {
  const groups = new Map<string, ProductLite[]>();
  for (const p of products) {
    if (!p.sku || excludedChildren.has(p.id)) continue;
    const root = normalizeSkuRoot(p.sku);
    if (!root) continue;
    const arr = groups.get(root) ?? [];
    arr.push(p);
    groups.set(root, arr);
  }

  const suggestions: FamilySuggestion[] = [];
  for (const [root, members] of groups.entries()) {
    if (members.length < 2) continue;
    const parent = pickParentFromGroup(members, "sku_root", root);
    const children = members.filter((m) => m.id !== parent.id);
    if (children.length === 0) continue;
    suggestions.push({
      parent: toLite(parent),
      children: children.map(toLite),
      strategy: "sku_root",
      score: Math.min(90, 68 + children.length * 4),
      reasons: [`sku_root=${root}`],
    });
  }
  return suggestions;
}

function buildTitleRootSuggestions(
  products: ProductLite[],
  excludedChildren: Set<string>,
): FamilySuggestion[] {
  const groups = new Map<string, ProductLite[]>();
  for (const p of products) {
    if (excludedChildren.has(p.id)) continue;
    const root = normalizeTitleRoot(p.name);
    if (root.length < 10) continue;
    const arr = groups.get(root) ?? [];
    arr.push(p);
    groups.set(root, arr);
  }

  const suggestions: FamilySuggestion[] = [];
  for (const [root, members] of groups.entries()) {
    if (members.length < 2) continue;
    if (members.length > 24) continue;
    const parent = pickParentFromGroup(members, "title_root", root);
    const children = members.filter((m) => m.id !== parent.id);
    if (children.length === 0) continue;
    suggestions.push({
      parent: toLite(parent),
      children: children.map(toLite),
      strategy: "title_root",
      score: Math.min(80, 60 + children.length * 2),
      reasons: [`title_root=${root.slice(0, 48)}`],
    });
  }
  return suggestions;
}

export function computeFamilySuggestions(
  products: ProductLite[],
  strategy: FamilySuggestStrategy,
  excludedChildren: Set<string>,
  limit: number,
): {
  suggestions: FamilySuggestion[];
  strategy_used: FamilySuggestStrategy;
  breakdown: Record<string, number>;
} {
  const parentSku = buildParentSkuSuggestions(products, excludedChildren);
  const skuRoot = buildSkuRootSuggestions(products, excludedChildren);
  const titleRoot = buildTitleRootSuggestions(products, excludedChildren);

  const breakdown = {
    parent_sku: parentSku.length,
    sku_root: skuRoot.length,
    title_root: titleRoot.length,
  };

  if (strategy === "parent_sku") {
    return {
      suggestions: dedupeAndRank(parentSku, limit),
      strategy_used: strategy,
      breakdown,
    };
  }

  if (strategy === "sku_root") {
    return {
      suggestions: dedupeAndRank(skuRoot, limit),
      strategy_used: strategy,
      breakdown,
    };
  }

  if (strategy === "title_root") {
    return {
      suggestions: dedupeAndRank(titleRoot, limit),
      strategy_used: strategy,
      breakdown,
    };
  }

  // auto: merge all strategies by confidence order.
  const merged = dedupeAndRank([...parentSku, ...skuRoot, ...titleRoot], limit);
  return {
    suggestions: merged,
    strategy_used: "auto",
    breakdown,
  };
}
