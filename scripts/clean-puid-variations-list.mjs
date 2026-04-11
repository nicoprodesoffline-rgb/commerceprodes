#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { parse as csvParse } from "csv-parse/sync";

const DEFAULT_INPUT =
  "/Users/nico/Desktop/prodes_newsite_codex/docs/puid-variations-list-2026-03-05T16-41-06-280Z.csv";
const DOCS_DIR = "/Users/nico/Desktop/prodes_newsite_codex/docs";
const COLOR_MAP_PATH = path.join(DOCS_DIR, "puid-color-map-proposal-v1.csv");
const VALUE_MAP_PATH = path.join(
  DOCS_DIR,
  "webtoffee-pa-non-color-values-map-v11.csv",
);
const SOURCE_PATH = path.join(DOCS_DIR, "270226.csv");
const LEGACY_PATH = path.join(
  DOCS_DIR,
  "puid-full-export-with-acronymes-v2-2026-03-05T10-09-51-179Z.csv",
);

function argValue(name, fallback = "") {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] || fallback;
}

function csvEscape(value) {
  const s = String(value ?? "");
  if (/[,"\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function writeCsv(rows, headers, outPath) {
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((header) => csvEscape(row[header])).join(","));
  }
  fs.writeFileSync(outPath, lines.join("\n"), "utf8");
}

function normalizeLoose(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/_/g, "")
    .replace(/-/g, "")
    .replace(/\//g, "+")
    .replace(/[^A-Z0-9+]/g, "");
}

function normalizeToken(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/\//g, "+")
    .replace(/[^A-Z0-9+]/g, "");
}

function loadCsv(filePath) {
  return csvParse(fs.readFileSync(filePath, "utf8"), {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    relax_quotes: true,
  });
}

function splitBranch(branch, separators) {
  let current = [String(branch || "")];
  for (const separator of separators) {
    current = current.flatMap((part) => part.split(separator));
  }
  return current.map((token) => token.trim()).filter(Boolean);
}

function isStructuredToken(token) {
  return [
    /^(?:D\d+(?:H\d+)?|L\d+CM|H\d+CM)$/u,
    /^\d+(?:X\d+)+$/u,
    /^\d+(?:MM|CM|M|L|VO|EL|PL)$/u,
    /^PACK\d+$/u,
    /^M[124](?:PY|TI)?$/u,
    /^(?:M[124]D\d+|D\d+M[124])(?:AA|SA|AV|SN|AC|SC)?$/u,
    /^[AS][A-Z]{1,3}$/u,
    /^FB$/u,
    /^FG$/u,
  ].some((pattern) => pattern.test(token));
}

function colorFamily(token) {
  const value = normalizeToken(token);
  const families = new Map([
    ["BLAN", "BLAN"],
    ["BLEU", "BLEU"],
    ["NOIR", "NOIR"],
    ["ROUGE", "ROUGE"],
    ["VERT", "VERT"],
    ["GRIS", "GRIS"],
    ["JAUN", "JAUN"],
    ["BEIG", "BEIG"],
    ["BORD", "ROUGE"],
    ["GRCL", "GRIS"],
    ["GRPR", "GRIS"],
    ["GRAN", "GRIS"],
    ["VEAN", "VERT"],
    ["CORT", "CORT"],
    ["SAUM", "ROUGE"],
    ["TAUP", "MARR"],
    ["MAGE", "ROUGE"],
    ["MAUV", "ROUGE"],
    ["MARR", "MARR"],
    ["ORAN", "ORAN"],
    ["ROSE", "ROUGE"],
  ]);
  return families.get(value) || value;
}

function colorSpecificity(token) {
  const value = normalizeToken(token);
  const generic = new Set([
    "BLAN",
    "BLEU",
    "NOIR",
    "ROUGE",
    "VERT",
    "GRIS",
    "JAUN",
  ]);
  return generic.has(value) ? 1 : 2;
}

function dedupeColorTokens(tokens) {
  const kept = [];
  for (const rawToken of tokens) {
    const token = normalizeToken(rawToken);
    if (!token) continue;
    if (token.includes("+")) {
      pushUnique(kept, token);
      continue;
    }
    const family = colorFamily(token);
    const existingIdx = kept.findIndex(
      (candidate) =>
        !candidate.includes("+") && colorFamily(candidate) === family,
    );
    if (existingIdx === -1) {
      pushUnique(kept, token);
      continue;
    }
    if (colorSpecificity(token) > colorSpecificity(kept[existingIdx])) {
      kept[existingIdx] = token;
    }
  }
  return kept;
}

