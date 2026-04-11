#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { parse } from "csv-parse/sync";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const COMMERCE_DIR = path.resolve(__dirname, "..");
const ROOT_DIR = path.resolve(COMMERCE_DIR, "..");
const DOCS_DIR = path.join(ROOT_DIR, "docs");
const ENV_PATH = path.join(COMMERCE_DIR, ".env.local");
const PRODUCTS_CSV = path.join(
  DOCS_DIR,
  "puid-simples-meres-acronymes-2026-03-04T07-38-00-254Z.csv",
);
const VARIANTS_CSV = path.join(
  DOCS_DIR,
  "puid-variations-list-2026-03-05T16-41-06-280Z-clean.csv",
);
const NOW = new Date().toISOString().replace(/[:.]/g, "-");

const APPLY = process.argv.includes("--apply");
const PRODUCTS_ONLY = process.argv.includes("--products-only");
const VARIANTS_ONLY = process.argv.includes("--variants-only");
const BATCH_SIZE = Math.max(1, Number(argValue("--batch-size", "200")) || 200);
const BACKUP_JSON = path.join(DOCS_DIR, `puid-db-backup-${NOW}.json`);
const BACKUP_CSV = path.join(DOCS_DIR, `puid-db-backup-${NOW}.csv`);
const MANIFEST_JSON = path.join(DOCS_DIR, `puid-apply-manifest-${NOW}.json`);
const REPORT_JSON = path.join(DOCS_DIR, `puid-apply-report-${NOW}.json`);
const REPORT_CSV = path.join(DOCS_DIR, `puid-apply-report-${NOW}.csv`);
const SKIPPED_CSV = path.join(DOCS_DIR, `puid-apply-skipped-${NOW}.csv`);

function argValue(name, fallback = "") {
  const idx = process.argv.indexOf(name);
  return idx === -1 ? fallback : process.argv[idx + 1] || fallback;
}

if (PRODUCTS_ONLY && VARIANTS_ONLY) {
  throw new Error("Use either --products-only or --variants-only, not both");
}

function loadEnv(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#") || !line.includes("=")) continue;
    const [key, ...rest] = line.split("=");
    if (process.env[key]) continue;
    process.env[key] = rest
      .join("=")
      .trim()
      .replace(/^['"]|['"]$/g, "");
  }
}

function readCsv(filePath) {
  return parse(fs.readFileSync(filePath, "utf8"), {
    columns: true,
    skip_empty_lines: true,
    bom: true,
  });
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function writeCsv(filePath, rows, headers) {
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((header) => csvEscape(row[header])).join(","));
  }
  fs.writeFileSync(filePath, lines.join("\n"));
}

function chunk(array, size) {
  const out = [];
  for (let index = 0; index < array.length; index += size) {
    out.push(array.slice(index, index + size));
  }
  return out;
}

async function fetchAll(client, table, columns, orderColumn = "id") {
  const pageSize = 1000;
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await client
      .from(table)
      .select(columns)
      .order(orderColumn, { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`${table} fetch: ${error.message}`);
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < pageSize) break;
  }
  return rows;
}

async function updateRows(
  client,
  table,
  rows,
  payloadBuilder,
  result,
  errorPrefix,
) {
  for (const group of chunk(rows, BATCH_SIZE)) {
    for (const row of group) {
      const payload = payloadBuilder(row);
      if (!payload) continue;
      const { error } = await client
        .from(table)
        .update(payload)
        .eq("id", row.id);
      if (error) {
        result.errors.push(`${errorPrefix}:${row.id}:${error.message}`);
      } else {
        result.updated[table] += 1;
      }
    }
  }
}

