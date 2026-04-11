#!/usr/bin/env node

/**
 * Apply validated acronym proposals to a full PUID export (CSV to CSV).
 * No database write: this only generates a new working CSV.
 *
 * Usage:
 *   node scripts/apply-acronymes-to-puid-export.mjs
 *   node scripts/apply-acronymes-to-puid-export.mjs \
 *     --input ../docs/puid-full-export-2026-03-05T09-26-38-711Z.csv \
 *     --acronyms ../docs/newsite-acronymes-v2-2026-03-05T09-56-18-056Z.csv
 */

import fs from "node:fs";
import path from "node:path";
import { parse as csvParse } from "csv-parse/sync";

const DOCS_DIR = "/Users/nico/Desktop/prodes_newsite_codex/docs";

function argValue(name, fallback = "") {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] || fallback;
}

function cleanAlnum(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function cleanSupplier(value) {
  return cleanAlnum(value).slice(0, 3) || "XXX";
}

function findLatest(dir, pattern) {
  const files = fs
    .readdirSync(dir)
    .filter((f) => pattern.test(f))
    .sort();
  if (!files.length) return "";
  return path.join(dir, files[files.length - 1]);
}

function csvEscape(value) {
  const s = String(value ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function writeCsv(rows, headers, outputPath) {
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => csvEscape(row[h])).join(","));
  }
  fs.writeFileSync(outputPath, lines.join("\n"), "utf8");
}

function buildRoot(supplierCode, modelCode) {
  const sup = cleanSupplier(supplierCode);
  const model = cleanAlnum(modelCode).slice(0, 8) || "PRD";
  return `P-${sup}-${model}`;
}

function replacePuidRoot(oldPuid, oldRoot, newRoot) {
  const puid = String(oldPuid || "").trim();
  if (!puid) return newRoot;

  const currentRoot = String(oldRoot || "").trim();
  if (currentRoot && puid.startsWith(currentRoot)) {
    return `${newRoot}${puid.slice(currentRoot.length)}`;
  }

  // Fallback parser: keep suffix after the root model segment.
  // Expected format: P-SUP-MODEL[-IMPACT][.STYLE]
  const m = puid.match(/^P-([A-Z0-9]+)-([A-Z0-9]+)(.*)$/i);
  if (!m) return puid;
  return `${newRoot}${m[3] || ""}`;
}

function main() {
  const input = argValue(
    "--input",
    findLatest(DOCS_DIR, /^puid-full-export-.*\.csv$/),
  );
  const acronyms = argValue(
    "--acronyms",
    findLatest(DOCS_DIR, /^newsite-acronymes-v2-.*Z\.csv$/),
  );
  const outDir = argValue("--out-dir", DOCS_DIR);

  if (!input || !fs.existsSync(input)) {
    throw new Error(`input not found: ${input || "<none>"}`);
  }
  if (!acronyms || !fs.existsSync(acronyms)) {
    throw new Error(`acronyms not found: ${acronyms || "<none>"}`);
  }

  const fullRows = csvParse(fs.readFileSync(input, "utf8"), {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
  });
  const acronymRows = csvParse(fs.readFileSync(acronyms, "utf8"), {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
  });

  const byProductId = new Map();
  for (const row of acronymRows) {
    const productId = String(row.product_id || "").trim();
    if (!productId) continue;
    byProductId.set(productId, row);
  }

  const transformed = [];
  let changedRows = 0;
  let mappedProducts = 0;
  const usedProducts = new Set();

  for (const row of fullRows) {
    const productId = String(row.product_id || "").trim();
    const map = byProductId.get(productId);

    const supplierSource = map?.supplier_code || row.supplier_code || "XXX";
    const modelV2 =
      cleanAlnum(map?.acronyme_v2 || row.model_code).slice(0, 8) || "PRD";
    const rootV2 = buildRoot(supplierSource, modelV2);
    const puidV2 = replacePuidRoot(row.puid_propose, row.puid_root, rootV2);

    if (map) {
      usedProducts.add(productId);
    }

    const changed =
      String(row.model_code || "") !== modelV2 ||
      String(row.puid_root || "") !== rootV2 ||
      String(row.puid_propose || "") !== puidV2;

    if (changed) changedRows += 1;

    transformed.push({
      ...row,
      model_code_v2: modelV2,
      puid_root_v2: rootV2,
      puid_propose_v2: puidV2,
      acronym_status_v2: map?.status || "no_map",
      acronym_words_v2: map?.words_used || "",
      acronym_numbers_v2: map?.numbers_detected || "",
      changed_v2: changed ? "yes" : "no",
    });
  }

  mappedProducts = usedProducts.size;

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = path.join(
    outDir,
    `puid-full-export-with-acronymes-v2-${ts}.csv`,
  );

  const headers = [
    ...Object.keys(fullRows[0] || {}),
    "model_code_v2",
    "puid_root_v2",
    "puid_propose_v2",
    "acronym_status_v2",
    "acronym_words_v2",
    "acronym_numbers_v2",
    "changed_v2",
  ];

  writeCsv(transformed, headers, outPath);

  const stats = {
    input,
    acronyms,
    output: outPath,
    rows_total: transformed.length,
    products_mapped: mappedProducts,
    changed_rows: changedRows,
  };
  console.log(JSON.stringify(stats, null, 2));
}

try {
  main();
} catch (error) {
  console.error("apply-acronymes-to-puid-export failed:", error.message);
  process.exit(1);
}