function loadMaps() {
  const colorRows = loadCsv(COLOR_MAP_PATH);
  const valueRows = loadCsv(VALUE_MAP_PATH);

  const colorAliasToAbbr = new Map();
  const colorAbbrs = new Set();
  for (const row of colorRows) {
    const abbr = normalizeToken(row.abbr_propose);
    if (!abbr) continue;
    colorAbbrs.add(abbr);
    for (const raw of [
      row.alias_detecte,
      row.canonique_propose,
      row.abbr_propose,
    ]) {
      const key = normalizeLoose(raw);
      if (key) colorAliasToAbbr.set(key, abbr);
    }
  }

  colorAliasToAbbr.set("GRISANTH", "GRAN");
  colorAliasToAbbr.set("GRISANTHRACITE", "GRAN");
  colorAliasToAbbr.set("GRISPROCITY", "GRPR");
  colorAliasToAbbr.set("GRISMANGANESE", "GRMN");
  colorAliasToAbbr.set("GRISMANGANESE54144", "GRMN");
  colorAliasToAbbr.set("GRISCIMENTRAL7033", "GRCI");
  colorAliasToAbbr.set("GRISCIMENTRAL703356520", "GRCI");
  colorAliasToAbbr.set("VERTANGLAIS", "VEAN");
  colorAliasToAbbr.set("VERTOLIVERAL6003", "VEOL");
  colorAliasToAbbr.set("VERTOLIVERAL600358223", "VEOL");
  colorAliasToAbbr.set("VERTOLIVERAL600359141", "VEOL");
  colorAliasToAbbr.set("VERTFONCEPANTONE3415C", "VEFO");
  colorAliasToAbbr.set("VERTPASTELPANTONE367C", "VEPA");
  colorAliasToAbbr.set("BLEUFONCERAL5005", "BLFO");
  colorAliasToAbbr.set("BLEUOUTREMERRAL5002", "R5002");
  colorAliasToAbbr.set("BLEUOUTREMERRAL500254146", "R5002");
  colorAliasToAbbr.set("BLEUPASTELPANTONE278C", "BLPA");
  colorAliasToAbbr.set("BLEUTURQUOISERAL5018", "BLTU");
  colorAliasToAbbr.set("ASPECTCORTEN", "CORT");
  colorAliasToAbbr.set("PLASTIQUEJAUNECOLZARAL1021", "JAUN");
  colorAliasToAbbr.set("JAUNERAL1018", "JAUN");
  colorAliasToAbbr.set("JAUNECOLZARAL1021", "JAUN");
  colorAliasToAbbr.set("ANTHRACITEMATTEXTURE", "ANTH");
  colorAliasToAbbr.set("ANTHRACITEMATTEXTURE59141", "ANTH");
  colorAliasToAbbr.set("RAL7016", "ANTH");
  colorAliasToAbbr.set("BL", "BLAN");
  colorAliasToAbbr.set("BLA", "BLAN");
  colorAliasToAbbr.set("BLE", "BLEU");
  colorAliasToAbbr.set("NO", "NOIR");
  colorAliasToAbbr.set("NOI", "NOIR");
  colorAliasToAbbr.set("RO", "ROUGE");
  colorAliasToAbbr.set("ROU", "ROUGE");
  colorAliasToAbbr.set("VE", "VERT");
  colorAliasToAbbr.set("VER", "VERT");
  colorAliasToAbbr.set("VA", "VEAN");
  colorAliasToAbbr.set("JA", "JAUN");
  colorAliasToAbbr.set("JAU", "JAUN");
  colorAliasToAbbr.set("BE", "BEIG");
  colorAliasToAbbr.set("BEI", "BEIG");
  colorAliasToAbbr.set("BO", "BORD");
  colorAliasToAbbr.set("BOR", "BORD");
  colorAliasToAbbr.set("GA", "GRAN");
  colorAliasToAbbr.set("GC", "GRCL");
  colorAliasToAbbr.set("GR", "GRIS");
  colorAliasToAbbr.set("GRI", "GRIS");
  colorAliasToAbbr.set("GM", "GRMN");
  colorAliasToAbbr.set("RP", "ROSE");
  colorAliasToAbbr.set("SP", "SAUM");

  for (const abbr of [
    "BLAN",
    "BLEU",
    "NOIR",
    "ROUGE",
    "ROUG",
    "VERT",
    "GRIS",
    "JAUN",
    "BEIG",
    "BORD",
    "GRAN",
    "GRCL",
    "GRPR",
    "GRMN",
    "MARR",
    "ROSE",
    "SAUM",
    "CORT",
    "ANTH",
    "VEAN",
    "VEFO",
    "VEPA",
    "VEOL",
    "BLFO",
    "BLPA",
    "BLTU",
    "MAGE",
    "MAUV",
    "VIOL",
    "R5002",
  ]) {
    colorAliasToAbbr.set(abbr, abbr);
    colorAbbrs.add(abbr);
  }

  const allowedValueTokens = new Set();
  const valueAliasToAbbr = new Map();
  for (const row of valueRows) {
    const abbr = normalizeToken(row.abbr_value_propose);
    if (abbr) allowedValueTokens.add(abbr);
    const originalKey = normalizeLoose(row.value_original);
    if (originalKey && abbr) valueAliasToAbbr.set(originalKey, abbr);
  }

  valueAliasToAbbr.set("CARRE", "CARR");
  valueAliasToAbbr.set("CARREE", "CARR");
  valueAliasToAbbr.set("RONDE", "ROND");
  valueAliasToAbbr.set("RECTANGULAIRE", "RECT");
  valueAliasToAbbr.set("CHROME", "CHRO");
  valueAliasToAbbr.set("CHROME", "CHRO");
  valueAliasToAbbr.set("CHROME", "CHRO");
  valueAliasToAbbr.set("PLEXI", "PLEX");

  return { colorAliasToAbbr, colorAbbrs, allowedValueTokens, valueAliasToAbbr };
}

