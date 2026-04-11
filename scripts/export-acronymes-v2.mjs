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

function upper(value) {
  return stripAccents(value).toUpperCase();
}

function cleanAlnum(value) {
  return upper(value).replace(/[^A-Z0-9]/g, "");
}

function uniq(values) {
  return [...new Set(values.filter(Boolean))];
}

function escCsv(value) {
  const s = String(value ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function csvWrite(rows, headers, outPath) {
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => escCsv(row[h])).join(","));
  }
  fs.writeFileSync(outPath, lines.join("\n"), "utf8");
}

function findLatestExport() {
  const docsDir = "/Users/nico/Desktop/prodes_newsite_codex/docs";
  const files = fs
    .readdirSync(docsDir)
    .filter((f) => /^puid-full-export-.*\.csv$/.test(f))
    .sort();
  if (!files.length) return "";
  return path.join(docsDir, files[files.length - 1]);
}

const STOPWORDS = new Set([
  "A",
  "AU",
  "AUX",
  "AVEC",
  "SANS",
  "DE",
  "DES",
  "DU",
  "D",
  "LA",
  "LE",
  "LES",
  "ET",
  "EN",
  "OU",
  "SUR",
  "POUR",
  "PAR",
  "UN",
  "UNE",
  "LOT",
  "GAMME",
  "VERSION",
]);

const GENERIC_NOUNS = new Set([
  "CHAISE",
  "TABLE",
  "BANC",
  "BANQUETTE",
  "CORBEILLE",
  "BARRIERE",
  "ARCEAU",
  "POTELET",
  "BORNE",
  "RANGE",
  "VELO",
  "RANGEVELO",
  "POUBELLE",
  "TENTE",
  "BARNUM",
  "ABRI",
  "MIROIR",
  "VITRINE",
  "PLOT",
  "PODIUM",
  "PLANCHER",
  "JEU",
  "PARCOURS",
  "COUSSIN",
  "SAC",
  "PACK",
  "LOT",
  "CHARIOT",
  "ENSEMBLE",
]);

const PROPER_HINTS = new Set([
  "KALINE",
  "HELENE",
  "MODO",
  "ESTEREL",
  "MARCA",
  "PRIMO",
  "KETTY",
  "VENISE",
  "FLORENCE",
  "CLUNY",
  "SALSA",
  "SIRTAM",
  "PRODISO",
  "ROCUBA",
  "VENUS",
  "KOPA",
  "CYBEL",
  "SANTIAGO",
  "ALICANTE",
  "POITEVINE",
  "BILBAO",
  "BALLADE",
  "TRADITION",
  "COLIBRI",
  "BORA",
  "LISBONNE",
  "CHARANTE",
  "TOURAINE",
  "RUSTIQUE",
  "SILOAS",
  "HEBA",
  "DOOGY",
  "HYGECA",
  "MODULO",
  "PRODES",
]);

function consonantize(word) {
  const w = upper(word).replace(/[^A-Z0-9]/g, "");
  if (!w) return "";
  const onlyConsonants = w.replace(/[AEIOUY]/g, "");
  if (!onlyConsonants) return w.slice(0, 5);
  return onlyConsonants.slice(0, 5);
}

function significantWords(words) {
  return words.filter(
    (w) => !STOPWORDS.has(w) && /^[A-Z0-9]+$/.test(w) && !/^\d+$/.test(w),
  );
}

function splitWords(text) {
  return upper(text)
    .split(/[^A-Z0-9]+/g)
    .map((w) => w.trim())
    .filter(Boolean);
}

function extractWithSansCodes(textRaw) {
  const text = upper(textRaw);
  const codes = [];

  if (/\bA\s+POSER\b/.test(text) || /\bA\s+FIXER\b/.test(text))
    codes.push("AP");
  if (/\bA\s+SCELLER\b/.test(text)) codes.push("AS");

  const regex = /\b(AVEC|SANS)\s+([A-Z]+)/g;
  for (const m of text.matchAll(regex)) {
    const mode = m[1] === "AVEC" ? "A" : "S";
    const target = m[2] || "";
    const first = target.replace(/[^A-Z0-9]/g, "").slice(0, 1);
    if (!first) continue;
    codes.push(`${mode}${first}`);
  }

  return uniq(codes);
}

