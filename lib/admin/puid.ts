import type { SupabaseClient } from "@supabase/supabase-js";

export type PuidScope = "all" | "latest_import";

export interface PuidProductRow {
  id: string;
  name: string;
  sku: string | null;
  parent_sku: string | null;
  supplier_code: string | null;
  supplier_ref: string | null;
  family_role: string | null;
  parent_family_id: string | null;
  regular_price: number | null;
  status: string | null;
  updated_at: string | null;
}

export interface PuidVariantAttr {
  attribute_id: string;
  attribute_slug: string | null;
  attribute_name: string | null;
  term_slug: string;
  term_name: string | null;
}

export interface PuidVariantRow {
  id: string;
  product_id: string;
  sku: string | null;
  name: string;
  regular_price: number | null;
  status: string | null;
  attrs: PuidVariantAttr[];
}

interface PuidRuleRow {
  product_id: string | null;
  family_id: string | null;
  attribute_id: string;
  impacts_price: boolean;
  active: boolean;
}

export interface PuidPlanInput {
  products: PuidProductRow[];
  variants: PuidVariantRow[];
  rules: PuidRuleRow[];
  includeOnlyPublished?: boolean;
}

export interface PuidSuggestion {
  id: string;
  level: "product" | "variant";
  product_id: string;
  source_sku: string | null;
  suggested_puid: string;
  puid_root: string;
  price_branch: string | null;
  style_branch: string | null;
  supplier_code: string;
  model_code: string;
  reasons: string[];
  lot_candidate: boolean;
  confidence: number;
}

export interface PuidBranchSummary {
  product_id: string;
  product_name: string;
  puid_root: string;
  branches: Array<{
    price_branch: string;
    count: number;
    style_examples: string[];
    samples: string[];
  }>;
}

export interface PuidPlan {
  scope: {
    total_products: number;
    total_variants: number;
    total_suggestions: number;
    collisions: number;
    lot_candidates: number;
  };
  product_suggestions: PuidSuggestion[];
  variant_suggestions: PuidSuggestion[];
  branches: PuidBranchSummary[];
  collisions: Array<{
    level: "product" | "variant";
    suggested_puid: string;
    ids: string[];
  }>;
}

const NOISE_WORDS = new Set([
  "CHAISE",
  "CHAISES",
  "TABLE",
  "TABLES",
  "BANC",
  "BANCS",
  "PRODUIT",
  "GAMME",
  "LOT",
  "LOTS",
  "PROMO",
  "PROMOTION",
  "AVEC",
  "SANS",
  "VERSION",
  "MODELE",
  "MODELE",
  "COLORIS",
  "COULEUR",
  "STRUCTURE",
  "PIETEMENT",
  "PIETEMENTS",
  "PIED",
  "PIEDS",
  "NORME",
  "DIMENSION",
  "DIMENSIONS",
  "ET",
  "DE",
  "DU",
  "DES",
  "LA",
  "LE",
  "LES",
  "UN",
  "UNE",
  "A",
  "AU",
  "AUX",
]);

const COLOR_CODES: Record<string, string> = {
  BLANC: "BLAN",
  BLEU: "BLEU",
  NOIR: "NOIR",
  ROUGE: "ROUG",
  VERT: "VERT",
  GRIS: "GRIS",
  JAUNE: "JAUN",
  ORANGE: "ORAN",
  BEIGE: "BEIG",
  ANTHRACITE: "ANTR",
  MARRON: "MARR",
  CHROME: "CHRO",
  BOIS: "BOIS",
};