function normalizeSourceSku(sku) {
  return String(sku || "")
    .trim()
    .replace(/-L\d+$/u, "");
}

function loadSourceIndex() {
  const rows = loadCsv(SOURCE_PATH);
  const exact = new Map();
  const fallback = new Map();

  for (const row of rows) {
    const baseSku = normalizeSourceSku(row.sku);
    if (baseSku && !exact.has(baseSku)) exact.set(baseSku, row);
    const trimmedNumeric = baseSku.replace(/-\d+$/u, "");
    if (
      trimmedNumeric &&
      trimmedNumeric !== baseSku &&
      !fallback.has(trimmedNumeric)
    ) {
      fallback.set(trimmedNumeric, row);
    }
  }

  return { exact, fallback };
}

function loadLegacyIndex() {
  if (!fs.existsSync(LEGACY_PATH)) return new Map();
  const rows = loadCsv(LEGACY_PATH);
  const index = new Map();
  for (const row of rows) {
    const sku = String(row.sku_originel || row.sku_de_base || "").trim();
    if (sku && !index.has(sku)) index.set(sku, row);
  }
  return index;
}

function findSourceRow(sku, sourceIndex) {
  const baseSku = normalizeSourceSku(sku);
  if (sourceIndex.exact.has(baseSku)) return sourceIndex.exact.get(baseSku);

  const trimmedNumeric = baseSku.replace(/-\d+$/u, "");
  if (sourceIndex.exact.has(trimmedNumeric))
    return sourceIndex.exact.get(trimmedNumeric);
  if (sourceIndex.fallback.has(trimmedNumeric))
    return sourceIndex.fallback.get(trimmedNumeric);

  return null;
}

function canonicalizeColorToken(token, colorAliasToAbbr) {
  const parts = String(token || "")
    .split("+")
    .map((part) => normalizeLoose(part))
    .filter(Boolean);
  if (!parts.length) return null;

  const mapped = [];
  for (const part of parts) {
    const abbr = colorAliasToAbbr.get(part);
    if (!abbr) return null;
    if (!mapped.includes(abbr)) mapped.push(abbr);
  }
  return mapped.join("+");
}

function decomposeKnownToken(token, allowedTokens) {
  const target = normalizeToken(token);
  if (!target) return null;
  const matches = Array.from(allowedTokens).sort((a, b) => b.length - a.length);
  const memo = new Map();

  function walk(index) {
    if (index === target.length) return [];
    if (memo.has(index)) return memo.get(index);
    for (const candidate of matches) {
      if (!candidate) continue;
      if (!target.startsWith(candidate, index)) continue;
      const tail = walk(index + candidate.length);
      if (tail) {
        const result = [candidate, ...tail];
        memo.set(index, result);
        return result;
      }
    }
    memo.set(index, null);
    return null;
  }

  const result = walk(0);
  return result && result.length > 1 ? result : null;
}