function extractNumberTokens(textRaw) {
  const text = upper(textRaw).replace(/,/g, ".");
  const out = [];
  const toCm = (raw) => Math.round(Number(raw) * 100);

  // AxB dimensions
  for (const m of text.matchAll(/\b([0-9]{1,4})\s*[X×]\s*([0-9]{1,4})\b/g)) {
    out.push(`${Number(m[1])}X${Number(m[2])}`);
  }

  // AxB dimensions with explicit units (e.g. 2mx70cm, 3.5m x 4m)
  for (const m of text.matchAll(
    /\b([0-9]{1,4}(?:\.[0-9])?)\s*(MM|CM|M)\s*[X×]\s*([0-9]{1,4}(?:\.[0-9])?)\s*(MM|CM|M)\b/g,
  )) {
    const aRaw = Number(m[1]);
    const aUnit = m[2];
    const bRaw = Number(m[3]);
    const bUnit = m[4];
    const a =
      aUnit === "M"
        ? toCm(aRaw)
        : aUnit === "MM"
          ? Math.round(aRaw / 10)
          : Math.round(aRaw);
    const b =
      bUnit === "M"
        ? toCm(bRaw)
        : bUnit === "MM"
          ? Math.round(bRaw / 10)
          : Math.round(bRaw);
    out.push(`${a}X${b}`);
  }

  // Diametre / Ø
  for (const m of text.matchAll(/(?:\bDIAMETRE\b|Ø)\s*([0-9]{1,4})\b/g)) {
    out.push(`D${Number(m[1])}`);
  }

  // standalone sizes with unit
  for (const m of text.matchAll(
    /\b([0-9]{1,4}(?:\.[0-9])?)\s*(MM|CM|M|L)\b/g,
  )) {
    const raw = Number(m[1]);
    const unit = m[2];
    if (unit === "M") out.push(`${toCm(raw)}CM`);
    else if (unit === "CM") out.push(`${Math.round(raw)}CM`);
    else if (unit === "MM") out.push(`${Math.round(raw)}MM`);
    else if (unit === "L") out.push(`${Math.round(raw)}L`);
  }

  // fallback plain numbers
  for (const m of text.matchAll(/\b([0-9]{1,4})\b/g)) {
    out.push(String(Number(m[1])));
  }

  return uniq(out).slice(0, 6);
}

function detectProperWord(words) {
  const filtered = significantWords(words);

  for (const w of filtered) {
    if (PROPER_HINTS.has(w)) return w;
  }

  // heuristic: non-generic alpha word >= 5
  for (const w of filtered) {
    if (/^[A-Z]+$/.test(w) && w.length >= 5 && !GENERIC_NOUNS.has(w)) return w;
  }

  return "";
}

function wordChunk(word) {
  const w = cleanAlnum(word);
  if (!w) return "";
  if (PROPER_HINTS.has(w)) {
    return consonantize(w).slice(0, 3) || w.slice(0, 3);
  }
  if (w.length <= 3) return w;
  return w.slice(0, 2);
}

function selectAcronymWords(words) {
  const sig = significantWords(words);
  if (!sig.length) return [];

  const nonGeneric = sig.filter((w) => !GENERIC_NOUNS.has(w));
  const generic = sig.filter((w) => GENERIC_NOUNS.has(w));

  // Always use at least 2 words when possible.
  const selected = [];

  for (const w of nonGeneric) {
    if (!selected.includes(w)) selected.push(w);
    if (selected.length >= 3) break;
  }

  if (selected.length < 2) {
    for (const w of generic) {
      if (!selected.includes(w)) selected.push(w);
      if (selected.length >= 2) break;
    }
  }

  if (selected.length < 2) {
    for (const w of sig) {
      if (!selected.includes(w)) selected.push(w);
      if (selected.length >= 2) break;
    }
  }

  if (selected.length < 3) {
    for (const w of sig) {
      if (!selected.includes(w)) selected.push(w);
      if (selected.length >= 3) break;
    }
  }

  return selected.slice(0, 3);
}