loadEnv(ENV_PATH);
if (
  !process.env.NEXT_PUBLIC_SUPABASE_URL ||
  !process.env.SUPABASE_SERVICE_ROLE_KEY
) {
  throw new Error("Missing Supabase env vars in .env.local");
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const productSourceRows = readCsv(PRODUCTS_CSV);
const variantSourceRows = readCsv(VARIANTS_CSV);

const productTargetCounts = new Map();
for (const row of productSourceRows) {
  const target = `P-${String(row.supplier_code || "").trim()}-${String(row.acronyme_propose || "").trim()}`;
  productTargetCounts.set(target, (productTargetCounts.get(target) || 0) + 1);
}

const productPlan = new Map();
for (const row of productSourceRows) {
  const directTarget = `P-${String(row.supplier_code || "").trim()}-${String(row.acronyme_propose || "").trim()}`;
  const fallbackTarget = String(row.puid_root_actuel || "").trim();
  const hasCollision = (productTargetCounts.get(directTarget) || 0) > 1;
  const finalTarget =
    hasCollision && fallbackTarget ? fallbackTarget : directTarget;
  productPlan.set(String(row.product_id), {
    id: String(row.product_id),
    product_id: String(row.product_id),
    sku_originel: String(row.sku_originel || ""),
    designation: String(row.designation || ""),
    target_sku: finalTarget,
    target_puid: finalTarget,
    target_root: finalTarget,
    fallback_used: hasCollision && fallbackTarget ? "yes" : "no",
    fallback_reason:
      hasCollision && fallbackTarget
        ? "product_csv_collision_preserve_existing_unique_root"
        : "",
    source_note: String(row.note || ""),
  });
}

const variantTargetCounts = new Map();
for (const row of variantSourceRows) {
  const target = String(row.puid_final || "").trim();
  if (!target) continue;
  variantTargetCounts.set(target, (variantTargetCounts.get(target) || 0) + 1);
}

const variantPlanBySku = new Map();
for (const row of variantSourceRows) {
  variantPlanBySku.set(String(row.sku_de_base), {
    sku_de_base: String(row.sku_de_base),
    puid_de_la_mere: String(row.puid_de_la_mere || "").trim(),
    branche_impact: String(row.branche_impact || "").trim(),
    branche_style: String(row.branche_style || "").trim(),
    puid_final: String(row.puid_final || "").trim(),
    dimensions_note: String(
      row.dimensions_ne_changent_pas_le_prix || "",
    ).trim(),
    duplicate_target_count:
      variantTargetCounts.get(String(row.puid_final || "").trim()) || 0,
  });
}

const products = await fetchAll(
  supabase,
  "products",
  "id, sku, puid, puid_root, puid_price_branch, puid_style_branch, puid_generated_at, updated_at, type, name, parent_sku",
  "name",
);
const variants = await fetchAll(
  supabase,
  "variants",
  "id, product_id, sku, puid, puid_root, puid_price_branch, puid_style_branch, puid_generated_at, updated_at",
  "sku",
);

const backup = {
  created_at: new Date().toISOString(),
  source_files: {
    products_csv: PRODUCTS_CSV,
    variants_csv: VARIANTS_CSV,
  },
  products,
  variants,
};
fs.writeFileSync(BACKUP_JSON, JSON.stringify(backup, null, 2));
writeCsv(
  BACKUP_CSV,
  [
    ...products.map((row) => ({
      entity_type: "product",
      id: row.id,
      product_id: "",
      old_sku: row.sku || "",
      old_puid: row.puid || "",
      old_root: row.puid_root || "",
    })),
    ...variants.map((row) => ({
      entity_type: "variant",
      id: row.id,
      product_id: row.product_id,
      old_sku: row.sku || "",
      old_puid: row.puid || "",
      old_root: row.puid_root || "",
    })),
  ],
  ["entity_type", "id", "product_id", "old_sku", "old_puid", "old_root"],
);

const productDbById = new Map(products.map((row) => [String(row.id), row]));
const productTargetById = new Map();
for (const [productId, plan] of productPlan.entries()) {
  if (!productDbById.has(productId)) continue;
  productTargetById.set(productId, plan);
}

const variantDbBySku = new Map(variants.map((row) => [String(row.sku), row]));
const skipped = [];
const variantTargets = [];
const coveredVariantIds = new Set();

for (const variant of variants) {
  const currentSku = String(variant.sku || "");
  const productTarget = productTargetById.get(String(variant.product_id));
  if (currentSku.endsWith("-default")) {
    if (!productTarget) {
      skipped.push({
        entity_type: "variant",
        id: variant.id,
        sku: currentSku,
        reason: "default_variant_missing_parent_target",
      });
      continue;
    }
    const targetSku = `${productTarget.target_sku}-default`;
    variantTargets.push({
      id: String(variant.id),
      product_id: String(variant.product_id),
      current_sku: currentSku,
      target_sku: targetSku,
      target_puid: productTarget.target_sku,
      target_root: productTarget.target_sku,
      target_price_branch: null,
      target_style_branch: null,
      source: "derived_default_variant",
      note: "",
    });
    coveredVariantIds.add(String(variant.id));
    continue;
  }

  const source = variantPlanBySku.get(currentSku);
  if (!source) {
    skipped.push({
      entity_type: "variant",
      id: variant.id,
      sku: currentSku,
      reason: "not_in_validated_variant_csv",
    });
    continue;
  }
  if (source.duplicate_target_count > 1) {
    skipped.push({
      entity_type: "variant",
      id: variant.id,
      sku: currentSku,
      reason: "duplicate_target_in_validated_variant_csv",
      duplicate_target: source.puid_final,
    });
    continue;
  }

  variantTargets.push({
    id: String(variant.id),
    product_id: String(variant.product_id),
    current_sku: currentSku,
    target_sku: source.puid_final,
    target_puid: source.puid_final,
    target_root: source.puid_de_la_mere,
    target_price_branch: source.branche_impact || null,
    target_style_branch: source.branche_style || null,
    source: "validated_variant_csv",
    note: source.dimensions_note,
  });
  coveredVariantIds.add(String(variant.id));
}

const manifest = {
  created_at: new Date().toISOString(),
  apply_mode: APPLY ? "apply" : "dry_run",
  source_files: {
    products_csv: PRODUCTS_CSV,
    variants_csv: VARIANTS_CSV,
  },
  rules: {
    product_rule:
      "P-{supplier_code}-{acronyme_propose}; fallback to puid_root_actuel when approved product CSV target collides",
    variant_rule:
      "puid_final from validated variant CSV when unique; default variants derive {product_target_sku}-default; unmapped or duplicate-target variants are skipped",
  },
  stats: {
    products_in_db: products.length,
    products_planned: productTargetById.size,
    variants_in_db: variants.length,
    variants_planned: variantTargets.length,
    skipped: skipped.length,
  },
  products: [...productTargetById.values()],
  variants: variantTargets,
  skipped,
};
fs.writeFileSync(MANIFEST_JSON, JSON.stringify(manifest, null, 2));

const report = {
  created_at: new Date().toISOString(),
  mode: APPLY ? "apply" : "dry_run",
  scope: PRODUCTS_ONLY
    ? "products_only"
    : VARIANTS_ONLY
      ? "variants_only"
      : "all",
  backups: {
    json: BACKUP_JSON,
    csv: BACKUP_CSV,
    manifest: MANIFEST_JSON,
  },
  updated: {
    products: 0,
    variants: 0,
  },
  planned: {
    products: productTargetById.size,
    variants: variantTargets.length,
  },
  skipped_summary: {
    total: skipped.length,
    by_reason: skipped.reduce((acc, row) => {
      acc[row.reason] = (acc[row.reason] || 0) + 1;
      return acc;
    }, {}),
  },
  errors: [],
};

if (APPLY) {
  if (!VARIANTS_ONLY)
    await updateRows(
      supabase,
      "products",
      [...productTargetById.values()],
      (row) => ({
        sku: row.target_sku,
        puid: row.target_puid,
        puid_root: row.target_root,
        puid_price_branch: null,
        puid_style_branch: null,
        puid_generated_at: new Date().toISOString(),
      }),
      report,
      "products",
    );

  if (!PRODUCTS_ONLY)
    await updateRows(
      supabase,
      "variants",
      variantTargets,
      (row) => ({
        sku: row.target_sku,
        puid: row.target_puid,
        puid_root: row.target_root,
        puid_price_branch: row.target_price_branch,
        puid_style_branch: row.target_style_branch,
        puid_generated_at: new Date().toISOString(),
      }),
      report,
      "variants",
    );
}

fs.writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2));
writeCsv(
  REPORT_CSV,
  [
    ...[...productTargetById.values()].map((row) => ({
      entity_type: "product",
      id: row.product_id,
      product_id: row.product_id,
      current_sku: row.sku_originel,
      target_sku: row.target_sku,
      target_puid: row.target_puid,
      target_root: row.target_root,
      source:
        row.fallback_used === "yes"
          ? row.fallback_reason
          : "approved_product_csv",
      note: row.source_note,
    })),
    ...variantTargets.map((row) => ({
      entity_type: "variant",
      id: row.id,
      product_id: row.product_id,
      current_sku: row.current_sku,
      target_sku: row.target_sku,
      target_puid: row.target_puid,
      target_root: row.target_root,
      source: row.source,
      note: row.note,
    })),
  ],
  [
    "entity_type",
    "id",
    "product_id",
    "current_sku",
    "target_sku",
    "target_puid",
    "target_root",
    "source",
    "note",
  ],
);
writeCsv(SKIPPED_CSV, skipped, [
  "entity_type",
  "id",
  "sku",
  "reason",
  "duplicate_target",
]);

console.log(
  JSON.stringify(
    {
      mode: APPLY ? "apply" : "dry_run",
      backup_json: BACKUP_JSON,
      backup_csv: BACKUP_CSV,
      manifest_json: MANIFEST_JSON,
      report_json: REPORT_JSON,
      report_csv: REPORT_CSV,
      skipped_csv: SKIPPED_CSV,
      planned_products: report.planned.products,
      planned_variants: report.planned.variants,
      skipped: report.skipped_summary,
      updated: report.updated,
      errors: report.errors.length,
    },
    null,
    2,
  ),
);