function looksLikeSkuLeftover(token, sku) {
  const normalizedToken = normalizeToken(token);
  const normalizedSku = normalizeToken(sku);
  if (!normalizedToken || !normalizedSku) return false;
  if (normalizedToken === normalizedSku) return true;
  if (normalizedToken.length >= 4 && normalizedSku.includes(normalizedToken))
    return true;
  if (normalizedToken.length >= 5 && normalizedSku.startsWith(normalizedToken))
    return true;
  if (normalizedSku.length >= 5 && normalizedToken.startsWith(normalizedSku))
    return true;
  return /^[A-Z]{3,}\d+[A-Z0-9]*$/u.test(normalizedToken);
}

function sourceColorToken(sourceRow, maps) {
  if (!sourceRow) return "";
  const colorFields = [
    "meta:attribute_pa_coloris",
    "meta:attribute_pa_couleurs",
    "meta:attribute_pa_couleurs-pietements",
    "meta:attribute_pa_couleurs-plateau",
  ];

  for (const field of colorFields) {
    const value = String(sourceRow[field] || "").trim();
    if (!value) continue;
    const direct = canonicalizeColorToken(value, maps.colorAliasToAbbr);
    if (direct) return direct;
    const normalized = normalizeLoose(value);
    if (maps.colorAliasToAbbr.has(normalized))
      return maps.colorAliasToAbbr.get(normalized);

    const patternMap = [
      [/BLEUFONCE.*5005/u, "BLFO"],
      [/BLEUOUTREMER.*5002/u, "R5002"],
      [/BLEUPASTEL.*278C/u, "BLPA"],
      [/VERTFONCE.*3415/u, "VEFO"],
      [/VERTPASTEL.*367C/u, "VEPA"],
      [/VERTOLIVE.*6003/u, "VEOL"],
      [/BICOLORE.*GRIS.*MARRON/u, "GRIS+MARR"],
      [/GRISCIMENT.*7033/u, "GRCI"],
      [/BLEUTURQUOISE.*5018/u, "BLTU"],
      [/GRISMANGANESE/u, "GRMN"],
      [/JAUNE.*1018/u, "JAUN"],
      [/JAUNECOLZA.*1021/u, "JAUN"],
      [/ANTHRACITE/u, "ANTH"],
    ];
    for (const [pattern, abbr] of patternMap) {
      if (pattern.test(normalized)) return abbr;
    }

    const ralMatch = normalized.match(/RAL(\d{4})/u);
    if (ralMatch) return `R${ralMatch[1]}`;
  }

  return "";
}

function sourceStyleToken(sourceRow) {
  if (!sourceRow) return "";
  const optionValue = normalizeLoose(
    sourceRow["meta:attribute_pa_option_2026"],
  );
  if (!optionValue) return "";
  if (optionValue.includes("FACADEBLANCHE")) return "FB";
  if (optionValue.includes("FACADEGRISE")) return "FG";
  if (optionValue.includes("LATTESRECYCLEESGRISES")) return "LRM";
  if (optionValue.includes("LATTESMARRON")) return "LM";
  return "";
}

function styleFromEncodedSku(sku) {
  const value = String(sku || "").trim();
  if (!value.startsWith("P-") || !value.includes(".")) return "";
  return value.split(".").slice(1).join(".").trim();
}

function pushUnique(list, value) {
  if (value && !list.includes(value)) list.push(value);
}

function cleanImpact(rawImpact, sku, maps) {
  const { colorAliasToAbbr, colorAbbrs, allowedValueTokens, valueAliasToAbbr } =
    maps;
  const keptImpact = [];
  const movedColors = [];

  for (const rawToken of splitBranch(rawImpact, [".", "-"])) {
    const aliasAbbr = valueAliasToAbbr.get(normalizeLoose(rawToken));
    const token = aliasAbbr || normalizeToken(rawToken);
    if (!token || token === "BASE" || token === "BASESTYLE") continue;

    const colorToken = canonicalizeColorToken(token, colorAliasToAbbr);
    if (colorToken) {
      pushUnique(movedColors, colorToken);
      continue;
    }

    if (allowedValueTokens.has(token) || isStructuredToken(token)) {
      pushUnique(keptImpact, token);
      continue;
    }

    if (looksLikeSkuLeftover(token, sku)) continue;

    const decomposed = decomposeKnownToken(
      token,
      new Set([...allowedValueTokens, ...colorAbbrs]),
    );
    if (decomposed) {
      for (const part of decomposed) {
        if (colorAbbrs.has(part)) pushUnique(movedColors, part);
        else pushUnique(keptImpact, part);
      }
      continue;
    }

    if (!looksLikeSkuLeftover(token, sku)) pushUnique(keptImpact, token);
  }

  return { impact: keptImpact.join("-"), movedColors };
}