function makeAlphaBase(words) {
  const selected = selectAcronymWords(words);
  if (!selected.length) return { base: "PRD", selectedWords: [] };

  let base = selected.map((w) => wordChunk(w)).join("");

  // If too short, enrich with initials from additional significant words.
  if (base.length < 4) {
    const sig = significantWords(words);
    const initials = sig
      .filter((w) => !selected.includes(w))
      .map((w) => w[0])
      .join("");
    base = (base + initials).slice(0, 8);
  }

  if (!base) base = "PRD";
  return { base: base.slice(0, 8), selectedWords: selected };
}

function fitSuffix(base, suffix) {
  const s = cleanAlnum(suffix).slice(0, 3);
  if (!s) return "";
  if ((base + s).length <= 8) return base + s;
  return base.slice(0, Math.max(1, 8 - s.length)) + s;
}

function disambiguationCandidates(row) {
  const out = [row.acronyme_v2];

  for (const w of row.__extra_words || []) {
    const c = fitSuffix(row.acronyme_v2, wordChunk(w));
    if (c) out.push(c);
  }

  for (const n of row.__number_tokens || []) {
    const c = fitSuffix(row.acronyme_v2, n);
    if (c) out.push(c);
  }

  const skuParts = splitWords(row.sku_originel || "").filter(
    (w) => !STOPWORDS.has(w) && !/^\d+$/.test(w),
  );
  for (const p of skuParts) {
    const c = fitSuffix(row.acronyme_v2, p);
    if (c) out.push(c);
  }

  return uniq(out);
}

function buildAcronymFromDesignation(designation) {
  const words = splitWords(designation);
  const numberTokens = extractNumberTokens(designation);
  const withSansCodes = extractWithSansCodes(designation);

  const proper = detectProperWord(words);
  const alpha = makeAlphaBase(words);
  const alphaBase = cleanAlnum(alpha.base).slice(0, 8);

  // Build with number priority under max 8
  let acr = alphaBase;
  for (const n of numberTokens) {
    const t = cleanAlnum(n);
    if (!t) continue;
    if ((acr + t).length <= 8) {
      acr += t;
      continue;
    }

    // Keep numbers priority: shorten alpha part first.
    const needed = t.length;
    if (needed >= 8) {
      acr = t.slice(0, 8);
    } else {
      const keepAlpha = Math.max(1, 8 - needed);
      acr = acr.slice(0, keepAlpha) + t;
    }
  }

  // add with/sans code if space remains
  for (const c of withSansCodes) {
    const t = cleanAlnum(c);
    if (!t) continue;
    if ((acr + t).length <= 8) acr += t;
  }

  if (!acr) acr = "PRD";
  acr = acr.slice(0, 8);

  return {
    acronyme_v2: acr,
    proper_word: proper,
    number_tokens: numberTokens.join("|"),
    with_sans_codes: withSansCodes.join("|"),
    alpha_base: alphaBase,
    words_used: alpha.selectedWords.join("|"),
    significant_words: significantWords(words).join("|"),
    __extra_words: significantWords(words).filter(
      (w) => !alpha.selectedWords.includes(w),
    ),
    __number_tokens: numberTokens,
  };
}

const input = argValue("--input", findLatestExport());
const outDir = argValue(
  "--out-dir",
  "/Users/nico/Desktop/prodes_newsite_codex/docs",
);

if (!input || !fs.existsSync(input)) {
  console.error(`Input not found: ${input || "<none>"}`);
  process.exit(1);
}

const rows = csvParse(fs.readFileSync(input, "utf8"), {
  columns: true,
  skip_empty_lines: true,
  relax_column_count: true,
});

const productRows = rows.filter(
  (r) =>
    r.entity_level === "product" &&
    ["simple", "mere", "produit_avec_variantes"].includes(
      String(r.line_type || "").trim(),
    ),
);

const prepared = productRows.map((r) => {
  const supplier = cleanAlnum(r.supplier_code || "XXX").slice(0, 3) || "XXX";
  const cur = cleanAlnum(r.model_code || "").slice(0, 32);
  const built = buildAcronymFromDesignation(r.designation || "");

  return {
    type_cible:
      r.line_type === "simple"
        ? "simple"
        : r.line_type === "mere"
          ? "mere"
          : "mere_candidate",
    product_id: r.product_id,
    designation: r.designation,
    sku_originel: r.sku_originel,
    supplier_code: supplier,
    acronyme_actuel: cur,
    acronyme_v2: built.acronyme_v2,
    alpha_base: built.alpha_base,
    proper_word: built.proper_word,
    words_used: built.words_used,
    significant_words: built.significant_words,
    numbers_detected: built.number_tokens,
    with_sans_codes: built.with_sans_codes,
    puid_root_actuel: r.puid_root || "",
    __extra_words: built.__extra_words,
    __number_tokens: built.__number_tokens,
  };
});

