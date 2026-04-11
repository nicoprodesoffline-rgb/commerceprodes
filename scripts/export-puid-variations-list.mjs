#!/usr/bin/env node

/**
 * Minimal PUID list for variants only.
 * Output columns:
 * - type
 * - sku_de_base
 * - puid_de_la_mere
 * - branche_impact
 * - branche_style
 * - puid_final
 * - dimensions_ne_changent_pas_le_prix
 *
 * Usage:
 *   node scripts/export-puid-variations-list.mjs
 *   node scripts/export-puid-variations-list.mjs \
 *     --v5 ../docs/puid-full-export-with-acronymes-v2-...-v5.csv \
 *     --acronyms ../docs/newsite-acronymes-v2-....csv
 */

import fs from "node:fs";
import path from "node:path";
import { parse as csvParse } from "csv-parse/sync";
import { createClient } from "@supabase/supabase-js";

const DOCS_DIR = "/Users/nico/Desktop/prodes_newsite_codex/docs";
const ROOT = "/Users/nico/Desktop/prodes_newsite_codex/commerce";

function argValue(name, fallback = "") {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] || fallback;
}

function findLatest(pattern) {
  const files = fs
    .readdirSync(DOCS_DIR)
    .filter((f) => pattern.test(f))
    .sort();
  if (!files.length) return "";
  return path.join(DOCS_DIR, files[files.length - 1]);
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
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    process.env[k] = v;
  }
}

function csvEscape(value) {
  const s = String(value ?? "");
  if (/[,"\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function writeCsv(rows, headers, outPath) {
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => csvEscape(row[h])).join(","));
  }
  fs.writeFileSync(outPath, lines.join("\n"), "utf8");
}

function cleanAlnum(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function supplier3(value) {
  return cleanAlnum(value).slice(0, 3) || "XXX";
}

function parseFallbackRoot(rootLike) {
  const root = String(rootLike || "").trim();
  if (!root) return "";
  // root should already be P-SUP-MODEL
  const m = root.match(/^(P-[A-Z0-9]+-[A-Z0-9]+)/i);
  return m ? m[1].toUpperCase() : root.toUpperCase();
}

function toNumber(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function loadVariantPrices(variantIds) {
  const envPath = path.join(ROOT, ".env.local");
  loadEnv(envPath);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local",
    );
  }

  const client = createClient(url, key, { auth: { persistSession: false } });
  const out = new Map();

  const chunkSize = 200;
  for (let i = 0; i < variantIds.length; i += chunkSize) {
    const chunk = variantIds.slice(i, i + chunkSize);
    const { data, error } = await client
      .from("variants")
      .select("id, regular_price")
      .in("id", chunk);
    if (error)
      throw new Error(`Supabase variants query failed: ${error.message}`);
    for (const row of data || []) {
      out.set(String(row.id), toNumber(row.regular_price));
    }
  }
  return out;
}

function extractDimensions(text) {
  const src = String(text || "").toUpperCase();
  const found = new Set();
  const patterns = [
    /D\d{2,4}(?:H\d{2,4})?/g,
    /\d{1,4}X\d{1,4}/g,
    /L\d{2,4}CM/g,
    /H\d{2,4}CM/g,
    /\d{2,4}(?:MM|CM)/g,
    /\b\d{1,2}M\b/g,
  ];
  for (const re of patterns) {
    for (const m of src.matchAll(re)) {
      if (m[0]) found.add(m[0]);
    }
  }
  return found;
}

function stripDimensionsFromToken(token) {
  let t = String(token || "").toUpperCase();
  t = t.replace(/D\d{2,4}(?:H\d{2,4})?/g, "");
  t = t.replace(/\d{1,4}X\d{1,4}/g, "");
  t = t.replace(/L\d{2,4}CM/g, "");
  t = t.replace(/H\d{2,4}CM/g, "");
  t = t.replace(/\d{2,4}(?:MM|CM)/g, "");
  t = t.replace(/\b\d{1,2}M\b/g, "");
  t = t.replace(/[_.-]{2,}/g, ".");
  t = t.replace(/^[_.-]+|[_.-]+$/g, "");
  return t;
}

function stripDimensionsFromBranch(branch) {
  const tokens = String(branch || "")
    .split(".")
    .map((t) => t.trim())
    .filter(Boolean);
  const cleaned = [];
  for (const token of tokens) {
    const kept = stripDimensionsFromToken(token);
    if (kept) cleaned.push(kept);
  }
  return cleaned.join(".") || "BASE_STYLE";
}

function buildDimensionProof(dimGroups, row) {
  if (row.dim_in_impact) return "N/A:DIM_IN_IMPACT";
  if (!row.dim_in_style) return "N/A:NO_DIM";
  const key = `${row.product_id}::${row.branche_impact}::${row.style_no_dim}`;
  const g = dimGroups.get(key);
  if (!g) return "N/A:GROUP_MISSING";
  if (g.dimensions.size <= 1) return "N/A:SINGLE_DIM";
  if (!Number.isFinite(g.min) || !Number.isFinite(g.max))
    return "N/A:MISSING_PRICE";
  if (Math.abs(g.max - g.min) < 0.0001)
    return `OK:DIM_NO_DIFF:${g.min.toFixed(2)}`;
  return `KO:DIM_DIFF:${g.min.toFixed(2)}-${g.max.toFixed(2)}`;
}

