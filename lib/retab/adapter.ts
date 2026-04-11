/**
 * Retab → Supabase Adapter
 *
 * Pure transformation function: takes expanded JSON from expand.py
 * and produces typed objects ready for Supabase insert.
 *
 * Targets the canonical product model (JSONB hybrid):
 * - variants.attributs_prix JSONB
 * - products.axes_prix TEXT[] / axes_style TEXT[]
 * - product_pricing_profiles with price_branch JSONB + base_price_ht
 * - product_lot_offers linked to pricing_profiles
 * - attribute_registry (consultative)
 *
 * Does NOT handle: PUID generation, actual DB inserts, image/SEO enrichment.
 *
 * Ref: docs/CANONICAL_PRODUCT_MODEL.md
 */

// ─── Input types (expand.py output) ─────────────────────────────────────────

export interface RetabExpandedProduct {
  ref: string;
  nom_gamme: string;
  parent_gamme?: string | null;
  categorie_produit?: string | null;
  fournisseur?: string | null;
  description_gamme?: string | null;
  merged_from?: string[] | null;
  axes_prix: string[];
  axes_prix_effectif: string[];
  axes_style: string[];
  axes_style_effectif: string[];
  options_disponibles?: string[];
  variants_count: number;
  by_source_type?: Record<string, number>;
  nom_produit?: string | null;
  _from_subfamilies?: string[] | null;
  _split_by?: string | null;
}

export interface RetabExpandedVariant {
  line_type: string; // 'variante' | 'lot_pricing' | 'option'
  reference: string | null;
  designation: string;
  description?: string | null;
  prix_ht: number | null;
  prix_public_ht?: number | null;
  remise?: number | null;
  prix_net?: number | null;
  eco_contribution?: number | null;
  taille?: string | null;
  dimensions?: string | null;
  poids?: number | null;
  matiere?: string | null;
  coloris_liste?: string[];
  vendu_par?: number | null;
  pcb?: number | null;
  palette_qte?: number | null;
  palier_min?: number | null;
  palier_max?: number | null;
  quantite_lot?: number | null;
  produits_lies?: string | null;
  need_check?: boolean;
  warning_text?: string | null;
  source_row_hint?: string | null;
  categorie_produit?: string | null;
  _ref_base?: string | null;
  _price_attrs?: string[];
  _style_attrs?: string[];
  _finition?: string | null;
  _is_generated?: boolean;
  product_ref: string;
  nom_gamme?: string | null;
  source_type?: string | null;

  // Present in raw extracted format (schema v15+)
  attributs_prix?: Record<string, string | number | null>;
}

/** Raw extracted format (familles/lignes) — richer data when available */
export interface RetabRawFamille {
  nom_gamme: string;
  categorie_produit?: string | null;
  description?: string | null;
  description_gamme?: string | null;
  axes_prix: string[];
  axes_style: string[];
  lignes: RetabRawLigne[];
}

export interface RetabRawLigne {
  line_type: string;
  reference: string | null;
  designation: string;
  description?: string | null;
  attributs_prix?: Record<string, string | number | null>;
  prix_ht: number | null;
  prix_public_ht?: number | null;
  remise?: number | null;
  prix_net?: number | null;
  eco_contribution?: number | null;
  taille?: string | null;
  dimensions?: string | null;
  poids?: number | null;
  matiere?: string | null;
  coloris_liste?: string[];
  vendu_par?: number | null;
  pcb?: number | null;
  palette_qte?: number | null;
  quantite_lot?: number | null;
  need_check?: boolean;
  warning_text?: string | null;
  source_row_hint?: string | null;
}

/** Wrapped format from extract.py: { meta, result: { familles } } */
export interface RetabExtractedWrapper {
  meta?: {
    source_pdf_name?: string;
    schema_name?: string;
    [key: string]: unknown;
  };
  result?: { familles: RetabRawFamille[] };
  familles?: RetabRawFamille[];
  fournisseur?: string;
}

export type RetabInput =
  | { familles: RetabRawFamille[]; fournisseur?: string }
  | { products: RetabExpandedProduct[]; variants: RetabExpandedVariant[] }
  | RetabExtractedWrapper;

// ─── Output types (Supabase inserts) ────────────────────────────────────────

