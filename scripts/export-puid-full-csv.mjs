#!/usr/bin/env node
/**
 * Export full PUID proposal matrix (products + variants) to CSV.
 *
 * Usage:
 *   node scripts/export-puid-full-csv.mjs
 *   node scripts/export-puid-full-csv.mjs --scope all --limit 3000 --include-draft true
 */

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

function argValue(name, fallback = "") {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] || fallback;
}

function parseBool(value, fallback = true) {
  if (value === undefined || value === null || value === "") return fallback;
  const normalized = String(value).toLowerCase();
  if (["true", "1", "yes", "y"].includes(normalized)) return true;
  if (["false", "0", "no", "n"].includes(normalized)) return false;
  return fallback;
}

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.trim().startsWith("#")) continue;
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m) continue;
    const k = m[1];
    if (process.env[k]) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    process.env[k] = v;
  }
}

function escapeCsv(value) {
  const s = String(value ?? "");
  if (/[,"\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(rows) {
  const headers = [
    "line_type",
    "entity_level",
    "entity_id",
    "product_id",
    "designation",
    "sku_originel",
    "puid_propose",
    "puid_root",
    "price_branch",
    "style_branch",
    "supplier_code",
    "model_code",
    "lot_candidate",
    "confidence",
    "status",
    "product_type",
    "family_role",
    "parent_family_id",
    "parent_sku",
  ];

  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => escapeCsv(row[h])).join(","));
  }
  return lines.join("\n");
}

function normalizeScope(scope) {
  return scope === "latest" || scope === "latest_import" ? "latest_import" : "all";
}

async function resolveLatestImportSince(client) {
  const { data, error } = await client
    .from("import_logs")
    .select("created_at")
    .in("status", ["pending", "processing", "done"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data?.created_at) return null;
  return String(data.created_at);
}

async function main() {
  const ROOT = process.cwd();
  const ENV_FILE = path.join(ROOT, ".env.local");
  const DOCS_DIR = path.resolve(ROOT, "..", "docs");
  const TS = new Date().toISOString().replace(/[:.]/g, "-");
  const OUTPUT = path.join(DOCS_DIR, `puid-full-export-${TS}.csv`);

  const scope = normalizeScope(argValue("--scope", "all"));
  const limit = Math.min(3000, Math.max(1, Number(argValue("--limit", "3000")) || 3000));
  const includeDraft = parseBool(argValue("--include-draft", "true"), true);

  loadEnv(ENV_FILE);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  }

  const { loadPuidInput, buildPuidPlan } = await import("../lib/admin/puid.ts");

  const client = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const sinceIso = scope === "latest_import" ? await resolveLatestImportSince(client) : null;

  const input = await loadPuidInput(client, {
    scope,
    sinceIso,
    limit,
    includeDraft,
  });

  const plan = buildPuidPlan({
    products: input.products,
    variants: input.variants,
    rules: input.rules,
    includeOnlyPublished: !includeDraft,
  });

  const productsById = new Map(input.products.map((p) => [p.id, p]));
  const variantsById = new Map(input.variants.map((v) => [v.id, v]));

  const variantCountByProduct = new Map();
  for (const row of plan.variant_suggestions) {
    const key = String(row.product_id);
    variantCountByProduct.set(key, (variantCountByProduct.get(key) || 0) + 1);
  }

  const rows = [];

  for (const row of plan.product_suggestions) {
    const p = productsById.get(String(row.id));
    const count = variantCountByProduct.get(String(row.id)) || 0;
    const lineType =
      p?.family_role === "parent"
        ? "mere"
        : count > 0
          ? "produit_avec_variantes"
          : "simple";

    rows.push({
      line_type: lineType,
      entity_level: "product",
      entity_id: row.id,
      product_id: row.product_id,
      designation: p?.name || "",
      sku_originel: row.source_sku || p?.sku || "",
      puid_propose: row.suggested_puid || "",
      puid_root: row.puid_root || "",
      price_branch: row.price_branch || "",
      style_branch: row.style_branch || "",
      supplier_code: row.supplier_code || "",
      model_code: row.model_code || "",
      lot_candidate: row.lot_candidate ? "true" : "false",
      confidence: row.confidence ?? "",
      status: p?.status || "",
      product_type: p?.type || "",
      family_role: p?.family_role || "",
      parent_family_id: p?.parent_family_id || "",
      parent_sku: p?.parent_sku || "",
    });
  }

  for (const row of plan.variant_suggestions) {
    const v = variantsById.get(String(row.id));
    const p = productsById.get(String(row.product_id));

    rows.push({
      line_type: "variante",
      entity_level: "variant",
      entity_id: row.id,
      product_id: row.product_id,
      designation: v?.name || p?.name || "",
      sku_originel: row.source_sku || v?.sku || "",
      puid_propose: row.suggested_puid || "",
      puid_root: row.puid_root || "",
      price_branch: row.price_branch || "",
      style_branch: row.style_branch || "",
      supplier_code: row.supplier_code || "",
      model_code: row.model_code || "",
      lot_candidate: row.lot_candidate ? "true" : "false",
      confidence: row.confidence ?? "",
      status: v?.status || "",
      product_type: p?.type || "",
      family_role: p?.family_role || "",
      parent_family_id: p?.parent_family_id || "",
      parent_sku: p?.parent_sku || "",
    });
  }

  fs.mkdirSync(DOCS_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT, toCsv(rows), "utf8");

  console.log(
    JSON.stringify(
      {
        output: OUTPUT,
        scope,
        include_draft: includeDraft,
        total_rows: rows.length,
        products: plan.product_suggestions.length,
        variants: plan.variant_suggestions.length,
        simples: rows.filter((r) => r.line_type === "simple").length,
        meres: rows.filter((r) => r.line_type === "mere").length,
        produits_avec_variantes: rows.filter((r) => r.line_type === "produit_avec_variantes").length,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error("export-puid-full-csv failed:", error.message);
  process.exit(1);
});