function cleanStyle(rawStyle, sku, maps) {
  const { colorAliasToAbbr, colorAbbrs, allowedValueTokens, valueAliasToAbbr } =
    maps;
  const attrTokens = [];
  const colorTokens = [];

  for (const rawToken of splitBranch(rawStyle, ["."])) {
    const aliasAbbr = valueAliasToAbbr.get(normalizeLoose(rawToken));
    const token = aliasAbbr || normalizeToken(rawToken);
    if (!token || token === "BASE" || token === "BASESTYLE") continue;

    const colorToken = canonicalizeColorToken(token, colorAliasToAbbr);
    if (colorToken) {
      pushUnique(colorTokens, colorToken);
      continue;
    }

    if (allowedValueTokens.has(token) || isStructuredToken(token)) {
      pushUnique(attrTokens, token);
      continue;
    }

    if (looksLikeSkuLeftover(token, sku)) continue;

    const decomposed = decomposeKnownToken(
      token,
      new Set([...allowedValueTokens, ...colorAbbrs]),
    );
    if (decomposed) {
      const colorParts = [];
      const attrParts = [];
      for (const part of decomposed) {
        if (colorAbbrs.has(part)) colorParts.push(part);
        else attrParts.push(part);
      }
      if (colorParts.length) pushUnique(colorTokens, colorParts.join("+"));
      for (const part of attrParts) pushUnique(attrTokens, part);
      continue;
    }

    if (!looksLikeSkuLeftover(token, sku)) pushUnique(attrTokens, token);
  }

  const mergedColors = [];
  for (const token of dedupeColorTokens(colorTokens)) {
    if (token.includes("+")) {
      const deduped = [];
      for (const part of token.split("+")) pushUnique(deduped, part);
      pushUnique(mergedColors, deduped.join("+"));
    } else {
      pushUnique(mergedColors, token);
    }
  }

  return [...attrTokens, ...mergedColors].join(".");
}

function buildFinalPuid(mother, impact, style) {
  let out = String(mother || "").trim();
  if (impact) out += `-${impact}`;
  if (style) out += `.${style}`;
  return out;
}

function cleanupStyleWithSource(currentStyle, sourceRow, maps) {
  const kept = [];
  const sourceColor = sourceColorToken(sourceRow, maps);
  const hasSourceColor = Boolean(sourceColor);

  for (const rawToken of splitBranch(currentStyle, ["."])) {
    const token = normalizeToken(rawToken);
    if (!token || token === "BASE" || token === "BASESTYLE") continue;
    if (/^N\d+[A-Z0-9]*$/u.test(token)) continue;

    const canonicalColor = canonicalizeColorToken(token, maps.colorAliasToAbbr);
    const isColorLike = Boolean(canonicalColor);
    if (hasSourceColor && isColorLike) continue;
    if (!hasSourceColor && canonicalColor) {
      pushUnique(kept, canonicalColor);
      continue;
    }

    pushUnique(kept, token);
  }

  const extraStyle = sourceStyleToken(sourceRow);
  if (extraStyle) pushUnique(kept, extraStyle);

  if (sourceColor) pushUnique(kept, sourceColor);

  return kept.join(".");
}

function extractNumericToken(value) {
  const normalized = normalizeLoose(value);
  if (!normalized) return "";
  const match = normalized.match(/(\d+(?:X\d+)?)/u);
  return match ? match[1] : "";
}

function overrideImpact(row, currentImpact, currentStyle, sourceRow) {
  const mother = row.puid_de_la_mere;
  const sku = row.sku_de_base;

  if (mother === "P-C2E-ASDEMA" || currentImpact === "LONG") {
    const fromSource = extractNumericToken(
      sourceRow?.["meta:attribute_pa_option_2026"],
    );
    if (fromSource) return fromSource;
    const fromStyle = String(currentStyle || "").match(/N(\d+(?:X\d+)?)/u);
    if (fromStyle) return fromStyle[1];
  }

  if (mother === "P-ADP-PIBA") {
    const fromDimension = extractNumericToken(
      sourceRow?.["meta:attribute_pa_dimension"],
    );
    if (fromDimension) return fromDimension;
    const fromTitle = extractNumericToken(sourceRow?.post_title);
    if (fromTitle) return fromTitle;
  }

  if (mother === "P-STS-SIM2CH") {
    const title = normalizeLoose(sourceRow?.post_title);
    if (title.includes("ASSEMBLABLELIAISONAMOVIBLE")) return "ASLI";
    if (title.includes("NONASSEMBLABLE")) return "NOAS";
  }

  return currentImpact;
}

