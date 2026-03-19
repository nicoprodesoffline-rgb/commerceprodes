#!/usr/bin/env node
/**
 * backfill-variations.mjs
 * ========================
 * Reads 270226.csv (WooCommerce export) and backfills:
 *   - products.parent_sku  (from post_parent → parent product SKU)
 *   - variants.eco_contribution  (from meta:eco_part)
 *   - variants.supplier_ref  (from meta:ref_fournisseur)
 *   - variants.supplier_name  (from meta:fournisseur)
 *   - variants.supplier_purchase_price  (from meta:prix_achat)
 *   - variants.min_quantity  (from meta:min_order_quantity)
 *   - variants.gtin_upc_ean_isbn  (from meta:gtin / meta:ean / meta:upc)
 *   - products.default_attribute_values  (from meta:default_attributes)
 *
 * Usage:
 *   node scripts/backfill-variations.mjs --csv=../270226.csv --dry-run
 *   node scripts/backfill-variations.mjs --csv=../270226.csv
 *
 * Requirements:
 *   - SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local
 *   - Run AFTER migrations 016 + 017 have been applied
 *   - Run from commerce/ directory
 */

import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

// ── Args ─────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const csvArg = args.find((a) => a.startsWith("--csv="))?.replace("--csv=", "");
const dryRun = args.includes("--dry-run");
const csvPath = csvArg ? path.resolve(csvArg) : path.resolve("../270226.csv");

if (!fs.existsSync(csvPath)) {
  console.error(`CSV not found: ${csvPath}`);
  process.exit(1);
}

// ── Supabase ──────────────────────────────────────────────────────────────────
const envFile = fs.existsSync(".env.local")
  ? fs.readFileSync(".env.local", "utf8")
  : "";

function envVal(key) {
  const match = envFile.match(new RegExp(`^${key}=(.+)$`, "m"));
  return match?.[1]?.trim() ?? process.env[key] ?? "";
}

const SUPABASE_URL = envVal("NEXT_PUBLIC_SUPABASE_URL");
const SERVICE_KEY = envVal("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// ── Parse CSV (simple, handles quoted fields) ────────────────────────────────
function parseCsvLine(line) {
  const result = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (ch === "," && !inQuotes) {
      result.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  result.push(cur);
  return result;
}

function parseCsv(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw.split("\n").filter(Boolean);
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const vals = parseCsvLine(line);
    return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? ""]));
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`Reading CSV: ${csvPath}`);
  const rows = parseCsv(csvPath);
  console.log(`Rows: ${rows.length}${dryRun ? " [DRY RUN]" : ""}`);

  // Separate products and variations
  const products = rows.filter((r) => r["tax:product_type"] !== "variation");
  const variations = rows.filter((r) => r["tax:product_type"] === "variation");

  console.log(`Products: ${products.length}, Variations: ${variations.length}`);

  // Build SKU map for parent lookup
  const skuMap = {};
  for (const p of products) {
    if (p.sku) skuMap[p.sku] = p;
  }

  let productUpdates = 0;
  let variantUpdates = 0;
  let errors = 0;

  // ── Update products.parent_sku ────────────────────────────────────────────
  console.log("\n[1/3] Backfilling products.parent_sku…");
  for (const row of variations) {
    if (!row.sku || !row["meta:_variation_description"]) continue;
    // parent_sku should be the parent product's SKU
    // In WooCommerce exports, variation rows have post_parent as an ID
    // We need to find the parent SKU from the ID mapping
    // This is approximate — use parent_sku directly if it's in the CSV
    const parentSku = row["parent_sku"] || row["meta:parent_sku"] || "";
    if (!parentSku) continue;

    if (!dryRun) {
      const { error } = await supabase
        .from("products")
        .update({ parent_sku: parentSku })
        .eq("sku", row.sku);
      if (error) { errors++; continue; }
    }
    productUpdates++;
  }

  // ── Update variants (eco_contribution, supplier, qty, gtin) ──────────────
  console.log("[2/3] Backfilling variant commercial fields…");
  for (const row of variations) {
    if (!row.sku) continue;

    const patch = {};

    const eco = parseFloat(row["meta:eco_part"] || row["meta:_eco_contribution"] || "");
    if (!isNaN(eco) && eco > 0) patch.eco_contribution = eco;

    const supplierRef = (row["meta:ref_fournisseur"] || "").trim();
    if (supplierRef) patch.supplier_ref = supplierRef;

    const supplierName = (row["meta:fournisseur"] || "").trim();
    if (supplierName) patch.supplier_name = supplierName;

    const purchasePrice = parseFloat(row["meta:prix_achat"] || "");
    if (!isNaN(purchasePrice) && purchasePrice > 0) patch.supplier_purchase_price = purchasePrice;

    const minQty = parseInt(row["meta:_min_order_quantity"] || row["meta:min_quantity"] || "");
    if (!isNaN(minQty) && minQty > 1) patch.min_quantity = minQty;

    const gtin = (row["meta:gtin"] || row["meta:ean"] || row["meta:upc"] || row["meta:isbn"] || "").trim();
    if (gtin) patch.gtin_upc_ean_isbn = gtin;

    if (Object.keys(patch).length === 0) continue;

    if (!dryRun) {
      const { error } = await supabase
        .from("variants")
        .update(patch)
        .eq("sku", row.sku);
      if (error) { errors++; continue; }
    } else {
      console.log(`  [dry] variant ${row.sku}:`, patch);
    }
    variantUpdates++;
  }

  // ── Update products.default_attribute_values ──────────────────────────────
  console.log("[3/3] Backfilling default_attribute_values…");
  for (const row of products) {
    if (!row.sku) continue;
    const raw = row["meta:default_attributes"] || row["meta:_default_attributes"] || "";
    if (!raw) continue;

    let parsed = null;
    try { parsed = JSON.parse(raw); } catch { /* ignore */ }
    if (!parsed) continue;

    if (!dryRun) {
      const { error } = await supabase
        .from("products")
        .update({ default_attribute_values: parsed })
        .eq("sku", row.sku);
      if (error) { errors++; continue; }
    }
    productUpdates++;
  }

  console.log(`\n✅ Done${dryRun ? " (dry run — no writes)" : ""}`);
  console.log(`   Product updates: ${productUpdates}`);
  console.log(`   Variant updates: ${variantUpdates}`);
  console.log(`   Errors: ${errors}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
