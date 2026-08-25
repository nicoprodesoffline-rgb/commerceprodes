import assert from "node:assert/strict";
import { buildPuidPlan, type PuidPlanInput } from "../lib/admin/puid";

const x20Input: PuidPlanInput = {
  products: [
    {
      id: "GROSFILLEX-X2-0-PIED-SIMPLE",
      name: "X2.0 Pied SIMPLE",
      sku: null,
      parent_sku: null,
      supplier_code: "GROSFILLEX",
      supplier_ref: "GROSFILLEX-X2-0-PIED-SIMPLE",
      family_role: "parent",
      parent_family_id: null,
      regular_price: null,
      status: "publish",
      updated_at: null,
    },
  ],
  variants: [
    {
      id: "U3 901 852",
      product_id: "GROSFILLEX-X2-0-PIED-SIMPLE",
      sku: "U3 901 852",
      name: "Pied de table X2.0 SIMPLE. Garantie 2 ans. LICHEN.",
      regular_price: 24.2,
      status: "publish",
      attrs: [
        {
          attribute_id: "coloris",
          attribute_slug: "coloris",
          attribute_name: "coloris",
          term_slug: "lichen",
          term_name: "lichen",
        },
      ],
    },
    {
      id: "U3 901 002",
      product_id: "GROSFILLEX-X2-0-PIED-SIMPLE",
      sku: "U3 901 002",
      name: "Pied de table X2.0 SIMPLE. Garantie 2 ans. ANTHRACITE.",
      regular_price: 24.2,
      status: "publish",
      attrs: [
        {
          attribute_id: "coloris",
          attribute_slug: "coloris",
          attribute_name: "coloris",
          term_slug: "anthracite",
          term_name: "anthracite",
        },
      ],
    },
  ],
  rules: [
    {
      product_id: "GROSFILLEX-X2-0-PIED-SIMPLE",
      family_id: null,
      attribute_id: "coloris",
      impacts_price: false,
      active: true,
    },
  ],
  includeOnlyPublished: false,
};

const x20Plan = buildPuidPlan(x20Input);
assert.equal(x20Plan.product_suggestions[0]?.suggested_puid, "P-GRO-X20PDSIM");
assert.equal(
  x20Plan.variant_suggestions.find((row) => row.id === "U3 901 852")
    ?.suggested_puid,
  "P-GRO-X20PDSIM.LICH",
);
assert.equal(
  x20Plan.variant_suggestions.find((row) => row.id === "U3 901 002")
    ?.suggested_puid,
  "P-GRO-X20PDSIM.ANTR",
);

const denverInput: PuidPlanInput = {
  products: [
    {
      id: "GROSFILLEX-DENVER-EMPILABLE",
      name: "Denver Empilable",
      sku: null,
      parent_sku: null,
      supplier_code: "GROSFILLEX",
      supplier_ref: "GROSFILLEX-DENVER-EMPILABLE",
      family_role: "parent",
      parent_family_id: null,
      regular_price: null,
      status: "publish",
      updated_at: null,
    },
  ],
  variants: [
    {
      id: "55 001 002",
      product_id: "GROSFILLEX-DENVER-EMPILABLE",
      sku: "55 001 002",
      name: "Denver M4 non assemblable anthracite",
      regular_price: 55,
      status: "publish",
      attrs: [
        {
          attribute_id: "norme",
          attribute_slug: "norme",
          attribute_name: "norme",
          term_slug: "M4",
          term_name: "M4",
        },
        {
          attribute_id: "assemblage",
          attribute_slug: "assemblage",
          attribute_name: "assemblage",
          term_slug: "non assemblable",
          term_name: "non assemblable",
        },
        {
          attribute_id: "coloris",
          attribute_slug: "coloris",
          attribute_name: "coloris",
          term_slug: "anthracite",
          term_name: "anthracite",
        },
      ],
    },
  ],
  rules: [
    {
      product_id: "GROSFILLEX-DENVER-EMPILABLE",
      family_id: null,
      attribute_id: "assemblage",
      impacts_price: true,
      active: true,
    },
    {
      product_id: "GROSFILLEX-DENVER-EMPILABLE",
      family_id: null,
      attribute_id: "norme",
      impacts_price: true,
      active: true,
    },
    {
      product_id: "GROSFILLEX-DENVER-EMPILABLE",
      family_id: null,
      attribute_id: "coloris",
      impacts_price: false,
      active: true,
    },
  ],
  includeOnlyPublished: false,
};

const denverPlan = buildPuidPlan(denverInput);
assert.equal(
  denverPlan.product_suggestions[0]?.suggested_puid,
  "P-GRO-DENVEMPI",
);
assert.equal(
  denverPlan.variant_suggestions[0]?.suggested_puid,
  "P-GRO-DENVEMPI-NA-M4.ANTR",
);

console.log("PUID V4 spec checks passed");