async function main() {
  const v5Path = argValue(
    "--v5",
    findLatest(/^puid-full-export-with-acronymes-v2-.*-v5\.csv$/),
  );
  const acronymsPath = argValue(
    "--acronyms",
    findLatest(/^newsite-acronymes-v2-.*Z\.csv$/),
  );
  const outDir = argValue("--out-dir", DOCS_DIR);

  if (!v5Path || !fs.existsSync(v5Path))
    throw new Error(`v5 csv not found: ${v5Path || "<none>"}`);
  if (!acronymsPath || !fs.existsSync(acronymsPath))
    throw new Error(`acronyms csv not found: ${acronymsPath || "<none>"}`);

  const v5Rows = csvParse(fs.readFileSync(v5Path, "utf8"), {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
  });
  const acronymRows = csvParse(fs.readFileSync(acronymsPath, "utf8"), {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
  });

  const acronymByProduct = new Map();
  for (const r of acronymRows) {
    const pid = String(r.product_id || "").trim();
    if (!pid) continue;
    acronymByProduct.set(pid, {
      supplier_code: supplier3(r.supplier_code),
      model_code_v2: cleanAlnum(r.acronyme_v2).slice(0, 8) || "PRD",
    });
  }

  const variantBase = v5Rows
    .filter((r) => String(r.entity_level || "").toLowerCase() === "variant")
    .map((r) => {
      const productId = String(r.product_id || "").trim();
      const map = acronymByProduct.get(productId);
      const motherRoot = map
        ? `P-${map.supplier_code}-${map.model_code_v2}`
        : parseFallbackRoot(
            r.puid_root_v3 ||
              r.puid_root ||
              r.puid_propose_v3 ||
              r.puid_propose,
          );

      const impactRaw = String(r.impact_branch_v3 || "").trim();
      const styleRaw = String(r.style_branch_v3 || "").trim();
      const impact = impactRaw || "BASE";
      const style = styleRaw || "";
      const impactDims = extractDimensions(impact);
      const styleDims = extractDimensions(style);
      const styleNoDim = stripDimensionsFromBranch(style);

      let puidFinal = motherRoot;
      if (impact && impact !== "BASE") puidFinal += `-${impact}`;
      if (style) puidFinal += `.${style}`;

      return {
        type: "variante",
        entity_id: String(r.entity_id || "").trim(),
        product_id: productId,
        sku_de_base: String(r.sku_originel || "").trim(),
        puid_de_la_mere: motherRoot,
        branche_impact: impact,
        branche_style: style,
        puid_final: puidFinal,
        dim_in_impact: impactDims.size > 0,
        dim_in_style: styleDims.size > 0,
        style_no_dim: styleNoDim,
      };
    });

  const variantIds = variantBase.map((r) => r.entity_id).filter(Boolean);
  const prices = await loadVariantPrices(variantIds);

  const dimGroups = new Map();
  for (const row of variantBase) {
    const key = `${row.product_id}::${row.branche_impact}::${row.style_no_dim}`;
    const g = dimGroups.get(key) || {
      dimensions: new Set(),
      min: Number.POSITIVE_INFINITY,
      max: Number.NEGATIVE_INFINITY,
    };
    for (const d of extractDimensions(row.branche_style)) g.dimensions.add(d);
    const price = prices.get(row.entity_id);
    if (Number.isFinite(price)) {
      g.min = Math.min(g.min, price);
      g.max = Math.max(g.max, price);
    }
    dimGroups.set(key, g);
  }

  const outRows = variantBase
    .map((row) => ({
      type: row.type,
      sku_de_base: row.sku_de_base,
      puid_de_la_mere: row.puid_de_la_mere,
      branche_impact: row.branche_impact,
      branche_style: row.branche_style,
      puid_final: row.puid_final,
      dimensions_ne_changent_pas_le_prix: buildDimensionProof(dimGroups, row),
    }))
    .sort((a, b) => {
      if (a.puid_de_la_mere !== b.puid_de_la_mere)
        return a.puid_de_la_mere.localeCompare(b.puid_de_la_mere);
      if (a.branche_impact !== b.branche_impact)
        return a.branche_impact.localeCompare(b.branche_impact);
      return a.branche_style.localeCompare(b.branche_style);
    });

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = path.join(outDir, `puid-variations-list-${ts}.csv`);
  writeCsv(
    outRows,
    [
      "type",
      "sku_de_base",
      "puid_de_la_mere",
      "branche_impact",
      "branche_style",
      "puid_final",
      "dimensions_ne_changent_pas_le_prix",
    ],
    outPath,
  );

  const stats = {
    input_v5: v5Path,
    input_acronyms: acronymsPath,
    output: outPath,
    rows: outRows.length,
    dim_ok: outRows.filter((r) =>
      r.dimensions_ne_changent_pas_le_prix.startsWith("OK:"),
    ).length,
    dim_ko: outRows.filter((r) =>
      r.dimensions_ne_changent_pas_le_prix.startsWith("KO:"),
    ).length,
    dim_na: outRows.filter((r) =>
      r.dimensions_ne_changent_pas_le_prix.startsWith("N/A:"),
    ).length,
  };
  console.log(JSON.stringify(stats, null, 2));
}

main().catch((error) => {
  console.error("export-puid-variations-list failed:", error.message);
  process.exit(1);
});