export interface FamilyInsert {
  name: string;
  slug: string;
  supplier_code: string | null;
  category: string | null;
  description: string | null;
  /** Temporary ref for linking — NOT inserted into DB */
  _adapter_ref: string;
}

export interface ProductInsert {
  sku: string;
  name: string;
  slug: string;
  description: string | null;
  type: "simple" | "variable";
  status: "draft" | "publish";
  supplier_code: string | null;
  regular_price: number | null;
  eco_contribution: number | null;
  axes_prix: string[];
  axes_style: string[];
  family_role: "parent" | "standalone";
  category: string | null;
  weight: number | null;
  /** Temporary ref for linking */
  _adapter_ref: string;
  _adapter_family_ref: string;
}

export interface VariantInsert {
  sku: string | null;
  name: string;
  regular_price: number | null;
  eco_contribution: number | null;
  status: "draft" | "publish";
  position: number;
  supplier_code: string | null;
  attributs_prix: Record<string, string | number | null>;
  /** Price-relevant subset of attributs_prix — used for pricing profile matching */
  _price_branch: Record<string, string | number | null>;
  /** Style-relevant subset */
  _style_branch: Record<string, string | number | null>;
  weight: number | null;
  need_check: boolean;
  source_row_hint: string | null;
  /** Temporary refs for linking */
  _adapter_product_ref: string;
}

export interface PricingProfileInsert {
  profile_key: string;
  label: string;
  price_branch: Record<string, string | number | null>;
  base_price_ht: number;
  /** Temporary ref for linking */
  _adapter_product_ref: string;
}

export interface LotOfferInsert {
  mode: "flat" | "degressive";
  label: string;
  /** Degressive fields */
  min_quantity: number | null;
  unit_price_ht: number | null;
  /** Flat fields */
  paid_units: number | null;
  bonus_units: number | null;
  lot_price_ht: number | null;
  /** Temporary refs for linking */
  _adapter_product_ref: string;
  _adapter_profile_key: string;
}

export interface AttributeRegistryInsert {
  slug: string;
  display_name: string;
  data_type: "text" | "numeric" | "enum" | "boolean";
  unit: string | null;
}

export interface AdapterWarning {
  level: "info" | "warn" | "error";
  product_ref: string;
  variant_ref?: string | null;
  message: string;
}

export interface AdapterOutput {
  families: FamilyInsert[];
  products: ProductInsert[];
  variants: VariantInsert[];
  pricing_profiles: PricingProfileInsert[];
  lot_offers: LotOfferInsert[];
  attribute_registry: AttributeRegistryInsert[];
  warnings: AdapterWarning[];
  summary: {
    families_count: number;
    products_count: number;
    variants_count: number;
    pricing_profiles_count: number;
    lot_offers_count: number;
    registry_entries_count: number;
    warnings_count: number;
    by_supplier: Record<string, number>;
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 200);
}