// First pass groups by supplier + generated acronym.
const initialGroups = new Map();
for (const r of prepared) {
  const key = `${r.supplier_code}|${r.acronyme_v2}`;
  if (!initialGroups.has(key)) initialGroups.set(key, []);
  initialGroups.get(key).push(r);
}

// Disambiguate collisions with additional designation words/numbers (no -2/-3 suffixes).
for (const [key, list] of initialGroups.entries()) {
  if (list.length <= 1) continue;
  const supplier = key.split("|")[0];

  const reserved = new Set();
  for (const row of prepared) {
    if (row.supplier_code !== supplier) continue;
    const k = `${row.supplier_code}|${row.acronyme_v2}`;
    if ((initialGroups.get(k)?.length || 0) === 1)
      reserved.add(row.acronyme_v2);
  }

  for (const row of list) {
    const candidate =
      disambiguationCandidates(row).find((c) => c && !reserved.has(c)) ||
      row.acronyme_v2;
    row.acronyme_v2 = candidate;
    reserved.add(candidate);
  }
}

// Final groups/collision status.
const finalGroups = new Map();
for (const r of prepared) {
  const key = `${r.supplier_code}|${r.acronyme_v2}`;
  if (!finalGroups.has(key)) finalGroups.set(key, []);
  finalGroups.get(key).push(r);
}

for (const r of prepared) {
  const key = `${r.supplier_code}|${r.acronyme_v2}`;
  const count = finalGroups.get(key)?.length || 0;
  r.collision_count = count;
  r.status =
    count > 1
      ? "review_collision"
      : r.acronyme_actuel === r.acronyme_v2
        ? "keep"
        : "propose";
}

prepared.sort((a, b) => {
  if (a.type_cible !== b.type_cible)
    return a.type_cible.localeCompare(b.type_cible);
  if (a.supplier_code !== b.supplier_code)
    return a.supplier_code.localeCompare(b.supplier_code);
  return (a.designation || "").localeCompare(b.designation || "");
});

const ts = new Date().toISOString().replace(/[:.]/g, "-");
const outAll = path.join(outDir, `newsite-acronymes-v2-${ts}.csv`);
const outCollisions = path.join(
  outDir,
  `newsite-acronymes-v2-${ts}-collisions.csv`,
);

csvWrite(
  prepared,
  [
    "type_cible",
    "product_id",
    "designation",
    "sku_originel",
    "supplier_code",
    "acronyme_actuel",
    "acronyme_v2",
    "alpha_base",
    "proper_word",
    "words_used",
    "significant_words",
    "numbers_detected",
    "with_sans_codes",
    "collision_count",
    "status",
    "puid_root_actuel",
  ],
  outAll,
);

const collisions = prepared.filter((r) => Number(r.collision_count) > 1);
csvWrite(
  collisions,
  [
    "type_cible",
    "product_id",
    "designation",
    "sku_originel",
    "supplier_code",
    "acronyme_actuel",
    "acronyme_v2",
    "alpha_base",
    "proper_word",
    "words_used",
    "significant_words",
    "numbers_detected",
    "with_sans_codes",
    "collision_count",
    "status",
    "puid_root_actuel",
  ],
  outCollisions,
);

const stats = {
  input,
  out_all: outAll,
  out_collisions: outCollisions,
  total_products: prepared.length,
  simple: prepared.filter((r) => r.type_cible === "simple").length,
  mere: prepared.filter((r) => r.type_cible === "mere").length,
  mere_candidate: prepared.filter((r) => r.type_cible === "mere_candidate")
    .length,
  collision_rows: collisions.length,
  collision_groups: new Set(
    collisions.map((r) => `${r.supplier_code}|${r.acronyme_v2}`),
  ).size,
};

console.log(JSON.stringify(stats, null, 2));
