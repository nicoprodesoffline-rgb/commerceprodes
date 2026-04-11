#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { parse as csvParse } from "csv-parse/sync";

function argValue(name, fallback = "") {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] || fallback;
}

function stripAccents(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalize(value) {
  return stripAccents(value).toUpperCase();
}

function splitTokens(value) {
  return normalize(value)
    .split(/[^A-Z0-9]+/g)
    .map((t) => t.trim())
    .filter(Boolean);
}

function cleanAlnum(value) {
  return normalize(value).replace(/[^A-Z0-9]/g, "");
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

const ROW_TYPES = new Set(["simple", "mere", "produit_avec_variantes"]);
const TYPE_MAP = {
  simple: "simple",
  mere: "mere",
  produit_avec_variantes: "mere_candidate",
};

const WEAK_CODES = new Set([
  "",
  "E",
  "DEFAULT",
  "PRODUIT",
  "MODEL",
  "MERE",
  "LIGNE",
]);
const DROP_TAIL = new Set(["DEFAULT", "BIS", "TER", "QUATER"]);
const COLOR_SHORT = new Set([
  "BL",
  "BLE",
  "NO",
  "RO",
  "ROU",
  "VE",
  "BO",
  "BE",
  "GA",
  "GC",
  "JA",
  "RP",
  "OR",
]);
const STOPWORDS = new Set([
  "TABLE",
  "CHAISE",
  "BANC",
  "BANQUETTE",
  "LOT",
  "DE",
  "DES",
  "DU",
  "LA",
  "LE",
  "LES",
  "ET",
  "A",
  "AU",
  "AUX",
  "POUR",
  "AVEC",
  "SANS",
  "SUR",
  "EN",
  "OU",
  "X",
]);

function stripTrailingTech(parts) {
  const out = [...parts];
  while (out.length) {
    const t = out[out.length - 1];
    if (DROP_TAIL.has(t) || /^1+$/.test(t)) {
      out.pop();
      continue;
    }
    break;
  }
  return out;
}

function firstMeaningfulToken(tokens, supplier) {
  return (
    tokens.find(
      (t) =>
        t.length >= 3 &&
        t !== supplier &&
        !COLOR_SHORT.has(t) &&
        !/^1+$/.test(t),
    ) || ""
  );
}

function deriveFromSku(sku, supplier) {
  const tokens = splitTokens(sku);
  const cleaned = stripTrailingTech(tokens).filter((t) => t !== supplier);
  const first = firstMeaningfulToken(cleaned, supplier);
  if (first) return first.slice(0, 16);
  if (cleaned.length >= 2) return `${cleaned[0]}${cleaned[1]}`.slice(0, 16);
  if (cleaned.length === 1) return cleaned[0].slice(0, 16);
  return "";
}

function deriveFromDesignation(designation) {
  const tokens = splitTokens(designation).filter((t) => !STOPWORDS.has(t));
  if (!tokens.length) return "";
  const letters = tokens.find((t) => /[A-Z]/.test(t) && t.length >= 3) || "";
  const second =
    tokens.find((t) => t !== letters && /[A-Z]/.test(t) && t.length >= 3) || "";
  const n = tokens.find((t) => /^[0-9]{2,4}$/.test(t)) || "";
  const pieces = [letters.slice(0, 5), second.slice(0, 4), n].filter(Boolean);
  return pieces.join("").slice(0, 16);
}

function isWeak(code, supplier) {
  if (!code) return true;
  if (WEAK_CODES.has(code)) return true;
  if (code === supplier) return true;
  if (code.length < 3) return true;
  return false;
}

function getDimensionHint(text) {
  const src = normalize(text).replace(/,/g, ".");
  const dim = src.match(/\b([0-9]{2,4})\s*[X×]\s*([0-9]{2,4})\b/);
  if (dim) return `${dim[1]}X${dim[2]}`;

  const diam = src.match(/DIAM(?:ETRE)?\s*([0-9]{2,4})\b/);
  if (diam) return `D${diam[1]}`;

  const mm = src.match(/\b([0-9]{2,4})\s*MM\b/);
  if (mm) return `${mm[1]}MM`;

  const cm = src.match(/\b([0-9]{2,4})\s*CM\b/);
  if (cm) return `${cm[1]}CM`;

  const places = src.match(/\b([0-9]{1,2})\s*(?:PLACES?|VOIES?|ELEMENTS?)\b/);
  if (places) return `${places[1]}U`;

  return "";
}

function getSkuHint(sku, supplier, base) {
  const tokens = stripTrailingTech(splitTokens(sku)).filter(
    (t) => t !== supplier && t !== base,
  );
  for (const t of tokens) {
    if (t.length >= 2 && !COLOR_SHORT.has(t) && !/^1+$/.test(t))
      return t.slice(0, 8);
  }
  return "";
}

function escCsv(value) {
  const s = String(value ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function writeCsv(rows, headers, outPath) {
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => escCsv(row[h])).join(","));
  }
  fs.writeFileSync(outPath, lines.join("\n"), "utf8");
}

const input = argValue(
  "--input",
  "/Users/nico/Desktop/prodes_newsite_codex/docs/puid-full-export-2026-03-04T07-28-15-912Z.csv",
);
const outDir = argValue(
  "--out-dir",
  "/Users/nico/Desktop/prodes_newsite_codex/docs",
);

if (!fs.existsSync(input)) {
  console.error(`Input not found: ${input}`);
  process.exit(1);
}

const raw = fs.readFileSync(input, "utf8");
const allRows = csvParse(raw, {
  columns: true,
  skip_empty_lines: true,
  relax_column_count: true,
});

const productRows = allRows.filter(
  (r) =>
    r.entity_level === "product" &&
    ROW_TYPES.has(String(r.line_type || "").trim()),
);

const prepared = productRows.map((r) => {
  const supplier = cleanAlnum(r.supplier_code || "XXX").slice(0, 3) || "XXX";
  const current = cleanAlnum(r.model_code || "").slice(0, 16);

  let base = current;
  let source = "model_code";

  if (isWeak(base, supplier)) {
    base = deriveFromSku(r.sku_originel || "", supplier);
    source = "sku";
  }
  if (isWeak(base, supplier)) {
    base = deriveFromDesignation(r.designation || "");
    source = "designation";
  }
  if (isWeak(base, supplier)) {
    base = "TODO";
    source = "manual";
  }

  base = cleanAlnum(base).slice(0, 16) || "TODO";

  return {
    type_cible: TYPE_MAP[r.line_type] || r.line_type,
    line_type: r.line_type,
    product_id: r.product_id,
    designation: r.designation,
    sku_originel: r.sku_originel,
    supplier_code: supplier,
    acronyme_actuel: current,
    acronyme_base_propose: base,
    source_proposition: source,
    puid_root_actuel: r.puid_root || "",
  };
});

const group = new Map();
for (const row of prepared) {
  const key = `${row.supplier_code}|${row.acronyme_base_propose}`;
  if (!group.has(key)) group.set(key, []);
  group.get(key).push(row);
}

for (const list of group.values()) {
  const count = list.length;
  for (const row of list) {
    row.collision_count = count;
    row.acronyme_propose = row.acronyme_base_propose;
    row.collision_resolue_auto = "yes";
    row.note = "";
  }

  if (count <= 1) continue;

  const used = new Set();
  for (const row of list) {
    let candidate = row.acronyme_base_propose;
    const dimHint = getDimensionHint(
      `${row.designation || ""} ${row.sku_originel || ""}`,
    );
    const skuHint = getSkuHint(
      row.sku_originel || "",
      row.supplier_code,
      row.acronyme_base_propose,
    );

    if (dimHint)
      candidate = `${row.acronyme_base_propose}${dimHint}`.slice(0, 20);
    else if (skuHint)
      candidate = `${row.acronyme_base_propose}${skuHint}`.slice(0, 20);

    if (!used.has(candidate)) {
      row.acronyme_propose = candidate;
      used.add(candidate);
      row.collision_resolue_auto =
        candidate === row.acronyme_base_propose ? "no" : "yes";
      row.note =
        candidate === row.acronyme_base_propose
          ? "collision: review needed"
          : "collision: resolved with hint";
      continue;
    }

    // Could not auto-resolve cleanly without artificial increment.
    row.acronyme_propose = row.acronyme_base_propose;
    row.collision_resolue_auto = "no";
    row.note = "collision: unresolved (manual split needed)";
  }
}

prepared.sort((a, b) => {
  if (a.type_cible !== b.type_cible)
    return a.type_cible.localeCompare(b.type_cible);
  if (a.supplier_code !== b.supplier_code)
    return a.supplier_code.localeCompare(b.supplier_code);
  return (a.designation || "").localeCompare(b.designation || "");
});

const ts = new Date().toISOString().replace(/[:.]/g, "-");
const outPath = path.join(outDir, `puid-simples-meres-acronymes-${ts}.csv`);

writeCsv(
  prepared,
  [
    "type_cible",
    "line_type",
    "product_id",
    "designation",
    "sku_originel",
    "supplier_code",
    "acronyme_actuel",
    "acronyme_base_propose",
    "acronyme_propose",
    "source_proposition",
    "collision_count",
    "collision_resolue_auto",
    "note",
    "puid_root_actuel",
  ],
  outPath,
);

const stats = {
  total: prepared.length,
  simples: prepared.filter((r) => r.type_cible === "simple").length,
  meres: prepared.filter((r) => r.type_cible === "mere").length,
  meres_candidates: prepared.filter((r) => r.type_cible === "mere_candidate")
    .length,
  collisions: [...group.values()].filter((l) => l.length > 1).length,
  unresolved_collisions: prepared.filter((r) => r.note.includes("unresolved"))
    .length,
};

console.log(JSON.stringify({ outPath, stats }, null, 2));