function normalizeAxisKey(key: string): string {
  return key
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function stableJsonKey(obj: Record<string, unknown>): string {
  const sorted = Object.keys(obj)
    .sort()
    .reduce(
      (acc, k) => {
        acc[k] = obj[k];
        return acc;
      },
      {} as Record<string, unknown>,
    );
  return JSON.stringify(sorted);
}

/** Parse a numeric-looking value from a string (e.g. "8 cm" → keep as string, "154.50" → 154.5) */
function cleanScalarValue(val: unknown): string | number | null {
  if (val == null) return null;
  if (typeof val === "number") return val;
  const s = String(val).trim();
  if (!s) return null;
  return s;
}

// ─── Axis name matching heuristics ──────────────────────────────────────────

const AXIS_FIELD_MAP: Array<{
  patterns: RegExp[];
  fields: Array<
    (v: RetabExpandedVariant | RetabRawLigne) => string | number | null
  >;
}> = [
  {
    patterns: [
      /dimension/i,
      /diametre/i,
      /diam/i,
      /taille/i,
      /profondeur/i,
      /longueur/i,
      /largeur/i,
      /hauteur/i,
    ],
    fields: [
      (v) => cleanScalarValue(v.taille) ?? cleanScalarValue(v.dimensions),
    ],
  },
  {
    patterns: [/colori/i, /couleur/i, /color/i, /ral/i],
    fields: [
      (v) => {
        const cl = (v as RetabExpandedVariant).coloris_liste;
        if (cl && cl.length > 0) return cl.join(", ");
        return null;
      },
    ],
  },
  {
    patterns: [/mati[eè]re/i, /materiaux/i],
    fields: [(v) => cleanScalarValue(v.matiere)],
  },
  {
    patterns: [/finit/i, /revet/i, /traitement/i],
    fields: [
      (v) => {
        const ev = v as RetabExpandedVariant;
        return cleanScalarValue(ev._finition) ?? null;
      },
    ],
  },
];

/**
 * Build attributs_prix JSONB from variant fields.
 * Strategy:
 *  1. If the variant already has `attributs_prix` (schema v15 raw) → use directly
 *  2. Otherwise, derive from scalar fields using axis name matching
 */
function buildAttributsJson(
  variant: RetabExpandedVariant | RetabRawLigne,
  product: { axes_prix_effectif: string[]; axes_style_effectif: string[] },
): Record<string, string | number | null> {
  // Path 1: structured attributs_prix from raw extraction (schema v15)
  if (
    variant.attributs_prix &&
    Object.keys(variant.attributs_prix).length > 0
  ) {
    const out: Record<string, string | number | null> = {};
    for (const [k, v] of Object.entries(variant.attributs_prix)) {
      out[normalizeAxisKey(k)] = cleanScalarValue(v);
    }
    return out;
  }

  // Path 2: derive from scalar fields
  const out: Record<string, string | number | null> = {};
  const allAxes = [
    ...product.axes_prix_effectif,
    ...product.axes_style_effectif,
  ];

  for (const axisName of allAxes) {
    const normalized = normalizeAxisKey(axisName);
    let resolved: string | number | null = null;

    // Try matching axis name against known field patterns
    for (const mapping of AXIS_FIELD_MAP) {
      if (
        mapping.patterns.some((p) => p.test(axisName) || p.test(normalized))
      ) {
        for (const fn of mapping.fields) {
          const val = fn(variant);
          if (val != null) {
            resolved = val;
            break;
          }
        }
        break;
      }
    }

    if (resolved != null) {
      out[normalized] = resolved;
    }
  }

  return out;
}

/**
 * Partition attributs_prix into price-relevant and style-relevant subsets.
 */
function partitionAttrs(
  attrs: Record<string, string | number | null>,
  axesPrixEffectif: string[],
  axesStyleEffectif: string[],
): {
  price: Record<string, string | number | null>;
  style: Record<string, string | number | null>;
} {
  const priceKeys = new Set(axesPrixEffectif.map(normalizeAxisKey));
  const styleKeys = new Set(axesStyleEffectif.map(normalizeAxisKey));

  const price: Record<string, string | number | null> = {};
  const style: Record<string, string | number | null> = {};

  for (const [k, v] of Object.entries(attrs)) {
    if (priceKeys.has(k)) {
      price[k] = v;
    } else if (styleKeys.has(k)) {
      style[k] = v;
    } else {
      // Unknown axis — put in price by default (conservative)
      price[k] = v;
    }
  }

  return { price, style };
}

// ─── Format normalization ───────────────────────────────────────────────────

interface NormalizedProduct {
  ref: string;
  nom_gamme: string;
  fournisseur: string | null;
  categorie_produit: string | null;
  description_gamme: string | null;
  axes_prix_effectif: string[];
  axes_style_effectif: string[];
  variants_count: number;
}

interface NormalizedVariant {
  line_type: string;
  reference: string | null;
  designation: string;
  prix_ht: number | null;
  prix_public_ht: number | null;
  eco_contribution: number | null;
  poids: number | null;
  pcb: number | null;
  quantite_lot: number | null;
  need_check: boolean;
  source_row_hint: string | null;
  product_ref: string;
  // Original variant for attributs extraction
  _raw: RetabExpandedVariant | RetabRawLigne;
}

function normalizeFromExpanded(input: {
  products: RetabExpandedProduct[];
  variants: RetabExpandedVariant[];
}): { products: NormalizedProduct[]; variants: NormalizedVariant[] } {
  const products = input.products.map((p) => ({
    ref: p.ref,
    nom_gamme: p.nom_gamme,
    fournisseur: p.fournisseur ?? null,
    categorie_produit: p.categorie_produit ?? null,
    description_gamme: p.description_gamme ?? null,
    axes_prix_effectif: p.axes_prix_effectif ?? p.axes_prix ?? [],
    axes_style_effectif: p.axes_style_effectif ?? p.axes_style ?? [],
    variants_count: p.variants_count,
  }));

  const variants = input.variants.map((v) => ({
    line_type: v.line_type,
    reference: v.reference,
    designation: v.designation,
    prix_ht: v.prix_ht,
    prix_public_ht: v.prix_public_ht ?? null,
    eco_contribution: v.eco_contribution ?? null,
    poids: v.poids ?? null,
    pcb: v.pcb ?? null,
    quantite_lot: v.quantite_lot ?? null,
    need_check: v.need_check ?? false,
    source_row_hint: v.source_row_hint ?? null,
    product_ref: v.product_ref,
    _raw: v,
  }));

  return { products, variants };
}

function normalizeFromRaw(input: {
  familles: RetabRawFamille[];
  fournisseur?: string;
}): { products: NormalizedProduct[]; variants: NormalizedVariant[] } {
  const products: NormalizedProduct[] = [];
  const variants: NormalizedVariant[] = [];

  for (const fam of input.familles) {
    const ref = slugify(
      `${input.fournisseur ?? "UNK"}-${fam.nom_gamme}`,
    ).toUpperCase();

    products.push({
      ref,
      nom_gamme: fam.nom_gamme,
      fournisseur: input.fournisseur ?? null,
      categorie_produit: fam.categorie_produit ?? null,
      description_gamme: fam.description ?? fam.description_gamme ?? null,
      axes_prix_effectif: fam.axes_prix ?? [],
      axes_style_effectif: fam.axes_style ?? [],
      variants_count: fam.lignes.filter((l) => l.line_type === "variante")
        .length,
    });

    let position = 0;
    for (const ligne of fam.lignes) {
      if (ligne.line_type === "famille") continue;
      variants.push({
        line_type: ligne.line_type,
        reference: ligne.reference,
        designation: ligne.designation,
        prix_ht: ligne.prix_ht,
        prix_public_ht: ligne.prix_public_ht ?? null,
        eco_contribution: ligne.eco_contribution ?? null,
        poids: ligne.poids ?? null,
        pcb: ligne.pcb ?? null,
        quantite_lot: ligne.quantite_lot ?? null,
        need_check: ligne.need_check ?? false,
        source_row_hint: ligne.source_row_hint ?? null,
        product_ref: ref,
        _raw: ligne,
      });
      position++;
    }
  }

  return { products, variants };
}

// ─── Main adapter ───────────────────────────────────────────────────────────

/**
 * Unwrap extracted JSON format: { meta, result: { familles } } → { familles, fournisseur }
 * Also accepts direct { familles } format.
 * fournisseur must be passed explicitly (it's not in the extracted JSON).
 */
function unwrapExtracted(input: RetabInput): RetabInput {
  const obj = input as Record<string, unknown>;

  // Already in direct format
  if ("products" in obj && Array.isArray(obj.products)) return input;
  if ("familles" in obj && Array.isArray(obj.familles)) return input;

  // Wrapped format: { meta, result: { familles } }
  if (obj.result && typeof obj.result === "object") {
    const result = obj.result as Record<string, unknown>;
    if (Array.isArray(result.familles)) {
      return {
        familles: result.familles as RetabRawFamille[],
        fournisseur: (obj.fournisseur as string) ?? undefined,
      };
    }
  }

  return input;
}

export function adaptRetabToSupabase(input: RetabInput): AdapterOutput {
  // Unwrap { meta, result } wrapper if present
  const unwrapped = unwrapExtracted(input);

  // Auto-detect format
  const normalized =
    "familles" in unwrapped
      ? normalizeFromRaw(
          unwrapped as { familles: RetabRawFamille[]; fournisseur?: string },
        )
      : normalizeFromExpanded(
          unwrapped as {
            products: RetabExpandedProduct[];
            variants: RetabExpandedVariant[];
          },
        );

  const warnings: AdapterWarning[] = [];
  const families: FamilyInsert[] = [];
  const products: ProductInsert[] = [];
  const allVariants: VariantInsert[] = [];
  const pricingProfiles: PricingProfileInsert[] = [];
  // lot_offers is always empty — supplier lot_pricing ≠ PRODES commercial lot offers
  const lotOffers: LotOfferInsert[] = [];
  const registryMap = new Map<string, AttributeRegistryInsert>();
  const supplierCounts: Record<string, number> = {};

  // Index products by ref
  const productByRef = new Map<string, NormalizedProduct>();
  for (const p of normalized.products) {
    productByRef.set(p.ref, p);
  }

  // Group variants by product_ref
  const variantsByProduct = new Map<string, NormalizedVariant[]>();
  for (const v of normalized.variants) {
    const list = variantsByProduct.get(v.product_ref) ?? [];
    list.push(v);
    variantsByProduct.set(v.product_ref, list);
  }

  for (const prod of normalized.products) {
    const prodVariants = variantsByProduct.get(prod.ref) ?? [];
    const baseVariants = prodVariants.filter((v) => v.line_type === "variante");
    // Note: lot_pricing lines are supplier purchase tiers — NOT commercial lot offers.
    // They are skipped here. product_lot_offers is for PRODES's own commercial offers.
    const lotPricingCount = prodVariants.filter(
      (v) => v.line_type === "lot_pricing",
    ).length;

    // Track supplier
    const sup = prod.fournisseur ?? "UNKNOWN";
    supplierCounts[sup] = (supplierCounts[sup] ?? 0) + 1;

    // ─── Family ─────────────────────────────────────────────────────
    const familyRef = prod.ref;
    families.push({
      name: prod.nom_gamme,
      slug: slugify(prod.nom_gamme),
      supplier_code: prod.fournisseur,
      category: prod.categorie_produit,
      description: prod.description_gamme,
      _adapter_ref: familyRef,
    });

    // ─── Product ────────────────────────────────────────────────────
    const basePrices = baseVariants
      .map((v) => v.prix_ht)
      .filter((p): p is number => p != null && p > 0);
    const minPrice = basePrices.length > 0 ? Math.min(...basePrices) : null;

    const firstEco = baseVariants.find((v) => v.eco_contribution != null);
    const firstWeight = baseVariants.find((v) => v.poids != null);

    const isSimple = baseVariants.length <= 1;

    products.push({
      sku: prod.ref,
      name: prod.nom_gamme,
      slug: slugify(prod.nom_gamme),
      description: prod.description_gamme,
      type: isSimple ? "simple" : "variable",
      status: "draft",
      supplier_code: prod.fournisseur,
      regular_price: minPrice,
      eco_contribution: firstEco?.eco_contribution ?? null,
      axes_prix: prod.axes_prix_effectif.map(normalizeAxisKey),
      axes_style: prod.axes_style_effectif.map(normalizeAxisKey),
      family_role: isSimple ? "standalone" : "parent",
      category: prod.categorie_produit,
      weight: firstWeight?.poids ?? null,
      _adapter_ref: prod.ref,
      _adapter_family_ref: familyRef,
    });

    if (lotPricingCount > 0) {
      warnings.push({
        level: "info",
        product_ref: prod.ref,
        message: `Skipped ${lotPricingCount} supplier lot_pricing lines (not mapped to product_lot_offers)`,
      });
    }

    if (baseVariants.length === 0) {
      warnings.push({
        level: "warn",
        product_ref: prod.ref,
        message: `Product has 0 base variants — will be empty`,
      });
    }

    // ─── Variants ───────────────────────────────────────────────────
    const productAxes = {
      axes_prix_effectif: prod.axes_prix_effectif,
      axes_style_effectif: prod.axes_style_effectif,
    };

    for (let i = 0; i < baseVariants.length; i++) {
      const v = baseVariants[i]!;

      const attrs = buildAttributsJson(v._raw, productAxes);
      const { price, style } = partitionAttrs(
        attrs,
        prod.axes_prix_effectif,
        prod.axes_style_effectif,
      );

      // Track attribute keys in registry
      for (const key of Object.keys(attrs)) {
        if (!registryMap.has(key)) {
          const val = attrs[key];
          const isNumeric =
            typeof val === "number" ||
            (typeof val === "string" && /^\d+([.,]\d+)?$/.test(val.trim()));
          registryMap.set(key, {
            slug: key,
            display_name: key
              .replace(/_/g, " ")
              .replace(/\b\w/g, (c) => c.toUpperCase()),
            data_type: isNumeric ? "numeric" : "text",
            unit: null,
          });
        }
      }

      if (
        Object.keys(attrs).length === 0 &&
        prod.axes_prix_effectif.length > 0
      ) {
        warnings.push({
          level: "warn",
          product_ref: prod.ref,
          variant_ref: v.reference,
          message: `Could not derive attributs_prix — axes declared: [${prod.axes_prix_effectif.join(", ")}]`,
        });
      }

      allVariants.push({
        sku: v.reference,
        name: v.designation,
        regular_price: v.prix_ht,
        eco_contribution: v.eco_contribution,
        status: v.need_check ? "draft" : "publish",
        position: i,
        supplier_code: prod.fournisseur,
        attributs_prix: attrs,
        _price_branch: price,
        _style_branch: style,
        weight: v.poids,
        need_check: v.need_check,
        source_row_hint: v.source_row_hint,
        _adapter_product_ref: prod.ref,
      });
    }

    // ─── Pricing profiles ───────────────────────────────────────────
    // Group variants by price_branch to identify unique pricing profiles
    const profileMap = new Map<
      string,
      {
        branch: Record<string, string | number | null>;
        price: number;
        count: number;
      }
    >();

    for (const variant of allVariants.filter(
      (v) => v._adapter_product_ref === prod.ref,
    )) {
      if (variant.regular_price == null || variant.regular_price <= 0) continue;

      const branchKey = stableJsonKey(variant._price_branch);
      const existing = profileMap.get(branchKey);

      if (!existing) {
        profileMap.set(branchKey, {
          branch: variant._price_branch,
          price: variant.regular_price,
          count: 1,
        });
      } else {
        // If same branch has different prices, warn
        if (
          Math.abs(existing.price - variant.regular_price) > 0.01 &&
          Object.keys(variant._price_branch).length > 0
        ) {
          warnings.push({
            level: "warn",
            product_ref: prod.ref,
            variant_ref: variant.sku,
            message: `Same price_branch "${branchKey}" has different prices: ${existing.price} vs ${variant.regular_price}`,
          });
        }
        existing.count++;
      }
    }

    // If we couldn't derive price branches (no attrs), fall back to price-based grouping
    const hasEmptyBranches = [...profileMap.keys()].every((k) => k === "{}");
    if (hasEmptyBranches && basePrices.length > 1) {
      profileMap.clear();
      const uniquePrices = [...new Set(basePrices)].sort((a, b) => a - b);
      for (let pi = 0; pi < uniquePrices.length; pi++) {
        const price = uniquePrices[pi]!;
        profileMap.set(`{"_price_group":"${pi}"}`, {
          branch: { _price_group: String(pi) },
          price,
          count: baseVariants.filter((v) => v.prix_ht === price).length,
        });
      }

      if (uniquePrices.length > 1) {
        warnings.push({
          level: "info",
          product_ref: prod.ref,
          message: `Using price-based grouping (${uniquePrices.length} branches) — attributs_prix unavailable for branch identification`,
        });
      }
    }

    for (const [branchKey, profile] of profileMap.entries()) {
      const profileKey = `${prod.ref}::${branchKey}`;
      const branchLabel =
        Object.entries(profile.branch)
          .filter(([k]) => k !== "_price_group")
          .map(([k, v]) => `${k}=${v}`)
          .join(", ") || `prix=${profile.price}`;

      pricingProfiles.push({
        profile_key: profileKey,
        label: branchLabel,
        price_branch: profile.branch,
        base_price_ht: profile.price,
        _adapter_product_ref: prod.ref,
      });
    }
  }

  return {
    families,
    products,
    variants: allVariants,
    pricing_profiles: pricingProfiles,
    lot_offers: lotOffers,
    attribute_registry: [...registryMap.values()],
    warnings,
    summary: {
      families_count: families.length,
      products_count: products.length,
      variants_count: allVariants.length,
      pricing_profiles_count: pricingProfiles.length,
      lot_offers_count: lotOffers.length,
      registry_entries_count: registryMap.size,
      warnings_count: warnings.length,
      by_supplier: supplierCounts,
    },
  };
}