const LOT_PATTERNS = [
  /\blot\b/i,
  /\bpar\s+lot\b/i,
  /\b[0-9]+\s*achete/i,
  /\b[0-9]+\s*achet[ée]s?/i,
  /\boffert/i,
  /\bgratuits?/i,
  /\ba\s*l[’']?unite\b/i,
  /\bà\s*l[’']?unite\b/i,
  /\bpack\b/i,
];

const PUID_PREFIX = "P";

function asciiUpper(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function cleanToken(input: string): string {
  return asciiUpper(input)
    .replace(/[^A-Z0-9]+/g, "")
    .trim();
}

function normalizeText(input: string): string {
  return asciiUpper(input)
    .replace(/[–—]/g, "-")
    .replace(/[^A-Z0-9.\-\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleTokens(name: string): string[] {
  return normalizeText(name)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token && token.length >= 2 && !NOISE_WORDS.has(token));
}

function detectLotCandidate(name: string, sku: string | null): boolean {
  const haystack = `${name} ${sku ?? ""}`;
  return LOT_PATTERNS.some((pattern) => pattern.test(haystack));
}

function supplierCodeFromProduct(product: PuidProductRow): string {
  const explicit = cleanToken(String(product.supplier_code || ""));
  if (explicit) return explicit.slice(0, 3);

  const sku = normalizeText(String(product.sku || product.parent_sku || ""));
  const skuHead = sku.split(/[.-]/)[0] || "";
  const alpha = skuHead.replace(/[^A-Z]/g, "");
  if (alpha.length >= 3) return alpha.slice(0, 3);
  if (alpha.length > 0) return alpha.padEnd(3, "X");

  const refAlpha = cleanToken(String(product.supplier_ref || "")).replace(
    /[^A-Z]/g,
    "",
  );
  if (refAlpha.length >= 3) return refAlpha.slice(0, 3);

  return "GEN";
}

function modelCodeFromSkuLike(value: string): string | null {
  const normalized = normalizeText(value);
  if (!normalized) return null;
  const beforeDot = normalized.split(".")[0] || "";
  const parts = beforeDot
    .split("-")
    .map((part) => cleanToken(part))
    .filter(Boolean);

  if (parts.length === 0) return null;

  const candidate = parts.find(
    (part) => /[A-Z]/.test(part) && /\d/.test(part) && part.length >= 5,
  );
  if (candidate) return candidate;

  const fallback = parts.find((part) => /[A-Z]/.test(part) && part.length >= 4);
  if (fallback) return fallback;

  return parts[0] ?? null;
}

function modelCodeFromName(name: string): string {
  const tokens = titleTokens(name);
  if (tokens.length === 0) return "MODEL";

  const [a = "", b = "", c = ""] = tokens;
  const compact = `${a.slice(0, 3)}${b.slice(0, 2)}${c.slice(0, 1)}`;
  const cleaned = cleanToken(compact);
  if (cleaned.length >= 4) return cleaned.slice(0, 8);

  const fallback = cleanToken(tokens.join("").slice(0, 8));
  return fallback || "MODEL";
}

function resolveModelCode(product: PuidProductRow): {
  model: string;
  reason: string;
} {
  const fromParent = modelCodeFromSkuLike(String(product.parent_sku || ""));
  if (fromParent) return { model: fromParent, reason: "parent_sku" };

  const fromSku = modelCodeFromSkuLike(String(product.sku || ""));
  if (fromSku) return { model: fromSku, reason: "sku" };

  return { model: modelCodeFromName(product.name), reason: "name" };
}

function encodeDimension(raw: string): string | null {
  const value = normalizeText(raw);
  const xy = value.match(/(\d{1,3})(?:[,.]\d+)?\s*[X]\s*(\d{1,3})(?:[,.]\d+)?/);
  if (xy) return `${xy[1]}X${xy[2]}`;

  const diam = value.match(/(?:DIAM|DIAMETRE|Ø|DIA)\s*(\d{1,3})/);
  if (diam) return `D${diam[1]}`;

  const plain = value.match(/\b(\d{2,3})\b/);
  if (plain) return `D${plain[1]}`;
  return null;
}

function encodeOption(raw: string): string | null {
  const value = normalizeText(raw);
  if (/SANS\s+ACCROCH/.test(value)) return "SA";
  if (/AVEC\s+ACCROCH/.test(value)) return "AA";
  if (/NON\s+ASSEMBL|SANS\s+ASSEMBL/.test(value)) return "NA";
  if (/ASSEMBL/.test(value)) return "AS";
  if (/SANS/.test(value)) return "SN";
  if (/AVEC/.test(value)) return "AV";
  return null;
}

function encodeNorm(raw: string): string | null {
  const value = normalizeText(raw);
  const m = value.match(/\bM\s*([0-9])\b/);
  if (m) return `M${m[1]}`;
  const n = value.match(/\bNORME\s*([0-9])\b/);
  if (n) return `M${n[1]}`;
  return null;
}

function encodeColor(raw: string): string | null {
  const value = normalizeText(raw).replace(/\s+/g, " ").trim();
  const single = value.split(" ")[0] || value;
  if (COLOR_CODES[single]) return COLOR_CODES[single]!;
  const compact = cleanToken(value);
  if (compact.length >= 4) return compact.slice(0, 4);
  if (compact.length >= 2) return compact;
  return null;
}

function encodeGeneric(raw: string): string {
  const value = normalizeText(raw);
  const compact = cleanToken(value);
  if (compact.length >= 4) return compact.slice(0, 4);
  if (compact.length >= 2) return compact;

  const words = value.split(/\s+/).filter(Boolean);
  const initials = cleanToken(words.map((w) => w[0] || "").join(""));
  return initials.slice(0, 4) || "VAL";
}

function encodeAttributeValue(attr: PuidVariantAttr): string {
  const label = String(attr.term_name || attr.term_slug || "");
  const attrKey = normalizeText(
    String(attr.attribute_slug || attr.attribute_name || ""),
  );

  if (/COLOR|COULEUR|COLORIS|RAL/.test(attrKey))
    return encodeColor(label) || encodeGeneric(label);
  if (/NORM/.test(attrKey)) return encodeNorm(label) || encodeGeneric(label);
  if (/DIM|TAILLE|SIZE|LARGEUR|LONGUEUR|HAUTEUR|DIAM|STRUCTURE/.test(attrKey)) {
    return encodeDimension(label) || encodeGeneric(label);
  }
  if (/OPTION|ASSEMBL|ACCROCH|PIET|PIED|FINIT|REVET|MATIER/.test(attrKey)) {
    return encodeOption(label) || encodeGeneric(label);
  }

  return (
    encodeNorm(label) ||
    encodeDimension(label) ||
    encodeOption(label) ||
    encodeColor(label) ||
    encodeGeneric(label)
  );
}

function uniquePreserve(values: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function chunkList<T>(rows: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) {
    out.push(rows.slice(i, i + size));
  }
  return out;
}

function inferPriceImpactAttrIds(
  product: PuidProductRow,
  variants: PuidVariantRow[],
  explicitRules: Set<string>,
): Set<string> {
  if (explicitRules.size > 0) return explicitRules;

  const byAttr = new Map<string, Map<string, number[]>>();
  for (const variant of variants) {
    const price = Number(variant.regular_price ?? product.regular_price ?? 0);
    if (!Number.isFinite(price) || price <= 0) continue;

    for (const attr of variant.attrs) {
      const attrId = String(attr.attribute_id);
      const term = cleanToken(String(attr.term_slug || attr.term_name || ""));
      if (!attrId || !term) continue;
      const byTerm = byAttr.get(attrId) ?? new Map<string, number[]>();
      const prices = byTerm.get(term) ?? [];
      prices.push(price);
      byTerm.set(term, prices);
      byAttr.set(attrId, byTerm);
    }
  }

  const inferred = new Set<string>();
  for (const [attrId, byTerm] of byAttr.entries()) {
    if (byTerm.size < 2) continue;

    const averages = [...byTerm.values()]
      .map((prices) => {
        const avg =
          prices.reduce((acc, n) => acc + n, 0) / Math.max(1, prices.length);
        return Number(avg.toFixed(2));
      })
      .filter((n) => Number.isFinite(n));

    const distinct = new Set(averages);
    if (distinct.size > 1) {
      inferred.add(attrId);
    }
  }

  return inferred;
}

function ensureUnique(base: string, used: Set<string>): string {
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  let idx = 2;
  while (true) {
    const candidate = `${base}-${idx}`;
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
    idx += 1;
  }
}

export function buildPuidPlan(input: PuidPlanInput): PuidPlan {
  const products = input.includeOnlyPublished
    ? input.products.filter((p) => p.status === "publish")
    : input.products;
  const variants = input.includeOnlyPublished
    ? input.variants.filter((v) => v.status === "publish")
    : input.variants;

  const variantsByProduct = new Map<string, PuidVariantRow[]>();
  for (const variant of variants) {
    const list = variantsByProduct.get(variant.product_id) ?? [];
    list.push(variant);
    variantsByProduct.set(variant.product_id, list);
  }

  const rulesByProduct = new Map<string, Set<string>>();
  const rulesByFamily = new Map<string, Set<string>>();
  for (const rule of input.rules) {
    if (!rule.active || !rule.impacts_price) continue;
    if (rule.product_id) {
      const set = rulesByProduct.get(rule.product_id) ?? new Set<string>();
      set.add(rule.attribute_id);
      rulesByProduct.set(rule.product_id, set);
    }
    if (rule.family_id) {
      const set = rulesByFamily.get(rule.family_id) ?? new Set<string>();
      set.add(rule.attribute_id);
      rulesByFamily.set(rule.family_id, set);
    }
  }

  const productSuggestions: PuidSuggestion[] = [];
  const variantSuggestions: PuidSuggestion[] = [];
  const branchSummaries: PuidBranchSummary[] = [];

  const usedProductPuid = new Set<string>();
  const usedVariantPuid = new Set<string>();

  for (const product of products) {
    const supplier = supplierCodeFromProduct(product);
    const model = resolveModelCode(product);
    const puidRoot = `${PUID_PREFIX}-${supplier}-${model.model}`;
    const productLotCandidate = detectLotCandidate(product.name, product.sku);

    const uniqueRoot = ensureUnique(puidRoot, usedProductPuid);
    productSuggestions.push({
      id: product.id,
      level: "product",
      product_id: product.id,
      source_sku: product.sku,
      suggested_puid: uniqueRoot,
      puid_root: uniqueRoot,
      price_branch: null,
      style_branch: null,
      supplier_code: supplier,
      model_code: model.model,
      reasons: [
        `supplier=${supplier}`,
        `modele=${model.model} (${model.reason})`,
      ],
      lot_candidate: productLotCandidate,
      confidence: model.reason === "name" ? 0.68 : 0.86,
    });

    const children = variantsByProduct.get(product.id) ?? [];
    if (children.length === 0) continue;

    const explicitRules = new Set<string>([
      ...(rulesByProduct.get(product.id) ?? []),
      ...((product.parent_family_id &&
        rulesByFamily.get(product.parent_family_id)) ||
        []),
    ]);
    const priceImpactAttrIds = inferPriceImpactAttrIds(
      product,
      children,
      explicitRules,
    );

    const branchMap = new Map<
      string,
      { count: number; styles: Set<string>; samples: string[] }
    >();

    for (const variant of children) {
      const sortedAttrs = [...variant.attrs].sort((a, b) => {
        const an = String(
          a.attribute_name || a.attribute_slug || a.attribute_id,
        );
        const bn = String(
          b.attribute_name || b.attribute_slug || b.attribute_id,
        );
        return an.localeCompare(bn);
      });

      const priceTokens: string[] = [];
      const styleTokens: string[] = [];

      for (const attr of sortedAttrs) {
        const token = encodeAttributeValue(attr);
        if (!token) continue;
        if (priceImpactAttrIds.has(attr.attribute_id)) {
          priceTokens.push(token);
        } else {
          styleTokens.push(token);
        }
      }

      const normalizedPriceTokens = uniquePreserve(priceTokens);
      const normalizedStyleTokens = uniquePreserve(styleTokens);

      const priceBranch = normalizedPriceTokens.join("-") || "BASE";
      const styleBranch = normalizedStyleTokens.join(".") || null;

      const puidBase = `${uniqueRoot}${priceBranch !== "BASE" ? `-${priceBranch}` : ""}${styleBranch ? `.${styleBranch}` : ""}`;
      const puid = ensureUnique(puidBase, usedVariantPuid);

      const lotCandidate =
        productLotCandidate || detectLotCandidate(variant.name, variant.sku);
      const reasons = [
        `racine=${uniqueRoot}`,
        normalizedPriceTokens.length > 0
          ? `axes_prix=${normalizedPriceTokens.join(",")}`
          : "axes_prix=BASE",
      ];
      if (normalizedStyleTokens.length > 0) {
        reasons.push(`axes_non_prix=${normalizedStyleTokens.join(",")}`);
      }

      variantSuggestions.push({
        id: variant.id,
        level: "variant",
        product_id: product.id,
        source_sku: variant.sku,
        suggested_puid: puid,
        puid_root: uniqueRoot,
        price_branch: priceBranch,
        style_branch: styleBranch,
        supplier_code: supplier,
        model_code: model.model,
        reasons,
        lot_candidate: lotCandidate,
        confidence: explicitRules.size > 0 ? 0.9 : 0.78,
      });

      const branch = branchMap.get(priceBranch) ?? {
        count: 0,
        styles: new Set<string>(),
        samples: [],
      };
      branch.count += 1;
      if (styleBranch) branch.styles.add(styleBranch);
      if (branch.samples.length < 3) branch.samples.push(puid);
      branchMap.set(priceBranch, branch);
    }

    branchSummaries.push({
      product_id: product.id,
      product_name: product.name,
      puid_root: uniqueRoot,
      branches: [...branchMap.entries()].map(([priceBranch, branch]) => ({
        price_branch: priceBranch,
        count: branch.count,
        style_examples: [...branch.styles].slice(0, 6),
        samples: branch.samples,
      })),
    });
  }

  const collisions: PuidPlan["collisions"] = [];

  function collectCollisions(
    level: "product" | "variant",
    rows: PuidSuggestion[],
  ) {
    const map = new Map<string, string[]>();
    for (const row of rows) {
      const ids = map.get(row.suggested_puid) ?? [];
      ids.push(row.id);
      map.set(row.suggested_puid, ids);
    }
    for (const [puid, ids] of map.entries()) {
      if (ids.length > 1) collisions.push({ level, suggested_puid: puid, ids });
    }
  }

  collectCollisions("product", productSuggestions);
  collectCollisions("variant", variantSuggestions);

  return {
    scope: {
      total_products: products.length,
      total_variants: variants.length,
      total_suggestions: productSuggestions.length + variantSuggestions.length,
      collisions: collisions.length,
      lot_candidates:
        productSuggestions.filter((p) => p.lot_candidate).length +
        variantSuggestions.filter((v) => v.lot_candidate).length,
    },
    product_suggestions: productSuggestions,
    variant_suggestions: variantSuggestions,
    branches: branchSummaries,
    collisions,
  };
}

export async function loadPuidInput(
  client: SupabaseClient,
  options: {
    scope: PuidScope;
    sinceIso?: string | null;
    limit: number;
    productIds?: string[];
    includeDraft?: boolean;
  },
): Promise<PuidPlanInput> {
  const {
    scope,
    sinceIso,
    limit,
    productIds = [],
    includeDraft = true,
  } = options;

  let productQuery = client
    .from("products")
    .select(
      "id, name, sku, parent_sku, supplier_code, supplier_ref, family_role, parent_family_id, regular_price, status, updated_at",
    )
    .order("updated_at", { ascending: false })
    .limit(Math.min(3000, Math.max(1, limit)));

  if (!includeDraft) {
    productQuery = productQuery.eq("status", "publish");
  }
  if (scope === "latest_import" && sinceIso) {
    productQuery = productQuery.gte("updated_at", sinceIso);
  }
  if (productIds.length > 0) {
    productQuery = productQuery.in("id", productIds);
  }

  const { data: productData, error: productError } = await productQuery;
  if (productError) throw new Error(productError.message);

  const products: PuidProductRow[] = (productData || []).map((row: any) => ({
    id: String(row.id),
    name: String(row.name || ""),
    sku: row.sku ? String(row.sku) : null,
    parent_sku: row.parent_sku ? String(row.parent_sku) : null,
    supplier_code: row.supplier_code ? String(row.supplier_code) : null,
    supplier_ref: row.supplier_ref ? String(row.supplier_ref) : null,
    family_role: row.family_role ? String(row.family_role) : null,
    parent_family_id: row.parent_family_id
      ? String(row.parent_family_id)
      : null,
    regular_price: row.regular_price != null ? Number(row.regular_price) : null,
    status: row.status ? String(row.status) : null,
    updated_at: row.updated_at ? String(row.updated_at) : null,
  }));

  const productIdsLoaded = products.map((p) => p.id);
  if (productIdsLoaded.length === 0) {
    return { products: [], variants: [], rules: [] };
  }

  const variantData: any[] = [];
  for (const idsChunk of chunkList(productIdsLoaded, 120)) {
    const { data, error } = await client
      .from("variants")
      .select(
        "id, product_id, sku, name, regular_price, status, variant_attributes(attribute_id, term_slug, attributes(slug, name))",
      )
      .in("product_id", idsChunk)
      .order("position", { ascending: true })
      .limit(12000);
    if (error) throw new Error(error.message);
    variantData.push(...(data || []));
  }

  const variants: PuidVariantRow[] = (variantData || []).map((row: any) => ({
    id: String(row.id),
    product_id: String(row.product_id),
    sku: row.sku ? String(row.sku) : null,
    name: String(row.name || ""),
    regular_price: row.regular_price != null ? Number(row.regular_price) : null,
    status: row.status ? String(row.status) : null,
    attrs: (row.variant_attributes || []).map((attr: any) => ({
      attribute_id: String(attr.attribute_id),
      attribute_slug: attr.attributes?.slug
        ? String(attr.attributes.slug)
        : null,
      attribute_name: attr.attributes?.name
        ? String(attr.attributes.name)
        : null,
      term_slug: String(attr.term_slug || ""),
      term_name: null,
    })),
  }));

  const familyIds = uniquePreserve(
    products.map((p) => p.parent_family_id || "").filter(Boolean),
  );

  const rules: PuidRuleRow[] = [];
  const seenRuleKeys = new Set<string>();

  for (const idsChunk of chunkList(productIdsLoaded, 200)) {
    const { data: productRules, error } = await client
      .from("pricing_attribute_rules")
      .select("product_id, family_id, attribute_id, impacts_price, active")
      .eq("active", true)
      .eq("impacts_price", true)
      .in("product_id", idsChunk);
    if (error) {
      return { products, variants, rules: [] };
    }
    for (const row of productRules || []) {
      const normalized: PuidRuleRow = {
        product_id: row.product_id ? String(row.product_id) : null,
        family_id: row.family_id ? String(row.family_id) : null,
        attribute_id: String(row.attribute_id),
        impacts_price: Boolean(row.impacts_price),
        active: Boolean(row.active),
      };
      const key = `${normalized.product_id || ""}::${normalized.family_id || ""}::${normalized.attribute_id}`;
      if (seenRuleKeys.has(key)) continue;
      seenRuleKeys.add(key);
      rules.push(normalized);
    }
  }

  for (const idsChunk of chunkList(familyIds, 200)) {
    const { data: familyRules, error } = await client
      .from("pricing_attribute_rules")
      .select("product_id, family_id, attribute_id, impacts_price, active")
      .eq("active", true)
      .eq("impacts_price", true)
      .in("family_id", idsChunk);
    if (error) {
      return { products, variants, rules: [] };
    }
    for (const row of familyRules || []) {
      const normalized: PuidRuleRow = {
        product_id: row.product_id ? String(row.product_id) : null,
        family_id: row.family_id ? String(row.family_id) : null,
        attribute_id: String(row.attribute_id),
        impacts_price: Boolean(row.impacts_price),
        active: Boolean(row.active),
      };
      const key = `${normalized.product_id || ""}::${normalized.family_id || ""}::${normalized.attribute_id}`;
      if (seenRuleKeys.has(key)) continue;
      seenRuleKeys.add(key);
      rules.push(normalized);
    }
  }

  return { products, variants, rules };
}
