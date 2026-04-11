#!/usr/bin/env node
/**
 * Refine a full PUID export with stricter business rules + DB attributes.
 *
 * Input : docs/puid-full-export-*.csv
 * Output: docs/puid-full-export-*-v5.csv
 *
 * Usage:
 *   node scripts/refine-puid-from-export.mjs --input ../docs/puid-full-export-2026-03-03T13-38-10-962Z.csv
 */

import fs from "node:fs";
import path from "node:path";
import { parse as csvParse } from "csv-parse/sync";
import { createClient } from "@supabase/supabase-js";

function argValue(name, fallback = "") {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] || fallback;
}

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.trim().startsWith("#")) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const key = match[1];
    if (process.env[key]) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function stripAccents(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalize(value) {
  return stripAccents(String(value || "")).toLowerCase();
}

function uniq(values) {
  return [...new Set(values.filter(Boolean))];
}

function tokenClean(value) {
  return stripAccents(String(value || ""))
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "");
}

function tokenKeepDash(value) {
  return stripAccents(String(value || ""))
    .toUpperCase()
    .replace(/[^A-Z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function tokenKeepDashPlus(value) {
  return stripAccents(String(value || ""))
    .toUpperCase()
    .replace(/[^A-Z0-9-+]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/\++/g, "+")
    .replace(/^[-+]+|[-+]+$/g, "");
}

function escCsv(value) {
  const s = String(value ?? "");
  if (/[,"\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function csvStringify(rows, headers) {
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => escCsv(row[h])).join(","));
  }
  return lines.join("\n");
}

function parseRootParts(puidRoot) {
  const m = String(puidRoot || "").match(/^P-([A-Z0-9]+)-(.+)$/);
  if (!m) return { supplier: "", model: "" };
  return { supplier: m[1], model: m[2] };
}

function detectFamily(row) {
  const txt = normalize(
    `${row.designation} ${row.sku_originel} ${row.puid_propose}`,
  );
  const sku = String(row.sku_originel || "").toUpperCase();

  if (txt.trim() === "default") return "generic";
  if (txt.includes("poids de lestage")) return "generic";

  if (txt.includes("chaise marca")) return "marca";
  if (txt.includes("chaise kaline")) return "kaline";
  if (txt.includes("coque helene")) return "coque_helene";
  if (txt.includes("iso polypro")) return "iso_polypro";
  if (txt.includes("chaise ketty") || sku.startsWith("GMCKM")) return "ketty";

  if (txt.includes("tables universelles rondes") || sku.startsWith("SODTUR"))
    return "table_universelle";

  if (
    txt.includes("corbeille a poser ou a fixer zeno brik") ||
    sku.startsWith("ROZENR")
  )
    return "zeno_brik";

  if (
    txt.includes("venus - poubelle de tri selectif") ||
    sku.startsWith("ROVEN")
  )
    return "venus";

  if (txt.includes("borne de tri selectif 75l") || sku.startsWith("ROCUBA75"))
    return "rocuba";
  if (txt.includes("corbeille tri selectif") || sku.startsWith("ADCTSC"))
    return "corbeille_tri_selectif";

  if (txt.includes("abri velos modulo") || sku.startsWith("PROABM"))
    return "abri_modulo";
  if (
    txt.includes("banc modo") ||
    sku.startsWith("LCE-BM") ||
    sku.startsWith("LCEBM08")
  )
    return "banc_modo";
  if (
    txt.includes("comptoir pliant acier") ||
    txt.includes("comptoir pliant alu") ||
    sku.startsWith("E-STCP") ||
    sku.startsWith("LEICPA")
  )
    return "comptoir";
  if (txt.includes("parcours de sante bois")) return "parcours_sante";
  if (
    txt.includes("barrieres de chantier telescopiques") ||
    sku.startsWith("MOBCT")
  )
    return "barriere_chantier";
  if (txt.includes("jeu araignee") || sku.startsWith("LCEJAR"))
    return "jeu_araignee";
  if (
    txt.includes("poteaux cache-conteneurs") ||
    txt.includes("cache-conteneurs modulable")
  )
    return "poteau_cache_conteneurs";
  if (
    txt.includes("range velo") ||
    txt.includes("parc a velo") ||
    sku.startsWith("MORVAS") ||
    sku.startsWith("BDRVB") ||
    sku.startsWith("BDPVB")
  )
    return "range_velo";
  if (txt.includes("chaise salsa") || sku.startsWith("STSALSAM"))
    return "salsa";
  if (txt.includes("chaise venise") || sku.startsWith("GMCV")) return "venise";
  if (txt.includes("chaise florence") || sku.startsWith("GMCFFE"))
    return "florence";

  if (
    txt.includes("tente de reception") ||
    txt.includes("gamme acier premium") ||
    sku.startsWith("E-STR") ||
    sku.startsWith("E-SAB") ||
    sku.startsWith("E-SBA") ||
    /^E-S[2-6]X/.test(sku) ||
    sku.startsWith("E-SPLB") ||
    txt.includes("barnum") ||
    txt.includes("gamme pro aluminium")
  ) {
    return "barnum";
  }

  if (txt.includes("poutre de chaise cluny") || sku.startsWith("GMPCC"))
    return "cluny";
  if (txt.includes("vitrine tradition") || sku.startsWith("PROVT"))
    return "vitrine_tradition";
  if (
    txt.includes("urne electorale") ||
    sku.startsWith("PROUE") ||
    sku.startsWith("PROLP")
  )
    return "urne";

  if (txt.includes("tapis rouge de ceremonie") || sku.startsWith("DOUTR"))
    return "tapis_rouge";
  if (txt.includes("plot esterel") || sku.startsWith("ADPES"))
    return "plot_esterel";

  if (
    txt.includes("miroir routier conforme") ||
    sku.startsWith("SOMRCC") ||
    sku.startsWith("SOMRCG")
  )
    return "miroir_routier";

  if (
    txt.includes("barriere de protection sur platine") ||
    sku.startsWith("MOBPSP")
  )
    return "barriere_protection";
  if (
    txt.includes("barriere ouvrante") ||
    sku.startsWith("ADBOR") ||
    sku.startsWith("ADBOU")
  )
    return "barriere_ouvrante";
  if (txt.includes("barriere soulevante") || sku.startsWith("ADBS"))
    return "barriere_soulevante";
  if (txt.includes("saint-georges") || sku.startsWith("BENBD"))
    return "saint_georges";

  if (txt.includes("corbeille carree ou hexagonale") || sku.startsWith("ALCOR"))
    return "corbeille_carree";
  if (txt.includes("banc recycle") || sku.startsWith("TRABRE"))
    return "banc_recycle";

  if (
    txt.includes("potelet sur coupelle") ||
    txt.includes("potelet sur coupe carree") ||
    sku.startsWith("MOPC")
  )
    return "potelet_coupelle";

  if (txt.includes("arceau")) return "arceau";
  return "generic";
}

function resolveModelCode(row, family, fallbackModel) {
  const sku = String(row.sku_originel || "").toUpperCase();

  const staticByFamily = {
    marca: "MARCA",
    kaline: "KALINE",
    coque_helene: "HELENE",
    iso_polypro: "ISOPOLY",
    ketty: "KETTY",
    cluny: "CLUNY",
    vitrine_tradition: "PROVT",
    urne: "URNE",
    table_universelle: "SODTUR",
    zeno_brik: "ZENOBRIK",
    rocuba: "ROCUBA",
    venus: "ROVEN",
    abri_modulo: "ABRMOD",
    banc_modo: "BAMODO",
    comptoir: "COMPT",
    parcours_sante: "PROPSB",
    tapis_rouge: "DOUTR",
    plot_esterel: "ESTEREL",
    miroir_routier: "MIROIR",
    barriere_protection: "BPSP",
    barriere_ouvrante: "BOUV",
    barriere_soulevante: "BSOU",
    barriere_chantier: "BCT1",
    corbeille_tri_selectif: "CTS",
    jeu_araignee: "JAR",
    poteau_cache_conteneurs: "PROPI",
    range_velo: "RANGEV",
    salsa: "SALSA",
    venise: "VENISE",
    florence: "FLOREN",
    corbeille_carree: "CORCAR",
    banc_recycle: "BANREC",
    potelet_coupelle: "POTELET",
    saint_georges: "STGEO",
  };

  if (family === "barnum") {
    const m = sku.match(/(GPA\d{5,6}|PBL\d{3,4}|STR\d+)/);
    if (m) return stripNoiseOneSuffix(m[1]);
    const existing = stripNoiseOneSuffix(fallbackModel || "");
    if (existing) return existing;
    return "BARNUM";
  }

  if (family === "arceau") {
    const m = sku.match(/(MOA[A-Z0-9]+|MOR\d+)/);
    if (m) return stripNoiseOneSuffix(tokenClean(m[1]).slice(0, 12));
    const existing = stripNoiseOneSuffix(fallbackModel || "");
    if (existing) return existing;
    return "ARCEAU";
  }

  if (family === "rocuba") {
    const m = sku.match(/ROCUBA\d+/);
    if (m) return stripNoiseOneSuffix(m[0]);
  }

  if (family === "venus") {
    const m = sku.match(/ROVEN\d+/);
    if (m) return stripNoiseOneSuffix(m[0]);
  }

  if (staticByFamily[family]) return staticByFamily[family];

  const existing = stripNoiseOneSuffix(fallbackModel || row.model_code || "");
  if (existing) return existing;
  return "PRODUIT";
}

const COLOR_PATTERNS = [
  { re: /gris\s+anthracite/g, code: "GRAN" },
  { re: /gris\s+procity/g, code: "GRPR" },
  { re: /gris\s+clair/g, code: "GRCL" },
  { re: /gris\s+fonce/g, code: "GRFO" },
  { re: /aspect\s+corten/g, code: "CORTEN" },
  { re: /bleu\s+ciel/g, code: "BLCI" },
  { re: /orange/g, code: "ORAN" },
  { re: /bleu/g, code: "BLEU" },
  { re: /noir/g, code: "NOIR" },
  { re: /rouge/g, code: "ROUGE" },
  { re: /vert/g, code: "VERT" },
  { re: /beige/g, code: "BEIGE" },
  { re: /bordeaux/g, code: "BORDEAUX" },
  { re: /gris/g, code: "GRIS" },
  { re: /blanc/g, code: "BLANC" },
  { re: /jaune/g, code: "JAUNE" },
  { re: /marron/g, code: "MARRON" },
  { re: /chocolat/g, code: "CHOCOLAT" },
  { re: /champagne/g, code: "CHAM" },
  { re: /taupe/g, code: "TAUP" },
  { re: /magenta/g, code: "MAGENTA" },
  { re: /saumon/g, code: "SAUMON" },
  { re: /rose/g, code: "ROSE" },
];

const COLOR_FROM_SKU = new Map([
  ["BLE", "BLEU"],
  ["BL", "BLANC"],
  ["NO", "NOIR"],
  ["ROU", "ROUGE"],
  ["VE", "VERT"],
  ["BE", "BEIGE"],
  ["BO", "BORDEAUX"],
  ["GA", "GRAN"],
  ["GC", "GRCL"],
  ["GM", "GRIS"],
  ["JA", "JAUNE"],
  ["RP", "ROSE"],
  ["AC", "CORTEN"],
  ["GP", "GRPR"],
  ["SP", "SAUMON"],
  ["OR", "ORAN"],
]);

const RAL_TO_COLOR = new Map([
  ["1021", "JAUNE"],
  ["3005", "BORDEAUX"],
  ["3020", "ROUGE"],
  ["4010", "MAGENTA"],
  ["5002", "BLEU"],
  ["5005", "BLEU"],
  ["5015", "BLEU-CIEL"],
  ["6018", "VERT"],
  ["7015", "GRIS"],
  ["7044", "GRIS-CLAIR"],
  ["8001", "MARRON"],
  ["8017", "MARRON"],
  ["9003", "BLANC"],
  ["9004", "NOIR"],
  ["9016", "BLANC"],
  ["9022", "GRIS-CLAIR"],
]);

function canonicalColorToken(token) {
  const raw = tokenKeepDash(token);
  if (!raw) return "";
  if (/^RAL[0-9]{4}$/.test(raw)) return raw;
  const compact = raw.replace(/-/g, "");
  const mapped = compact
    .replace(/^BLAN(C)?$/, "BLANC")
    .replace(/^NOIRS?$/, "NOIR")
    .replace(/^ROUG(E)?$/, "ROUGE")
    .replace(/^JAUN(E)?$/, "JAUNE")
    .replace(/^BORD$/, "BORDEAUX")
    .replace(/^GRISANTH$/, "GRAN")
    .replace(/^GRANTH$/, "GRAN")
    .replace(/^GRISPROC$/, "GRPR")
    .replace(/^GRISCLAIR$/, "GRCL")
    .replace(/^GRISFONCE$/, "GRFO")
    .replace(/^BLEUCIEL$/, "BLCI")
    .replace(/^ORANGE$/, "ORAN")
    .replace(/^CHOC$/, "CHOCOLAT")
    .replace(/^ASPE$/, "CORTEN");
  return mapped || "";
}

function parseRals(text) {
  const out = [];
  for (const m of normalize(text).matchAll(/\bral\s*([0-9]{4})\b/g)) {
    out.push(`RAL${m[1]}`);
  }
  return uniq(out);
}

function normalizeColorSet(tokens) {
  const list = [];
  for (const raw of tokens) {
    const src = String(raw || "");
    if (!src) continue;
    if (src.includes("+")) {
      const parts = src
        .split("+")
        .map((p) => canonicalColorToken(p))
        .filter(Boolean);
      if (!parts.length) continue;
      list.push(uniq(parts).join("+"));
      continue;
    }
    const t = canonicalColorToken(src);
    if (!t) continue;
    list.push(t);
  }

  // Remove duplicated semantic colors when both short+long forms exist.
  const seen = new Set();
  const out = [];
  for (const t of list) {
    const key = t
      .replace(/^RAL[0-9]{4}$/, t)
      .replace(/^BLAN(C)?$/, "BLANC")
      .replace(/^JAUN(E)?$/, "JAUNE")
      .replace(/^GRAN$/, "GRAN")
      .replace(/^GRCL$/, "GRCL")
      .replace(/^GRPR$/, "GRPR");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }

  // Remove generic shade when a more specific one is present.
  let filtered = out.filter((x) => {
    if (
      x === "GRIS" &&
      (out.includes("GRAN") ||
        out.includes("GRCL") ||
        out.includes("GRPR") ||
        out.includes("GRFO"))
    )
      return false;
    if (x === "BLEU" && out.includes("BLCI")) return false;
    return true;
  });

  // If both named colors and RAL are present, keep named colors only.
  if (
    filtered.some((x) => /^RAL[0-9]{4}$/.test(x)) &&
    filtered.some((x) => !/^RAL[0-9]{4}$/.test(x))
  ) {
    filtered = filtered.filter((x) => !/^RAL[0-9]{4}$/.test(x));
  }

  return filtered;
}

const COLOR_CODES = new Set([
  "BLANC",
  "NOIR",
  "ROUGE",
  "VERT",
  "JAUNE",
  "BLEU",
  "BEIGE",
  "BORDEAUX",
  "GRIS",
  "GRAN",
  "GRCL",
  "GRPR",
  "GRFO",
  "ORAN",
  "MARRON",
  "CORTEN",
  "CHOCOLAT",
  "CHAM",
  "TAUP",
  "MAGENTA",
  "SAUMON",
  "ROSE",
  "BLCI",
  "ZINGUE",
]);

function isColorCodeToken(token) {
  if (/^RAL[0-9]{4}$/.test(String(token || ""))) return true;
  return COLOR_CODES.has(String(token || ""));
}

function collapseStyleColorTokens(styleTokens) {
  const nonColor = [];
  const colors = [];

  for (const token of styleTokens || []) {
    const raw = String(token || "");
    if (!raw) continue;
    if (raw.includes("+")) {
      const parts = raw
        .split("+")
        .map((p) => canonicalColorToken(p))
        .filter(Boolean);
      if (parts.length && parts.every((p) => isColorCodeToken(p))) {
        colors.push(...parts);
      } else {
        nonColor.push(raw);
      }
      continue;
    }

    if (isColorCodeToken(raw)) colors.push(canonicalColorToken(raw));
    else nonColor.push(raw);
  }

  const uniqColors = uniq(colors.filter(Boolean));
  if (!uniqColors.length) return nonColor;
  return [...nonColor, uniqColors.join("+")];
}

function toMetersXToken(v) {
  const n = String(v || "").replace(",", ".");
  if (!n) return "";
  const num = Number(n);
  if (!Number.isFinite(num)) return "";
  return String(Math.round(num * 100));
}

function extractDimensionFromText(text) {
  const src = normalize(text).replace(/,/g, ".");

  // ex: 1m x 40cm
  const mxc = src.match(/\b([1-9](?:\.\d+)?)\s*m\s*[x×]\s*([0-9]{2,3})\s*cm\b/);
  if (mxc) return `${toMetersXToken(mxc[1])}X${Number(mxc[2])}`;

  // ex: 488 x 244 cm -> keep both sides in cm
  const cmx = src.match(/\b([0-9]{2,4})\s*[x×]\s*([0-9]{2,4})\s*cm\b/);
  if (cmx) return `${Number(cmx[1])}X${Number(cmx[2])}`;

  // ex: 3x4,5
  const mxm = src.match(
    /\b([1-9](?:\.\d+)?)\s*[x×]\s*([1-9](?:\.\d+)?)(?:\s*m)?\b/,
  );
  if (mxm) return `${toMetersXToken(mxm[1])}X${toMetersXToken(mxm[2])}`;

  // ex: 600 x 800 mm -> 60X80 (cm)
  const mmx = src.match(/\b([0-9]{3,4})\s*[x×]\s*([0-9]{3,4})\s*mm\b/);
  if (mmx)
    return `${Math.round(Number(mmx[1]) / 10)}X${Math.round(Number(mmx[2]) / 10)}`;

  // ex: 600 x 800
  const plain = src.match(/\b([0-9]{2,4})\s*[x×]\s*([0-9]{2,4})\b/);
  if (plain) {
    const a = Number(plain[1]);
    const b = Number(plain[2]);
    if (a <= 20 && b <= 20) return `${a * 100}X${b * 100}`;
    return `${a}X${b}`;
  }

  return "";
}

function normalizeImpactDimensionToken(token, fullText = "") {
  const t = tokenKeepDash(String(token || ""));
  if (!t) return "";

  // Incomplete tokens like 610X coming from legacy branch extraction.
  if (/^[0-9]{2,4}X$/.test(t) || /^X[0-9]{2,4}$/.test(t)) {
    const fromText = extractDimensionFromText(fullText);
    if (fromText && /^[0-9]{2,4}X[0-9]{2,4}$/.test(fromText)) return fromText;
    return "";
  }

  // Meter-like dimensions are normalized to cm to avoid decimal ambiguity.
  const mxm = t.match(/^([0-9]{1,2})X([0-9]{1,2})$/);
  if (mxm) {
    const a = Number(mxm[1]);
    const b = Number(mxm[2]);
    if (a <= 20 && b <= 20) return `${a * 100}X${b * 100}`;
  }

  return t;
}

function extractBarnumDimension(text, sku) {
  const direct = extractDimensionFromText(text);
  if (direct) return direct;

  const up = String(sku || "").toUpperCase();
  const fromSabs = up.match(/SABS([2-6])(2|3|4|45|5|6|8|10|12)/);
  if (fromSabs) return `${fromSabs[1]}X${fromSabs[2]}`;

  const fromStr = up.match(/STR\d{2}([2-9])X([0-9]{1,2})/);
  if (fromStr) return `${fromStr[1]}X${fromStr[2]}`;

  const fromSimple = up.match(/(?:SBA|S[2-6]X|SPLB|SPLA)([2-6])X([0-9]{1,2})/);
  if (fromSimple) return `${fromSimple[1]}X${fromSimple[2]}`;

  // STC37 => 3x6, STC46 => 4x6, STC58 => 5x8, STC510 => 5x10
  const fromStc = up.match(/STC([3-6])([0-9]{1,2})/);
  if (fromStc) {
    const a = fromStc[1];
    const b = fromStc[2] === "7" ? "6" : fromStc[2];
    return `${a}X${b}`;
  }

  return "";
}

function extractLengthCm(text) {
  const src = normalize(text).replace(/,/g, ".");

  const mm = src.match(/\b([0-9]{3,4})\s*mm\b/);
  if (mm) return `L${Math.round(Number(mm[1]) / 10)}CM`;

  const m = src.match(/\b([0-9](?:\.\d+)?)\s*m\b/);
  if (m) return `L${Math.round(Number(m[1]) * 100)}CM`;

  const cm = src.match(/\b([0-9]{2,3})\s*cm\b/);
  if (cm) return `L${Number(cm[1])}CM`;

  return "";
}

function cleanSimpleSkuModel(sku) {
  let out = String(sku || "")
    .toUpperCase()
    .trim();
  out = out.replace(/-DEFAULT$/i, "");
  // Remove technical trailing one-series created by old suffixes (-1, -11, -11-1, ...).
  out = out.replace(/(?:-(?:1+))+$/g, "");
  out = out.replace(/-+$/g, "");
  return tokenClean(out);
}

function stripNoiseOneSuffix(token) {
  let out = tokenClean(token);
  out = out.replace(/(?:-(?:1+))+$/g, "");
  out = out.replace(/1{2,}$/g, "");
  out = out.replace(/-+$/g, "");
  return out;
}

function extractPackToken(text) {
  const n = normalize(text);
  const m = n.match(/pack\s+de\s+([0-9]+)/);
  if (m) return `PACK${m[1]}`;
  if (n.includes("+ pack")) return "PACK";
  return "";
}

function extractA4Token(text) {
  const n = normalize(text);
  const m = n.match(/\b([0-9]{1,2})\s*a4\b/);
  if (m) return `${Number(m[1])}A4`;
  return "";
}

function extractAssemblyToken(ctx, row) {
  const vals = getAttrValues(ctx, ["assemblable"]);
  const txt = normalize(
    `${vals.join(" ")} ${row.designation || ""} ${row.sku_originel || ""} ${row.price_branch || ""}`,
  );
  if (txt.includes("sans") || txt.includes("non assembl")) return "SN";
  if (
    txt.includes("avec") ||
    txt.includes("assemblable") ||
    /\bAS\b/.test(String(row.price_branch || ""))
  )
    return "AS";
  return "";
}

function extractPlacesToken(ctx, row) {
  const pb = tokenClean(String(row.price_branch || ""));
  if (pb) return pb;

  const vals = getAttrValues(ctx, [
    "nombre-de-places",
    "nombre-de-corbeilles",
    "option_2026",
    "choisissez-la-taille",
  ]);
  const txt = normalize(
    `${vals.join(" ")} ${row.designation || ""} ${row.sku_originel || ""}`,
  );
  const x = txt.match(/\b([0-9]{1,2}\s*x\s*[0-9]{1,2})\b/);
  if (x) return x[1].replace(/\s+/g, "").toUpperCase();
  const n = txt.match(/\b([0-9]{1,2})\b/);
  if (n) return String(Number(n[1]));
  return "";
}

function extractColorFromColorisText(text) {
  const n = normalize(text);
  if (n.includes("rose rouge")) return "ROSE";
  if (n.includes("blanc") && n.includes("rouge")) return "ROUGE+BLANC";
  if (n.includes("jaune") && n.includes("noir")) return "NOIR+JAUNE";
  if (n.includes("vert") && n.includes("jaune")) return "VERT+JAUNE";
  if (n.includes("zingu")) return "ZINGUE";
  if (n.includes("blanc")) return "BLANC";
  if (n.includes("jaune")) return "JAUNE";
  if (n.includes("noir")) return "NOIR";
  if (n.includes("rouge")) return "ROUGE";
  if (n.includes("vert")) return "VERT";
  if (n.includes("gris")) return "GRIS";
  return "";
}

function extractArceauImpact(text) {
  const n = normalize(text).replace(/,/g, ".");
  const mmMatches = [...n.matchAll(/([0-9]{3,4})\s*mm/g)].map((m) =>
    Number(m[1]),
  );
  let diam = extractDiameterToken(text);
  if (!diam) {
    const d = n.match(/(?:^|[^0-9])([0-9]{2,3})\s*mm/);
    if (d) diam = `D${d[1]}`;
  }
  let length = "";
  if (mmMatches.length) {
    const max = Math.max(...mmMatches);
    if (Number.isFinite(max)) length = `L${Math.round(max / 10)}CM`;
  } else {
    length = extractLengthCm(text);
  }
  return [diam, length].filter(Boolean);
}

function tokenColorShortFromRal(code) {
  const map = new Map([
    ["1021", "JAUNE"],
    ["3020", "ROUGE"],
    ["5002", "BLEU"],
    ["5005", "BLEU"],
    ["5015", "BLEU"],
    ["6018", "VERT"],
    ["7015", "GRIS"],
    ["7044", "GRCL"],
    ["8001", "MARRON"],
    ["8017", "MARRON"],
    ["9003", "BLANC"],
    ["9004", "NOIR"],
    ["9016", "BLANC"],
    ["9022", "GRCL"],
  ]);
  return map.get(String(code || "")) || "";
}

function extractTapisLengthToken(text, sku) {
  const src = normalize(text).replace(/,/g, ".");
  const explicit = src.match(/-\s*([0-9]{1,2})\s*m\b/);
  if (explicit) return `L${Number(explicit[1])}M`;

  const skuMap = {
    "DOUTR-112": "L5M",
    "DOUTR-113": "L10M",
    "DOUTR-114": "L20M",
  };
  const up = String(sku || "").toUpperCase();
  if (skuMap[up]) return skuMap[up];

  const fallback = src.match(/\b([0-9]{1,2})\s*m\b/g);
  if (fallback && fallback.length) {
    const nums = fallback
      .map((x) => Number(x.replace(/[^0-9]/g, "")))
      .filter((n) => Number.isFinite(n));
    if (nums.length) return `L${Math.max(...nums)}M`;
  }

  return "";
}

function extractTableUniverselleDiameter(text, sku) {
  const src = normalize(text);
  const byText = src.match(/diam(?:etre)?\s*([0-9]{2,3})/);
  if (byText) return `D${byText[1]}`;

  const up = String(sku || "").toUpperCase();
  const bySku = up.match(/SODTUR(\d{2,3})/);
  if (bySku) return `D${Number(bySku[1])}`;

  return "";
}

function extractDiameterToken(text) {
  const src = normalize(text);
  const d1 = src.match(/diametre\s*([0-9]{2,3})/);
  if (d1) return `D${d1[1]}`;
  const d2 = src.match(/ø\s*([0-9]{2,3})/);
  if (d2) return `D${d2[1]}`;
  return "";
}

function extractHeightToken(text) {
  const src = normalize(text).replace(/,/g, ".");
  const h1 = src.match(/hauteur[^0-9]*([0-9]{3,4})\s*mm/);
  if (h1) return `H${Math.round(Number(h1[1]) / 10)}`;
  const h2 = src.match(/hauteur[^0-9]*([0-9]{2,3})\s*cm/);
  if (h2) return `H${h2[1]}`;
  const h3 = src.match(/hauteur[^0-9]*([0-9](?:\.\d+)?)\s*m/);
  if (h3) return `H${Math.round(Number(h3[1]) * 100)}`;
  return "";
}

function pickPrimaryColorToken(tokens) {
  const colors = normalizeColorSet(tokens).filter(
    (t) => !/^RAL[0-9]{4}$/.test(t),
  );
  if (colors.length) return colors[0];
  const rals = normalizeColorSet(tokens).filter((t) => /^RAL[0-9]{4}$/.test(t));
  return rals[0] || "";
}

async function fetchVariantEnrichment(rows) {
  const envPath = path.resolve(process.cwd(), ".env.local");
  loadEnv(envPath);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

  const out = {
    priceById: new Map(),
    productIdByVariant: new Map(),
    attrsByVariant: new Map(),
  };

  if (!supabaseUrl || !serviceKey) return out;

  const variantIds = uniq(
    rows
      .filter((r) => String(r.entity_level || "") === "variant")
      .map((r) => String(r.entity_id || ""))
      .filter(Boolean),
  );
  if (!variantIds.length) return out;

  const client = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  // variants: price + product_id
  const varRows = [];
  for (let i = 0; i < variantIds.length; i += 150) {
    const ids = variantIds.slice(i, i + 150);
    const { data, error } = await client
      .from("variants")
      .select("id,product_id,regular_price,sku")
      .in("id", ids);
    if (error) continue;
    varRows.push(...(data || []));
  }
  for (const row of varRows) {
    const price = Number(row.regular_price);
    out.priceById.set(String(row.id), Number.isFinite(price) ? price : null);
    out.productIdByVariant.set(String(row.id), String(row.product_id || ""));
  }

  // attributes dictionaries
  const { data: attrsData } = await client.from("attributes").select("id,slug");
  const attrById = new Map(
    (attrsData || []).map((a) => [
      String(a.id),
      String(a.slug || "").replace(/^pa_/, ""),
    ]),
  );

  const { data: termsData } = await client
    .from("attribute_terms")
    .select("attribute_id,slug,name");
  const termNameByKey = new Map();
  for (const t of termsData || []) {
    termNameByKey.set(`${t.attribute_id}::${t.slug}`, t.name || t.slug);
  }

  // variant_attributes
  const vaRows = [];
  for (let i = 0; i < variantIds.length; i += 250) {
    const ids = variantIds.slice(i, i + 250);
    const { data, error } = await client
      .from("variant_attributes")
      .select("variant_id,attribute_id,term_slug")
      .in("variant_id", ids);
    if (error) continue;
    vaRows.push(...(data || []));
  }

  for (const row of vaRows) {
    const variantId = String(row.variant_id || "");
    const attrSlug = attrById.get(String(row.attribute_id || ""));
    if (!variantId || !attrSlug) continue;
    const val =
      termNameByKey.get(`${row.attribute_id}::${row.term_slug}`) ||
      String(row.term_slug || "");

    if (!out.attrsByVariant.has(variantId))
      out.attrsByVariant.set(variantId, {});
    const bag = out.attrsByVariant.get(variantId);
    if (!Array.isArray(bag[attrSlug])) bag[attrSlug] = [];
    if (!bag[attrSlug].includes(val)) bag[attrSlug].push(val);
  }

  return out;
}

function getAttrValues(ctx, keys) {
  if (!ctx || !ctx.attrs) return [];
  const list = [];
  for (const key of keys) {
    const vals = ctx.attrs[key];
    if (Array.isArray(vals)) list.push(...vals);
  }
  return uniq(list.map((v) => String(v || "").trim()).filter(Boolean));
}

function getAllAttrTexts(ctx) {
  if (!ctx || !ctx.attrs) return [];
  const out = [];
  for (const vals of Object.values(ctx.attrs)) {
    if (Array.isArray(vals)) out.push(...vals.map((v) => String(v || "")));
  }
  return uniq(out.filter(Boolean));
}

function extractChairSignals(row, ctx) {
  const option = getAttrValues(ctx, [
    "option_2026",
    "modele",
    "dimension",
  ]).join(" | ");
  const txt = normalize(
    `${option} ${row.designation || ""} ${row.sku_originel || ""} ${row.puid_propose || ""}`,
  );
  const sku = String(row.sku_originel || "").toUpperCase();

  let norme = "";
  let diam = "";
  let accroche = "";

  const mNorme = txt.match(/\bm\s*([24])\b/);
  if (mNorme) norme = `M${mNorme[1]}`;

  const mDiam = txt.match(/diametre\s*([0-9]{2,3})/);
  if (mDiam) diam = `D${mDiam[1]}`;

  if (/avec\s+accroche/.test(txt) || /\bacc\b/.test(txt) || /\baa\b/.test(txt))
    accroche = "AA";
  if (/sans\s+accroche/.test(txt) || /\bsa\b/.test(txt)) accroche = "SA";

  // SKU fallbacks
  const marcaLike = sku.match(/GMCM([24])(18|22)(AA|SA|ACC)?/);
  const kalineLike = sku.match(/GMCK([24])(18|22)(AA|SA|ACC)?/);
  const kettyLike = sku.match(/GMCKM([24]).*?(AA|SA)/);
  const heleneLike = sku.match(/GM([0-9]{2})M([24])(AA|SA|ACC)?/);
  if (!norme && marcaLike) norme = `M${marcaLike[1]}`;
  if (!diam && marcaLike) diam = `D${marcaLike[2]}`;
  if (!accroche && marcaLike && marcaLike[3])
    accroche = marcaLike[3] === "ACC" ? "AA" : marcaLike[3];

  if (!norme && kalineLike) norme = `M${kalineLike[1]}`;
  if (!diam && kalineLike) diam = `D${kalineLike[2]}`;
  if (!accroche && kalineLike && kalineLike[3])
    accroche = kalineLike[3] === "ACC" ? "AA" : kalineLike[3];

  if (!norme && kettyLike) norme = `M${kettyLike[1]}`;
  if (!diam && /diametre\s*25/.test(txt)) diam = "D25";
  if (!accroche && kettyLike && kettyLike[2])
    accroche = kettyLike[2] === "ACC" ? "AA" : kettyLike[2];

  if (!norme && heleneLike) norme = `M${heleneLike[2]}`;
  if (!diam && heleneLike) diam = `D${heleneLike[1]}`;
  if (!accroche && heleneLike && heleneLike[3])
    accroche = heleneLike[3] === "ACC" ? "AA" : heleneLike[3];

  if (!accroche) {
    if (txt.includes("sans accroche")) accroche = "SA";
    else if (txt.includes("avec accroche") || txt.includes("assemblable"))
      accroche = "AA";
  }

  return { norme, diam, accroche };
}

function extractAvSn(row, ctx) {
  const txt = normalize(
    `${row.designation || ""} ${row.sku_originel || ""} ${getAllAttrTexts(ctx).join(" ")}`,
  );

  let last = "";
  const re = /\b(avec|sans)\s+(jupe|bardage|contrepoids)\b/g;
  for (const m of txt.matchAll(re)) last = m[1];
  if (last === "avec") return "AV";
  if (last === "sans") return "SN";

  if (/avec\s+(jupe|bardage|contrepoids)/.test(txt)) return "AV";
  if (/sans\s+(jupe|bardage|contrepoids)/.test(txt)) return "SN";
  return "";
}

function extractAbriDepthToken(text, sku) {
  const src = normalize(text).replace(/,/g, ".");
  const mm = src.match(/profondeur[^0-9]*([0-9]{3,4})\s*mm/);
  if (mm) return `L${Math.round(Number(mm[1]) / 10)}CM`;

  const up = String(sku || "").toUpperCase();
  const fromSku = up.match(/PROABM(?:B)?(20|34)/);
  if (fromSku) return `L${Number(fromSku[1]) * 10}CM`;
  return "";
}

function extractSaintGeorgesLength(text, sku) {
  const up = String(sku || "").toUpperCase();
  const bySku = up.match(/BENBD([12])M/);
  if (bySku) return `L${Number(bySku[1]) * 100}CM`;

  const src = normalize(text).replace(/,/g, ".");
  const tail = src.match(/-\s*([12])\s*m\b/);
  if (tail) return `L${Number(tail[1]) * 100}CM`;
  return extractLengthCm(text);
}

function extractPietement(row, ctx) {
  const vals = getAttrValues(ctx, ["pietement", "couleurs-pietements"]);
  const src = normalize(
    `${vals.join(" ")} ${row.designation || ""} ${row.sku_originel || ""}`,
  );
  if (src.includes("chrom")) return "CH";
  if (src.includes("epoxy")) return "EP";
  if (src.includes("carre")) return "CARRE";
  if (src.includes("rond")) return "ROND";
  return "";
}

function extractFootType(row, ctx) {
  const vals = getAttrValues(ctx, ["option_2026", "pietement"]);
  const src = normalize(`${vals.join(" ")} ${row.designation || ""}`);
  if (src.includes("pieds carres") || src.includes("pieds carres"))
    return "CARRE";
  if (src.includes("pieds ronds") || src.includes("pieds ronds")) return "ROND";
  return "";
}

function extractColorTokens(row, ctx, options = {}) {
  const {
    preferRal = false,
    allowMulti = true,
    strictAttr = false,
    includeSkuHints = true,
  } = options;
  const out = [];

  const attrColorValues = getAttrValues(ctx, [
    "coloris",
    "couleurs",
    "couleurs-pietements",
    "couleurs-plateau",
    "couvercle",
    "couvercle-lateral-1",
    "couvercle-lateral-2",
    "couvercle-lateral-3",
    "couvercle-lateral-4",
    "option_2026",
  ]);

  const fullText = (
    strictAttr
      ? [row.style_branch || "", ...attrColorValues]
      : [
          row.designation || "",
          row.style_branch || "",
          row.puid_propose || "",
          ...attrColorValues,
        ]
  ).join(" | ");
  const n = normalize(fullText);

  // RAL codes first
  const rals = parseRals(fullText);
  out.push(...rals);

  for (const pattern of COLOR_PATTERNS) {
    if (pattern.re.test(n)) out.push(pattern.code);
  }

  if (includeSkuHints) {
    // SKU compact color hints.
    const sku = String(row.sku_originel || "").toUpperCase();
    for (const m of sku.matchAll(/(?:^|[-_.])([A-Z]{2,4})(?=$|[-_.])/g)) {
      const code = COLOR_FROM_SKU.get(m[1]);
      if (code) out.push(code);
    }

    // Numeric color ids in SKU.
    for (const m of sku.matchAll(
      /(?:^|[-_.])(10[0-9]{2}|30[0-9]{2}|40[0-9]{2}|50[0-9]{2}|60[0-9]{2}|70[0-9]{2}|80[0-9]{2}|90[0-9]{2})(?=$|[-_.])/g,
    )) {
      const code = m[1];
      out.push(`RAL${code}`);
      const name = RAL_TO_COLOR.get(code);
      if (name) out.push(name);
    }
  }

  // Expand "blanc/rouge" or "jaune + noir" style texts.
  const splitCandidates = n.split(/[|/+]/g).map((x) => x.trim());
  for (const c of splitCandidates) {
    for (const p of COLOR_PATTERNS) {
      if (p.re.test(c)) out.push(p.code);
    }
  }

  let tokens = normalizeColorSet(out);

  // "rose rouge" is treated as a single shade, keep ROSE only.
  if (n.includes("rose rouge") && tokens.includes("ROSE")) {
    tokens = tokens.filter((t) => t !== "ROUGE");
  }

  // Keep RAL first when explicitly requested.
  if (preferRal) {
    const r = tokens.filter((t) => /^RAL[0-9]{4}$/.test(t));
    const c = tokens.filter((t) => !/^RAL[0-9]{4}$/.test(t));
    tokens = [...r, ...c];
  }

  if (!allowMulti && tokens.length > 1) {
    const t = pickPrimaryColorToken(tokens);
    return t ? [t] : tokens.slice(0, 1);
  }

  return tokens;
}

function extractMirrorMaterial(row, ctx) {
  const vals = getAttrValues(ctx, ["garantie", "option_2026"]);
  const src = normalize(`${vals.join(" ")} ${row.designation || ""}`);
  if (src.includes("inox")) return "INOX";
  if (src.includes("plexi")) return "PLEXI";
  if (src.includes("poly")) return "POLY";
  return "";
}

function extractRocubaOpening(row, ctx) {
  const coloris = getAttrValues(ctx, ["coloris"]).join(" | ");
  const txt = normalize(`${coloris} ${row.designation || ""}`);
  if (txt.includes("gobelet")) return "GOBE";
  if (txt.includes("papier")) return "PAPI";
  if (txt.includes("metal")) return "META";
  if (txt.includes("plast")) return "PLAS";
  if (txt.includes("verre")) return "VERR";
  if (txt.includes("autres")) return "AUTR";
  if (txt.includes("cartouch")) return "CART";
  if (txt.includes("emballage")) return "EMBA";
  return "";
}

function extractFacadeToken(ctx) {
  const option = normalize(getAttrValues(ctx, ["option_2026"]).join(" | "));
  if (option.includes("facade blanche")) return "FBLANC";
  if (option.includes("facade grise")) return "FGRIS";
  return "";
}

function extractVenusLidTokens(ctx) {
  const vals = getAttrValues(ctx, [
    "couvercle-lateral-1",
    "couvercle-lateral-2",
    "couvercle-lateral-3",
    "couvercle-lateral-4",
  ]);
  const codes = [];
  for (const v of vals) {
    const t = normalize(v);
    if (t.includes("universel")) codes.push("UNIV");
    if (t.includes("papier")) codes.push("PAPI");
    if (t.includes("metal")) codes.push("META");
    if (t.includes("autres")) codes.push("AUTR");
    if (t.includes("emballage")) codes.push("EMBA");
    if (t.includes("verre")) codes.push("VERR");
  }
  return uniq(codes).slice(0, 4);
}

function extractCapacityFromSku(sku) {
  const up = String(sku || "").toUpperCase();
  const m = up.match(/(40|60|75|120)L?/);
  if (m) return `${m[1]}L`;
  return "";
}

function sanitizeTokens(tokens, options = {}) {
  const { allowPlus = false, keepDots = false } = options;
  const keep = allowPlus ? tokenKeepDashPlus : tokenKeepDash;
  const cleaned = tokens
    .map((t) => keep(t))
    .map((t) => t.replace(/(?:-(?:1+))+$/g, ""))
    .map((t) => (allowPlus ? t : t.replace(/-+/g, "")))
    .map((t) => t.replace(/(^|[-+])STRU($|[-+])/g, "$1$2"))
    .map((t) => t.replace(/(^|[-+])FACA($|[-+])/g, "$1$2"))
    .map((t) => t.replace(/[-+]{2,}/g, "-"))
    .map((t) => t.replace(/^[-+]+|[-+]+$/g, ""))
    .filter((t) => t && t !== "BASE")
    .filter((t) => !/^[0-9]+$/.test(t))
    .filter((t) => !/^[2-9]$/.test(t));
  return uniq(cleaned);
}

function buildChairDefaults(rows, variantData) {
  const defaultsByProduct = new Map();

  const vote = new Map();
  for (const row of rows) {
    if (row.entity_level !== "variant") continue;
    const family = detectFamily(row);
    if (!["marca", "kaline", "coque_helene"].includes(family)) continue;

    const variantId = String(row.entity_id || "");
    const productId =
      variantData.productIdByVariant.get(variantId) ||
      String(row.product_id || "");
    if (!productId) continue;

    const ctx = {
      attrs: variantData.attrsByVariant.get(variantId) || {},
    };
    const sig = extractChairSignals(row, ctx);

    if (!vote.has(productId))
      vote.set(productId, {
        norme: new Map(),
        diam: new Map(),
        accroche: new Map(),
      });
    const bag = vote.get(productId);

    if (sig.norme)
      bag.norme.set(sig.norme, (bag.norme.get(sig.norme) || 0) + 1);
    if (sig.diam) bag.diam.set(sig.diam, (bag.diam.get(sig.diam) || 0) + 1);
    if (sig.accroche)
      bag.accroche.set(sig.accroche, (bag.accroche.get(sig.accroche) || 0) + 1);
  }

  for (const [productId, bag] of vote.entries()) {
    const best = (map) => {
      const arr = [...map.entries()].sort((a, b) => b[1] - a[1]);
      return arr[0]?.[0] || "";
    };
    defaultsByProduct.set(productId, {
      norme: best(bag.norme),
      diam: best(bag.diam),
      accroche: best(bag.accroche),
    });
  }

  return defaultsByProduct;
}

function buildPuidV3(row, variantData, chairDefaults) {
  const { supplier, model: fallbackModel } = parseRootParts(
    row.puid_root || row.puid_propose || "",
  );
  const family = detectFamily(row);
  const model = resolveModelCode(row, family, row.model_code || fallbackModel);
  const supplierCode = tokenClean(supplier || row.supplier_code || "UNK");

  if (String(row.entity_level || "") !== "variant") {
    const bySku = cleanSimpleSkuModel(row.sku_originel || "");
    const resolved = stripNoiseOneSuffix(
      resolveModelCode(row, family, model || "") || "",
    );
    const simpleModel = tokenClean(
      resolved || bySku || stripNoiseOneSuffix(model || "PRODUIT"),
    );
    const root = `P-${supplierCode}-${simpleModel}`;
    return {
      family,
      puid: root,
      root,
      impact: "",
      style: "",
      avsnToken: "",
      avsnInImpact: false,
      notes: "simple_no_branches",
    };
  }

  const variantId = String(row.entity_id || "");
  const productId =
    variantData.productIdByVariant.get(variantId) ||
    String(row.product_id || "");
  const ctx = {
    attrs: variantData.attrsByVariant.get(variantId) || {},
  };

  let impact = [];
  let style = [];
  const notes = [];
  const needsReview = [];
  let avsnToken = "";
  let avsnInImpact = false;

  const allText = `${row.designation || ""} ${row.sku_originel || ""} ${row.puid_propose || ""} ${getAllAttrTexts(ctx).join(" ")}`;
  const dim = extractDimensionFromText(allText);
  const colors = extractColorTokens(row, ctx, {
    preferRal: false,
    strictAttr: ["rocuba", "zeno_brik", "venus", "barnum"].includes(family),
    allowMulti: true,
    includeSkuHints: !["barnum"].includes(family),
  });

  if (["marca", "kaline", "coque_helene"].includes(family)) {
    const sig = extractChairSignals(row, ctx);
    const defaults = chairDefaults.get(productId) || {};

    const norme = sig.norme || defaults.norme || "";
    const diam = sig.diam || defaults.diam || "";
    const accroche = sig.accroche || defaults.accroche || "";

    const chairImpact = `${norme}${diam}${accroche}`;
    if (chairImpact) impact.push(chairImpact);

    const piet = extractPietement(row, ctx);
    if (piet) style.push(piet);
    style.push(...colors);

    avsnToken = accroche;
    avsnInImpact = Boolean(accroche);

    if (!sig.norme || !sig.diam) notes.push("chair_defaults_fallback");
    notes.push("accroche_impact");
  } else if (family === "iso_polypro") {
    const sig = extractChairSignals(row, ctx);
    const core = `${sig.norme || ""}${sig.accroche || ""}`;
    if (core) impact.push(core);
    style.push(...colors);
    notes.push("iso_norme_impact");
  } else if (family === "ketty") {
    const sig = extractChairSignals(row, ctx);
    const core = `${sig.norme || ""}${sig.diam || ""}${sig.accroche || ""}`;
    if (core) impact.push(core);
    style.push(...colors);
    notes.push("ketty_accroche_impact");
  } else if (family === "salsa") {
    const sig = extractChairSignals(row, ctx);
    const asm = extractAssemblyToken(ctx, row);
    const core = `${sig.norme || ""}${sig.diam || ""}${asm || sig.accroche || ""}`;
    if (core) impact.push(core);
    style.push(
      ...extractColorTokens(row, ctx, {
        strictAttr: true,
        allowMulti: false,
        includeSkuHints: false,
      }),
    );
    notes.push("salsa_norme_assembly_impact");
  } else if (family === "venise") {
    const sig = extractChairSignals(row, ctx);
    if (sig.norme) impact.push(sig.norme);
    const piet = extractPietement(row, ctx);
    if (piet) style.push(piet);
    style.push(
      ...extractColorTokens(row, ctx, {
        strictAttr: true,
        allowMulti: false,
        includeSkuHints: false,
      }),
    );
    notes.push("venise_norme_impact");
  } else if (family === "florence") {
    const sig = extractChairSignals(row, ctx);
    if (sig.norme) impact.push(sig.norme);
    style.push(
      ...extractColorTokens(row, ctx, {
        strictAttr: true,
        allowMulti: false,
        includeSkuHints: false,
      }),
    );
    notes.push("florence_norme_impact");
  } else if (family === "table_universelle") {
    const d = extractTableUniverselleDiameter(allText, row.sku_originel);
    if (d) impact.push(d);
    const foot = extractFootType(row, ctx);
    if (foot) style.push(foot);
    style.push(...colors);
    notes.push("table_dim_impact_foot_style");
  } else if (family === "zeno_brik") {
    const sku = String(row.sku_originel || "").toUpperCase();
    const cap = extractCapacityFromSku(sku);
    if (cap) impact.push(cap);

    // LRM does not change price in this dataset => style token.
    if (sku.includes("-LRM-")) style.push("LRM");

    style.push(...colors);
    notes.push("lrm_non_impact_verified");
  } else if (family === "rocuba") {
    const sku = String(row.sku_originel || "").toUpperCase();
    const facade = sku.match(/ROCUBA75([BG])/);
    if (facade) style.push(facade[1] === "B" ? "FB" : "FG");

    const opening4 = extractRocubaOpening(row, ctx);
    const opening2 =
      {
        GOBE: "GO",
        PAPI: "PA",
        META: "ME",
        PLAS: "PL",
        VERR: "VE",
        AUTR: "AU",
        CART: "CA",
        EMBA: "EM",
      }[opening4 || ""] || "";
    if (opening2) impact.push(opening2);

    const code = sku.match(
      /-(10[0-9]{2}|30[0-9]{2}|40[0-9]{2}|50[0-9]{2}|60[0-9]{2}|70[0-9]{2}|80[0-9]{2}|90[0-9]{2})/,
    );
    const color = tokenColorShortFromRal(code?.[1] || "");
    if (color) style.push(color);

    notes.push("rocuba_short_codes");
  } else if (family === "venus") {
    const sku = String(row.sku_originel || "").toUpperCase();
    const mCount = sku.match(/^ROVEN([0-9])/);
    if (mCount) impact.push(`N${mCount[1]}`);
    const parts = sku.split("-").slice(1).filter(Boolean);
    style.push(
      ...parts.map((p) => tokenClean(p)).filter((p) => /^[A-Z]{2,4}$/.test(p)),
    );
    notes.push("venus_from_sku_tokens");
  } else if (family === "abri_modulo") {
    avsnToken = extractAvSn(row, ctx);
    const depth = extractAbriDepthToken(allText, row.sku_originel);
    if (depth) impact.push(depth);
    else if (dim) impact.push(dim);
    if (avsnToken) impact.push(avsnToken);
    style.push(...colors);
    avsnInImpact = Boolean(avsnToken);
    notes.push("abri_dim_impact");
  } else if (family === "banc_modo") {
    const len = extractLengthCm(allText);
    if (len) impact.push(len);

    const txt = normalize(allText);
    if (txt.includes("avec accoudoir")) impact.push("AV");
    else if (txt.includes("sans accoudoir")) impact.push("SN");

    const feet = txt.match(/\b([3-6])\s*pieds?\b/);
    if (feet) impact.push(`P${feet[1]}`);

    style.push(
      ...extractColorTokens(row, ctx, {
        strictAttr: true,
        allowMulti: false,
        includeSkuHints: false,
      }),
    );
    notes.push("banc_modo_length_impact");
  } else if (family === "comptoir") {
    avsnToken = extractAvSn(row, ctx);
    const d = dim || extractLengthCm(allText);
    if (d) impact.push(d);
    if (avsnToken) impact.push(avsnToken);
    style.push(...colors);
    avsnInImpact = Boolean(avsnToken);
    notes.push("comptoir_dim_impact");
  } else if (family === "barnum") {
    const option = getAttrValues(ctx, ["option_2026"]).join(" ");
    const dimBarnum = extractBarnumDimension(
      `${option} ${allText}`,
      row.sku_originel,
    );
    if (dimBarnum) impact.push(dimBarnum);

    const pack = extractPackToken(
      `${option} ${row.designation || ""} ${row.sku_originel || ""}`,
    );
    if (pack) impact.push(pack);

    const barnumColors = extractColorTokens(row, ctx, {
      strictAttr: true,
      allowMulti: false,
      includeSkuHints: false,
    });
    const color = barnumColors[0] || "";
    if (color) style.push(color);
    else {
      const fallbackColor =
        extractColorTokens(row, ctx, {
          strictAttr: false,
          allowMulti: false,
          includeSkuHints: true,
        })[0] || "BLANC";
      style.push(fallbackColor);
      notes.push("barnum_color_inferred");
    }

    const norme = extractChairSignals(row, ctx).norme;
    if (norme === "M2") {
      const effectiveColor = style.find((t) =>
        [
          "BLANC",
          "BLEU",
          "NOIR",
          "ROUGE",
          "VERT",
          "BEIGE",
          "BORDEAUX",
          "GRIS",
          "GRAN",
          "GRCL",
          "GRPR",
          "ORAN",
          "JAUNE",
          "MARRON",
          "ROSE",
          "SAUMON",
          "MAGENTA",
          "CORTEN",
          "BLCI",
        ].includes(t),
      );
      if (!effectiveColor || effectiveColor === "BLANC") {
        style.push("M2");
      } else {
        needsReview.push("BARNUM_M2_NON_BLANC");
      }
    }
    notes.push("barnum_dim_primary");
  } else if (family === "cluny") {
    const txt = normalize(`${allText}`);
    const seats = txt.match(/\b([2-9])\s*(sieges|places|assises)\b/);
    if (seats) impact.push(`S${seats[1]}`);

    const src = normalize(
      getAttrValues(ctx, ["finition", "option_2026"]).join(" "),
    );
    if (src.includes("poly")) style.push("POLY");
    if (src.includes("tiss")) style.push("TISS");
    style.push(...colors);
    notes.push("cluny_seats_impact");
  } else if (family === "vitrine_tradition") {
    const a4 = extractA4Token(
      `${getAttrValues(ctx, ["dimension"]).join(" ")} ${allText}`,
    );
    const d = a4 || extractDimensionFromText(allText);
    if (d) impact.push(d);
    style.push(
      ...extractColorTokens(row, ctx, {
        strictAttr: true,
        allowMulti: false,
        includeSkuHints: false,
      }),
    );
    notes.push("vitrine_dim_impact");
  } else if (family === "urne") {
    const txt = normalize(allText);
    const cap = txt.match(/\b(600\/800|800\/1200|1200\/1600)\b/);
    if (cap) impact.push(`B${cap[1].replace("/", "-")}`);
    const one = txt.match(/\b(6008|8001|1200)\b/);
    if (!cap && one) impact.push(`B${one[1]}`);
    style.push(...colors);
    notes.push("urne_capacite_impact");
  } else if (family === "tapis_rouge") {
    const len = extractTapisLengthToken(allText, row.sku_originel);
    if (len) impact.push(len);
    style.push(...colors);
    notes.push("tapis_dim_impact");
  } else if (family === "plot_esterel") {
    const d = extractDiameterToken(allText);
    const h = extractHeightToken(allText);
    const both = `${d}${h}`;
    if (both) impact.push(both);
    style.push(...colors);
    notes.push("plot_diam_hauteur_impact");
  } else if (family === "miroir_routier") {
    const d =
      extractDimensionFromText(allText) || extractDiameterToken(allText);
    if (d) impact.push(d);

    const mat = extractMirrorMaterial(row, ctx);
    if (mat) style.push(mat);
    notes.push("miroir_dim_impact_material_checked");
  } else if (family === "barriere_protection") {
    const len = extractLengthCm(allText);
    const d = extractDiameterToken(allText);
    if (len) impact.push(len);
    if (d) impact.push(d);
    const c = extractColorFromColorisText(
      getAttrValues(ctx, ["coloris"]).join(" | ") || row.designation || "",
    );
    if (c) style.push(c);
    notes.push("barriere_dims_impact");
  } else if (family === "barriere_chantier") {
    const form = normalize(
      getAttrValues(ctx, ["choisissez-la-forme"]).join(" "),
    );
    if (form.includes("carre")) impact.push("CARR");
    if (form.includes("continue")) impact.push("CONT");
    const c = extractColorFromColorisText(
      getAttrValues(ctx, ["coloris"]).join(" | ") || row.designation || "",
    );
    if (c) style.push(c);
    notes.push("chantier_form_impact_color_style");
  } else if (family === "barriere_ouvrante") {
    const len = extractLengthCm(allText);
    if (len) impact.push(len);
    style.push(...colors);
    notes.push("barriere_ouvrante_dims_impact");
  } else if (family === "barriere_soulevante") {
    const len = extractLengthCm(allText);
    if (len) impact.push(len);
    const avsn = extractAvSn(row, ctx);
    if (avsn) impact.push(avsn);
    style.push(...colors);
    notes.push("barriere_soulevante_dims_impact");
  } else if (family === "saint_georges") {
    const len = extractSaintGeorgesLength(allText, row.sku_originel);
    if (len) impact.push(len);
    style.push(...colors);
    notes.push("saint_georges_dim_impact");
  } else if (family === "corbeille_carree") {
    const format = normalize(
      getAttrValues(ctx, ["choisissez-le-format", "option_2026"]).join(" "),
    );
    if (format.includes("hexag")) impact.push("HEX");
    else if (format.includes("carre")) impact.push("CARRE");
    style.push(...colors);
    notes.push("corbeille_format_impact");
  } else if (family === "corbeille_tri_selectif") {
    const count = extractPlacesToken(ctx, row);
    if (count) impact.push(`N${count}`);
    style.push(
      ...extractColorTokens(row, ctx, {
        strictAttr: true,
        allowMulti: false,
        includeSkuHints: false,
      }),
    );
    notes.push("corbeille_tri_count_impact");
  } else if (family === "parcours_sante") {
    const txt = normalize(allText);
    const el = txt.match(/\b([0-9]{2})\s*elements\b/);
    if (el) impact.push(`${Number(el[1])}EL`);
    else {
      const lot = txt.match(/\blot\s*([0-9]{1,2})\b/);
      if (lot) impact.push(`LOT${Number(lot[1])}`);
    }
    notes.push("parcours_elements_impact");
  } else if (family === "banc_recycle") {
    const len = extractLengthCm(allText);
    if (len) impact.push(len);
    style.push(...colors);
    notes.push("banc_recycle_length_cm");
  } else if (family === "potelet_coupelle") {
    const len = extractLengthCm(allText);
    if (len) impact.push(len);
    const c = extractColorFromColorisText(
      `${getAttrValues(ctx, ["coloris"]).join(" | ")} ${row.designation || ""}`,
    );
    if (c) style.push(c);
    else style.push(...colors);
    notes.push("potelet_multi_color");
  } else if (family === "poteau_cache_conteneurs") {
    const fin = normalize(
      getAttrValues(ctx, ["finition"]).join(" | ") || row.designation || "",
    );
    if (fin.includes("angle")) impact.push("ANG");
    else if (fin.includes("extremite")) impact.push("EXT");
    else if (fin.includes("intermediaire")) impact.push("INT");
    style.push(
      ...extractColorTokens(row, ctx, {
        strictAttr: true,
        allowMulti: false,
        includeSkuHints: false,
      }),
    );
    notes.push("cache_cont_role_impact");
  } else if (family === "jeu_araignee") {
    const h = extractHeightToken(allText);
    if (h) impact.push(h);
    notes.push("araignee_height_impact");
  } else if (family === "range_velo") {
    const p = extractPlacesToken(ctx, row);
    if (p) impact.push(`P${p}`);
    const len = extractLengthCm(allText);
    if (len) impact.push(len);
    style.push(
      ...extractColorTokens(row, ctx, {
        strictAttr: true,
        allowMulti: false,
        includeSkuHints: false,
      }),
    );
    notes.push("range_velo_places_impact");
  } else if (family === "arceau") {
    const ar = extractArceauImpact(allText);
    impact.push(...ar);
    style.push(
      ...extractColorTokens(row, ctx, {
        strictAttr: true,
        allowMulti: false,
        includeSkuHints: false,
      }),
    );
    notes.push("arceau_dims_impact");
  } else {
    // generic fallback from existing branches + semantic extraction
    const pb = String(row.price_branch || "")
      .split(/[.\s]+/)
      .filter(Boolean);
    const sb = String(row.style_branch || "")
      .split(/[.\s]+/)
      .filter(Boolean);

    impact.push(...pb);
    style.push(...sb);

    if (impact.some((t) => /^[0-9]{2,4}X$/.test(tokenKeepDash(t)))) {
      const fixed = extractDimensionFromText(allText);
      if (fixed) {
        impact = impact.filter((t) => !/^[0-9]{2,4}X$/.test(tokenKeepDash(t)));
        impact.push(fixed);
        notes.push("fixed_incomplete_x_dimension");
      }
    }

    if (!impact.length) {
      const maybeDim = extractDimensionFromText(allText);
      if (maybeDim) impact.push(maybeDim);
    }

    style.push(...colors);
  }

  impact = sanitizeTokens(impact);
  style = sanitizeTokens(style, { allowPlus: true });

  impact = impact
    .map((t) => normalizeImpactDimensionToken(t, allText))
    .filter(Boolean);

  // Move any remaining dimension-like tokens from style to impact.
  const dimLike = [];
  const styleKept = [];
  for (const tok of style) {
    if (
      /^(D[0-9]+|H[0-9]+|L[0-9]+CM|L[0-9]+M|[0-9]{2,4}X[0-9]{2,4}|[0-9]+A4)$/.test(
        tok,
      )
    )
      dimLike.push(tok);
    else styleKept.push(tok);
  }
  if (dimLike.length) {
    impact.push(...dimLike);
    style = styleKept;
    notes.push("moved_dim_style_to_impact");
  } else {
    style = styleKept;
  }

  // remove duplicated same-color patterns like BLAN.BLANC, JAUN.JAUNE
  style = normalizeColorSet(style);
  style = collapseStyleColorTokens(style);
  impact = sanitizeTokens(impact);
  style = sanitizeTokens(style, { allowPlus: true });

  const root = `P-${supplierCode}-${tokenClean(model || "PRODUIT")}`;

  let puid = root;
  if (impact.length) puid += `-${impact.join("-")}`;
  if (style.length) puid += `.${style.join(".")}`;

  puid = puid
    .replace(/--+/g, "-")
    .replace(/\.\.+/g, ".")
    .replace(/-\./g, ".")
    .replace(/\.-/g, ".")
    .replace(/-2\b|-3\b|-4\b|-5\b/g, "");

  return {
    family,
    puid,
    root,
    impact: impact.join("."),
    style: style.join("."),
    avsnToken,
    avsnInImpact,
    notes: uniq(notes).join("|"),
    needsReview: uniq(needsReview).join("|"),
  };
}

function buildPriceProofMap(refinedRows, variantData) {
  const proofByKey = new Map();

  // AV/SN proof when token not in impact.
  const avsnGroups = new Map();
  for (const row of refinedRows) {
    if (row.entity_level !== "variant") continue;
    if (!row.avsn_token) continue;
    if (row.avsn_in_impact === "true") continue;

    const price = variantData.priceById.get(String(row.entity_id));
    if (price === null || price === undefined) continue;

    const baseStyle = String(row.style_branch_v3 || "")
      .replace(/\b(AV|SN|AA|SA)\b/g, "")
      .replace(/\.+/g, ".");
    const key = `${row.puid_root_v3}|${row.impact_branch_v3}|${baseStyle}`;

    if (!avsnGroups.has(key))
      avsnGroups.set(key, { AV: [], SN: [], AA: [], SA: [], rows: [] });
    const entry = avsnGroups.get(key);
    entry[row.avsn_token]?.push(price);
    entry.rows.push(row);
  }

  for (const entry of avsnGroups.values()) {
    const avValues = [...(entry.AV || []), ...(entry.AA || [])];
    const snValues = [...(entry.SN || []), ...(entry.SA || [])];

    const rows = entry.rows || [];
    if (!avValues.length || !snValues.length) {
      for (const row of rows) proofByKey.set(row, "insufficient_data");
      continue;
    }

    const avSet = uniq(avValues.map((v) => String(v))).sort();
    const snSet = uniq(snValues.map((v) => String(v))).sort();
    const equal =
      avSet.length === snSet.length && avSet.every((v, i) => v === snSet[i]);
    const proof = equal
      ? `AV=SN (${avSet.join("|")})`
      : `AV!=SN (AV:${avSet.join("|")} SN:${snSet.join("|")})`;
    for (const row of rows) proofByKey.set(row, proof);
  }

  return proofByKey;
}

function detectDuplicates(refinedRows) {
  const count = new Map();
  for (const row of refinedRows) {
    if (row.entity_level !== "variant") continue;
    const key = `${row.family_detected}::${row.puid_propose_v3}`;
    count.set(key, (count.get(key) || 0) + 1);
  }

  for (const row of refinedRows) {
    if (row.entity_level !== "variant") continue;
    const key = `${row.family_detected}::${row.puid_propose_v3}`;
    const c = count.get(key) || 1;
    row.duplicate_flag = c > 1 ? `duplicate_x${c}` : "";
  }
}

function appendNeedsReview(row, flag) {
  const current = String(row.needs_review || "")
    .split("|")
    .map((x) => x.trim())
    .filter(Boolean);
  if (!current.includes(flag)) current.push(flag);
  row.needs_review = current.join("|");
}

function rebuildPuidFromBranches(row) {
  const root = String(row.puid_root_v3 || "").trim();
  const impact = String(row.impact_branch_v3 || "").trim();
  const style = String(row.style_branch_v3 || "").trim();

  let puid = root;
  if (impact) puid += `-${impact.split(".").join("-")}`;
  if (style) puid += `.${style}`;

  puid = puid
    .replace(/--+/g, "-")
    .replace(/\.\.+/g, ".")
    .replace(/-\./g, ".")
    .replace(/\.-/g, ".");

  row.puid_propose_v3 = puid;
}

function buildDuplicateCandidates(row) {
  const sku = String(row.sku_originel || "").toUpperCase();
  const rootModel = tokenClean(parseRootParts(row.puid_root_v3 || "").model);
  const parts = sku
    .split(/[^A-Z0-9]+/)
    .map((x) => stripNoiseOneSuffix(x))
    .map((x) => tokenClean(x))
    .filter(Boolean)
    .filter((x) => !/^(?:1+|DEFAULT)$/.test(x))
    .filter((x) => !(rootModel && x === rootModel));

  const candidates = [];
  for (let n = 1; n <= Math.min(parts.length, 4); n += 1) {
    let cand = tokenClean(parts.slice(-n).join(""));
    if (!cand) continue;
    if (/^[0-9]+$/.test(cand)) cand = `N${cand}`;
    candidates.push(cand.slice(0, 20));
  }

  let full = stripNoiseOneSuffix(cleanSimpleSkuModel(sku));
  if (/^[0-9]+$/.test(full)) full = `N${full}`;
  if (full) candidates.push(full.slice(0, 20));
  return uniq(candidates.filter(Boolean));
}

function resolveVariantDuplicates(refinedRows) {
  const groups = new Map();
  for (const row of refinedRows) {
    if (row.entity_level !== "variant") continue;
    const key = `${row.family_detected}::${row.puid_propose_v3}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  for (const rows of groups.values()) {
    if (rows.length < 2) continue;

    const candidateMap = new Map(
      rows.map((r) => [r, buildDuplicateCandidates(r)]),
    );
    let chosen = null;
    const maxDepth = Math.max(
      ...rows.map((r) => (candidateMap.get(r) || []).length),
      0,
    );

    for (let depth = 0; depth < maxDepth; depth += 1) {
      const picked = rows.map((r) => {
        const list = candidateMap.get(r) || [];
        return list[depth] || list[list.length - 1] || "";
      });
      const nonEmpty = picked.every(Boolean);
      const uniquePicked = new Set(picked).size === picked.length;
      if (nonEmpty && uniquePicked) {
        chosen = picked;
        break;
      }
    }

    if (!chosen) {
      chosen = rows.map((r, i) => {
        const list = candidateMap.get(r) || [];
        return list[list.length - 1] || `SKU${i + 1}`;
      });
    }

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      const dis = chosen[i];
      if (!dis) {
        appendNeedsReview(row, "DUPLICATE_NEEDS_MANUAL");
        continue;
      }

      const styleTokens = sanitizeTokens(
        String(row.style_branch_v3 || "")
          .split(".")
          .filter(Boolean),
        { allowPlus: true },
      );
      if (!styleTokens.includes(dis)) styleTokens.push(dis);
      row.style_branch_v3 = sanitizeTokens(styleTokens, {
        allowPlus: true,
      }).join(".");
      rebuildPuidFromBranches(row);
    }
  }
}

function dropRedundantVariantRows(refinedRows) {
  const groups = new Map();
  for (const row of refinedRows) {
    if (row.entity_level !== "variant") continue;
    const key = `${row.family_detected}::${row.puid_propose_v3}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  const toDrop = new Set();

  for (const rows of groups.values()) {
    if (rows.length < 2) continue;
    const bySku = new Map(
      rows.map((r) => [String(r.sku_originel || "").toUpperCase(), r]),
    );

    // Legacy duplicate convention: same sku with extra trailing "2".
    for (const row of rows) {
      const sku = String(row.sku_originel || "").toUpperCase();
      if (!sku.endsWith("2")) continue;
      const base = sku.slice(0, -1);
      if (bySku.has(base)) toDrop.add(row);
    }

    // Barnum duplicated rows where explicit -M2- mirrors a non-M2 sku.
    if (
      rows.length === 2 &&
      rows.some((r) =>
        String(r.sku_originel || "")
          .toUpperCase()
          .includes("-M2-"),
      )
    ) {
      const nonM2 = rows.find(
        (r) =>
          !String(r.sku_originel || "")
            .toUpperCase()
            .includes("-M2-"),
      );
      if (nonM2) toDrop.add(nonM2);
    }
  }

  return refinedRows.filter((r) => !toDrop.has(r));
}

function shouldDropRowForV4(row) {
  const des = normalize(row.designation || "");
  const sku = String(row.sku_originel || "").toUpperCase();
  if (des === "default") return true;
  if (/-DEFAULT$/.test(sku)) return true;
  if (des.includes("abri-rapid") || des.includes("abri rapid")) return true;
  if (/^E-(SAB3X61|SAB4X41|S3X[0-9]{4}01|S4X[0-9]{4}01|SBA3201)/.test(sku))
    return true;
  return false;
}

function hasDimensionSignal(text) {
  return Boolean(
    extractDimensionFromText(text) ||
      extractDiameterToken(text) ||
      extractLengthCm(text) ||
      extractTapisLengthToken(text, "") ||
      extractAbriDepthToken(text, ""),
  );
}

async function main() {
  const inputArg = argValue(
    "--input",
    "../docs/puid-full-export-2026-03-03T13-38-10-962Z.csv",
  );
  const inputPath = path.resolve(process.cwd(), inputArg);
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input not found: ${inputPath}`);
  }

  const outputPath = inputPath.replace(/\.csv$/i, "-v5.csv");
  const raw = fs.readFileSync(inputPath, "utf8");
  const rows = csvParse(raw, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
  });

  const variantData = await fetchVariantEnrichment(rows);
  const chairDefaults = buildChairDefaults(rows, variantData);

  const refinedRows = rows.map((row) => {
    const v3 = buildPuidV3(row, variantData, chairDefaults);
    const fullText = `${row.designation || ""} ${row.sku_originel || ""} ${getAllAttrTexts(
      {
        attrs:
          variantData.attrsByVariant.get(String(row.entity_id || "")) || {},
      },
    ).join(" ")}`;
    const impactHasDim = /(\d+X\d+|D\d+|L\d+CM|L\d+M|H\d+)/.test(
      v3.impact || "",
    );
    const dimWarning =
      row.entity_level === "variant" &&
      hasDimensionSignal(fullText) &&
      !impactHasDim
        ? "DIM_NOT_IN_IMPACT"
        : "";

    return {
      ...row,
      puid_propose_v3: v3.puid,
      puid_root_v3: v3.root,
      impact_branch_v3: v3.impact,
      style_branch_v3: v3.style,
      family_detected: v3.family,
      correction_notes: v3.notes,
      needs_review: v3.needsReview || "",
      dimension_warning: dimWarning,
      avsn_token: v3.avsnToken,
      avsn_in_impact: v3.avsnInImpact ? "true" : "false",
      avsn_price_proof: "",
      duplicate_flag: "",
    };
  });

  const beforeDropCount = refinedRows.length;
  const filteredRows = refinedRows.filter((r) => !shouldDropRowForV4(r));
  const droppedRows = beforeDropCount - filteredRows.length;

  const dedupedRows = dropRedundantVariantRows(filteredRows);

  const proofByRow = buildPriceProofMap(dedupedRows, variantData);
  for (const row of dedupedRows) {
    row.avsn_price_proof = proofByRow.get(row) || "";
  }

  resolveVariantDuplicates(dedupedRows);
  detectDuplicates(dedupedRows);

  const headers = [
    "line_type",
    "entity_level",
    "entity_id",
    "product_id",
    "designation",
    "sku_originel",
    "puid_propose",
    "puid_propose_v3",
    "puid_root",
    "puid_root_v3",
    "impact_branch_v3",
    "style_branch_v3",
    "family_detected",
    "correction_notes",
    "needs_review",
    "dimension_warning",
    "avsn_token",
    "avsn_in_impact",
    "avsn_price_proof",
    "duplicate_flag",
  ];

  fs.writeFileSync(outputPath, csvStringify(dedupedRows, headers), "utf8");

  const reviewHeaders = [
    "designation",
    "sku_originel",
    "puid_propose",
    "puid_propose_v3",
    "puid_root_v3",
    "impact_branch_v3",
    "style_branch_v3",
    "family_detected",
    "needs_review",
    "dimension_warning",
    "avsn_price_proof",
    "duplicate_flag",
    "correction_notes",
  ];
  const reviewPath = outputPath.replace(/\.csv$/i, "-review.csv");
  fs.writeFileSync(
    reviewPath,
    csvStringify(dedupedRows, reviewHeaders),
    "utf8",
  );

  const focusFamilies = new Set([
    "marca",
    "kaline",
    "coque_helene",
    "table_universelle",
    "zeno_brik",
    "rocuba",
    "venus",
    "barnum",
    "abri_modulo",
    "comptoir",
    "tapis_rouge",
    "plot_esterel",
    "miroir_routier",
    "barriere_protection",
    "barriere_chantier",
    "barriere_ouvrante",
    "barriere_soulevante",
    "corbeille_tri_selectif",
    "salsa",
    "venise",
    "florence",
    "jeu_araignee",
    "poteau_cache_conteneurs",
    "range_velo",
    "corbeille_carree",
    "banc_recycle",
    "potelet_coupelle",
    "iso_polypro",
    "cluny",
    "vitrine_tradition",
    "urne",
    "arceau",
  ]);

  const targetedRows = dedupedRows.filter((r) =>
    focusFamilies.has(r.family_detected),
  );
  const targetedPath = outputPath.replace(/\.csv$/i, "-targeted-review.csv");
  fs.writeFileSync(
    targetedPath,
    csvStringify(targetedRows, [
      "family_detected",
      "designation",
      "sku_originel",
      "puid_propose_v3",
      "impact_branch_v3",
      "style_branch_v3",
      "dimension_warning",
      "needs_review",
      "avsn_price_proof",
      "duplicate_flag",
      "correction_notes",
    ]),
    "utf8",
  );

  const families = {};
  for (const row of dedupedRows) {
    families[row.family_detected] = (families[row.family_detected] || 0) + 1;
  }

  const duplicateRows = dedupedRows.filter((r) => r.duplicate_flag).length;
  const noVariantAttrs = dedupedRows.filter(
    (r) =>
      r.entity_level === "variant" &&
      !variantData.attrsByVariant.has(String(r.entity_id || "")),
  ).length;

  console.log(
    JSON.stringify(
      {
        input: inputPath,
        output: outputPath,
        output_review: reviewPath,
        output_targeted: targetedPath,
        rows: dedupedRows.length,
        dropped_rows: droppedRows,
        duplicates_after_cleanup: duplicateRows,
        variants_without_attrs: noVariantAttrs,
        with_avsn_proof: dedupedRows.filter((r) => r.avsn_price_proof).length,
        families,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error("refine-puid-from-export failed:", error.message);
  process.exit(1);
});