function fallbackStyle(row, cleanedStyle, sourceRow, legacyRow, maps) {
  const legacyStyle = cleanStyle(
    String(legacyRow?.style_branch || legacyRow?.branche_style || ""),
    row.sku_de_base,
    maps,
  );
  const sourceColorPresent = Boolean(sourceColorToken(sourceRow, maps));

  if (row.puid_de_la_mere === "P-LCE-RE147170" && legacyStyle) {
    return legacyStyle;
  }

  if (legacyStyle) {
    const degradedPlus =
      !sourceColorPresent &&
      cleanedStyle.includes("+") &&
      !legacyStyle.includes("+");
    const degradedGm =
      /(^|\.)GM(\.|$)/u.test(cleanedStyle) &&
      !/(^|\.)GM(\.|$)/u.test(legacyStyle);
    if (degradedPlus || degradedGm) return legacyStyle;
  }

  const encodedStyle = styleFromEncodedSku(row.sku_de_base);
  if (!sourceRow && encodedStyle) return encodedStyle;
  return cleanedStyle;
}

function main() {
  const inputPath = argValue("--input", DEFAULT_INPUT);
  const outPath = argValue(
    "--output",
    inputPath.replace(/\.csv$/u, "-clean.csv"),
  );

  if (!fs.existsSync(inputPath)) {
    throw new Error(`input csv not found: ${inputPath}`);
  }

  const maps = loadMaps();
  const sourceIndex = loadSourceIndex();
  const legacyIndex = loadLegacyIndex();
  const rows = loadCsv(inputPath);
  const cleanedRows = [];
  let impactBaseRemoved = 0;
  let styleSkuJunkRemoved = 0;
  let dedupedColors = 0;

  for (const row of rows) {
    const originalImpact = String(row.branche_impact || "");
    const originalStyle = String(row.branche_style || "");
    const sourceRow = findSourceRow(row.sku_de_base, sourceIndex);
    const legacyRow = legacyIndex.get(row.sku_de_base) || null;

    const impactResult = cleanImpact(originalImpact, row.sku_de_base, maps);
    const styleSeed = [originalStyle, ...impactResult.movedColors]
      .filter(Boolean)
      .join(".");
    const genericStyle = cleanStyle(styleSeed, row.sku_de_base, maps);
    const cleanedImpact = overrideImpact(
      row,
      impactResult.impact,
      genericStyle,
      sourceRow,
    );
    const sourceAwareStyle = cleanupStyleWithSource(
      genericStyle,
      sourceRow,
      maps,
    );
    const cleanedStyle = fallbackStyle(
      row,
      sourceAwareStyle,
      sourceRow,
      legacyRow,
      maps,
    );
    const cleanedFinal = buildFinalPuid(
      row.puid_de_la_mere,
      cleanedImpact,
      cleanedStyle,
    );

    if (originalImpact === "BASE" && !cleanedImpact) impactBaseRemoved += 1;
    if (originalStyle && !cleanedStyle) styleSkuJunkRemoved += 1;
    if (
      originalStyle !== cleanedStyle &&
      /BLANC|NOIR|ROUGE|VERT|BLEU|BEIGE|BORDEAUX|MARRON|GRIS/u.test(
        originalStyle,
      )
    ) {
      dedupedColors += 1;
    }

    cleanedRows.push({
      type: row.type,
      sku_de_base: row.sku_de_base,
      puid_de_la_mere: row.puid_de_la_mere,
      branche_impact: cleanedImpact,
      branche_style: cleanedStyle,
      puid_final: cleanedFinal,
      dimensions_ne_changent_pas_le_prix:
        row.dimensions_ne_changent_pas_le_prix,
    });
  }

  writeCsv(
    cleanedRows,
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

  console.log(
    JSON.stringify(
      {
        input: inputPath,
        output: outPath,
        rows: cleanedRows.length,
        impact_base_removed: impactBaseRemoved,
        style_junk_removed: styleSkuJunkRemoved,
        color_cleanup_rows: dedupedColors,
      },
      null,
      2,
    ),
  );
}

main();
