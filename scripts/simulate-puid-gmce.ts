/**
 * One-shot simulation: feed buildPuidPlan with the data shape the retab
 * family-first pipeline would produce for a single GMCE variant, and dump
 * the suggested PUID + the reasoning trail.
 *
 * Catalog: GMCE chaises p1-3 (validated 2026-03-19)
 * Family : HELENE (axes_prix = [classement_feu, accroches, diametre_tube])
 * Variant: AR00003 — classement_feu=M4, accroches="sans accroches"
 *          (diametre_tube absent — the variant doesn't ship that axis)
 *
 * Run with:
 *   cd /Users/nico/Desktop/prodes_newsite_codex/commerce
 *   npx tsx scripts/simulate-puid-gmce.ts
 */
import { buildPuidPlan, type PuidPlanInput } from "../lib/admin/puid";

// --- Inputs the retab pipeline would produce after mapping expanded.json ---

const PRODUCT_ID = "FAM-AR00003";

const input: PuidPlanInput = {
  products: [
    {
      // Family-level "product" — id == family_ref produced by family_builder.
      id: PRODUCT_ID,
      name: "HELENE", // nom_gamme from the v15 schema
      // SKU left null at the family level; we pass the family designation
      // as parent_sku so resolveModelCode picks "HELENE" via parent_sku path.
      sku: null,
      parent_sku: "HELENE",
      // The pipeline doesn't carry supplier metadata today — the dashboard
      // would inject "GMCE" from the active extraction context.
      supplier_code: "GMCE",
      supplier_ref: null,
      family_role: "parent",
      parent_family_id: null,
      regular_price: null,
      status: "publish",
      updated_at: "2026-03-19T00:00:00Z",
    },
  ],
  variants: [
    {
      id: "AR00003",
      product_id: PRODUCT_ID,
      sku: "AR00003",
      name: "HELENE — M4 sans accroches",
      regular_price: 18.08,
      status: "publish",
      attrs: [
        { attribute_id: "classement_feu", attribute_slug: "classement_feu", attribute_name: "classement_feu", term_slug: "M4", term_name: "M4" },
        { attribute_id: "accroches", attribute_slug: "accroches", attribute_name: "accroches", term_slug: "sans accroches", term_name: "sans accroches" },
        // No diametre_tube on the base variant.
      ],
    },
    // Composite produced by the family-first pipeline after porting
    // create_option_composites() from expand.py legacy.
    {
      id: "AR00003-D22",
      product_id: PRODUCT_ID,
      sku: "AR00003-D22",
      name: "HELENE — M4 sans accroches DIA 22",
      regular_price: 18.48, // 18.08 + 0.40
      status: "publish",
      attrs: [
        { attribute_id: "classement_feu", attribute_slug: "classement_feu", attribute_name: "classement_feu", term_slug: "M4", term_name: "M4" },
        { attribute_id: "accroches", attribute_slug: "accroches", attribute_name: "accroches", term_slug: "sans accroches", term_name: "sans accroches" },
        { attribute_id: "diametre_tube", attribute_slug: "diametre_tube", attribute_name: "diametre_tube", term_slug: "22", term_name: "22" },
      ],
    },
  ],
  rules: [
    // axes_prix from the v15 family ⇒ rules with impacts_price=true.
    {
      product_id: PRODUCT_ID,
      family_id: null,
      attribute_id: "classement_feu",
      impacts_price: true,
      active: true,
    },
    {
      product_id: PRODUCT_ID,
      family_id: null,
      attribute_id: "accroches",
      impacts_price: true,
      active: true,
    },
    {
      product_id: PRODUCT_ID,
      family_id: null,
      attribute_id: "diametre_tube",
      impacts_price: true,
      active: true,
    },
    // axes_style would have impacts_price:false. Empty for HELENE.
  ],
  includeOnlyPublished: false,
};

const plan = buildPuidPlan(input);

console.log("=== INPUT (what the dashboard would build from expanded.json) ===\n");
console.log(JSON.stringify(input, null, 2));

console.log("\n=== PUID PLAN OUTPUT ===\n");
console.log(JSON.stringify(plan, null, 2));

console.log("\n=== SUMMARY ===\n");
const productSug = plan.product_suggestions[0];
const variantSug = plan.variant_suggestions[0];

console.log(`Product-level PUID (root): ${productSug.suggested_puid}`);
console.log(`  supplier_code   : ${productSug.supplier_code}`);
console.log(`  model_code      : ${productSug.model_code}`);
console.log(`  reasons         : ${JSON.stringify(productSug.reasons)}`);
console.log(`  confidence      : ${productSug.confidence}`);
console.log(`  lot_candidate   : ${productSug.lot_candidate}`);

console.log(`\nVariant PUID: ${variantSug.suggested_puid}`);
console.log(`  puid_root       : ${variantSug.puid_root}`);
console.log(`  price_branch    : ${variantSug.price_branch}`);
console.log(`  style_branch    : ${variantSug.style_branch}`);
console.log(`  reasons         : ${JSON.stringify(variantSug.reasons)}`);
console.log(`  confidence      : ${variantSug.confidence}`);
console.log(`  source_sku      : ${variantSug.source_sku}`);
