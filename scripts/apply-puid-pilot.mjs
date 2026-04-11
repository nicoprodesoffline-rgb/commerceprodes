#!/usr/bin/env node
/**
 * Pilot PUID assignment on live DB variants (dry-run by default).
 *
 * Usage:
 *   node scripts/apply-puid-pilot.mjs --focus "chaise,barnum" --limit 20
 *   node scripts/apply-puid-pilot.mjs --focus "chaise,barnum" --limit 20 --apply
 */

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const ROOT = process.cwd();
const DOCS_DIR = path.resolve(ROOT, "..", "docs");
const ENV_FILE = path.join(ROOT, ".env.local");
const NOW = new Date().toISOString().replace(/[:.]/g, "-");

function argValue(name, fallback = "") {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] || fallback;
}

const APPLY = process.argv.includes("--apply");
const LIMIT = Math.max(1, Number(argValue("--limit", "20")) || 20);
const FOCUS = argValue("--focus", "");
const PRODUCT_SKUS_RAW = argValue("--product-skus", "");
const PRODUCT_SKUS = new Set(
  PRODUCT_SKUS_RAW.split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);
const REPORT_JSON = path.join(DOCS_DIR, `puid-pilot-report-${NOW}.json`);
const REPORT_CSV = path.join(DOCS_DIR, `puid-pilot-report-${NOW}.csv`);
const BACKUP_JSON = path.join(DOCS_DIR, `puid-pilot-backup-${NOW}.json`);

const SUPPLIER_MAP = {
  gmce: "GMC",
  socomix: "SOC",
  "ad production": "ADP",
  altrad: "ALT",
  benito: "BEN",
  leisure: "LEI",
  mottez: "MOT",
  rossignol: "ROS",
  prodes: "PRD",
};

const IMPACT_PRIORITY = [
  "option_2026",
  "modele",
  "structure",
  "dimension",
  "diametre",
  "classement-au-feu",
  "assemblable",
  "fixation",
  "finition",
  "option-bache",
  "option-sceau",
  "taille",
  "nombre-de-places",
  "nombre-dassises",
  "nombre-de-metres",
];

const NON_IMPACT_PRIORITY = [
  "pietement",
  "coloris",
  "couleurs",
  "couleurs-pietements",
  "couleurs-plateau",
  "finition",
  "option_2026",
];

const ALWAYS_NON_IMPACT = new Set([
  "coloris",
  "couleurs",
  "couleurs-pietements",
  "couleurs-plateau",
  "les-lots",
]);
const ALWAYS_IMPACT = new Set(["option_2026"]);

const GENERIC_WORDS = new Set([
  "chaise",
  "chaises",
  "table",
  "tables",
  "banc",
  "bancs",
  "barnum",
  "corbeille",
  "poubelle",
  "support",
  "lot",
  "avec",
  "sans",
  "de",
  "du",
  "des",
  "la",
  "le",
  "les",
  "et",
  "ou",
  "pour",
  "pro",
  "intens",
  "gamme",
  "premium",
  "aluminium",
  "acier",
  "pliant",
  "pliante",
  "bache",
]);

const COLOR_CODES = {
  bleu: "BLEU",
  noir: "NOIR",
  rouge: "ROUGE",
  vert: "VERT",
  bordeaux: "BORDEAUX",
  "gris-anthracite": "GRANTH",
  gris: "GRIS",
  blanc: "BLANC",
  beige: "BEIGE",
  marron: "MARRON",
};

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

function stripAccents(value) {
  return (value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function slugify(value) {
  return stripAccents(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function tokenClean(value) {
  return stripAccents(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "");
}

function parsePrice(value) {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function stableAttrOrder(keys, priority) {
  const set = new Set(keys);
  const first = priority.filter((k) => set.has(k));
  const rest = [...set].filter((k) => !new Set(priority).has(k)).sort();
  return [...first, ...rest];
}

function supplierCode(supplierRaw, productSku) {
  const supplierNorm = slugify(supplierRaw || "").replace(/-/g, " ");
  if (SUPPLIER_MAP[supplierNorm]) return SUPPLIER_MAP[supplierNorm];

  const sku = String(productSku || "").toUpperCase();
  if (sku.startsWith("GMC")) return "GMC";
  if (sku.startsWith("SOC")) return "SOC";
  if (sku.startsWith("BEN")) return "BEN";
  if (sku.startsWith("ALT")) return "ALT";
  if (sku.startsWith("E-")) return "ESU";

  const letters = sku.replace(/[^A-Z]/g, "");
  if (letters.length >= 3) return letters.slice(0, 3);
  return "UNK";
}

function extractModelCode(productSku, productName, supplier) {
  const raw = String(productSku || "").toUpperCase();
  let parts = raw.split(/[^A-Z0-9]+/).filter(Boolean);
  if (parts.length) {
    if (parts[0].length <= 2) parts = parts.slice(1);
    if (
      parts.length &&
      ["NU", "IGNI", "BL", "NO", "BO", "VE", "GA", "BE"].includes(
        parts[parts.length - 1],
      )
    ) {
      parts = parts.slice(0, -1);
    }
    if (parts.length) {
      let candidate = tokenClean(parts.join(""));
      if (supplier && candidate.startsWith(supplier)) {
        candidate = candidate.slice(supplier.length);
      }
      if (candidate && candidate.length >= 6 && /\d/.test(candidate))
        return candidate.slice(0, 12);
      if (candidate && candidate.length >= 5 && /^[A-Z]+$/.test(candidate))
        return candidate.slice(0, 12);
    }
  }

  const titleTokens = stripAccents(String(productName || ""))
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  for (const tok of titleTokens) {
    if (GENERIC_WORDS.has(tok)) continue;
    if (tok.length >= 4) return tokenClean(tok).slice(0, 10);
  }
  return "PRODUIT";
}

function option2026Code(value) {
  const src = stripAccents(String(value || "")).toLowerCase();
  const dim = src.match(/(\d{1,2}(?:[.,]\d)?)\s*[x×]\s*(\d{1,2}(?:[.,]\d)?)/);
  if (dim) {
    const left = dim[1].replace(/[.,]/g, "");
    const right = dim[2].replace(/[.,]/g, "");
    return `${left}X${right}`;
  }

  const parts = [];
  const mode = src.match(/\bm\s*(\d{1,2})\b/);
  if (mode) parts.push(`M${mode[1]}`);
  const dia = src.match(/diametre\s*(\d{1,3})/);
  if (dia) parts.push(`D${dia[1]}`);
  if (src.includes("avec accroche")) parts.push("AA");
  else if (src.includes("sans accroche")) parts.push("SA");
  if (parts.length) return parts.join("");
  return tokenClean(value).slice(0, 12);
}

function encodeAttrValue(attr, rawValue) {
  const valueSlug = slugify(rawValue);
  if (attr === "option_2026") return option2026Code(rawValue);
  if (
    ["coloris", "couleurs", "couleurs-pietements", "couleurs-plateau"].includes(
      attr,
    )
  ) {
    return COLOR_CODES[valueSlug] || tokenClean(rawValue).slice(0, 8);
  }
  if (attr === "pietement") {
    if (valueSlug.includes("chrome")) return "CH";
    if (valueSlug.includes("epoxy")) return "EP";
    return tokenClean(rawValue).slice(0, 6);
  }
  if (attr === "diametre") {
    const m = valueSlug.match(/(\d{1,3})/);
    if (m) return `D${m[1]}`;
  }
  return tokenClean(rawValue).slice(0, 10);
}

function detectImpactSplit(variants) {
  if (variants.length <= 1) {
    const attrs = variants[0] ? Object.keys(variants[0].attrs || {}) : [];
    return {
      impactKeys: [],
      nonImpactKeys: stableAttrOrder(attrs, NON_IMPACT_PRIORITY),
    };
  }

  const allPrices = new Set();
  const valuesByAttr = new Map();
  const priceMap = new Map(); // attr -> value -> set(prices)

  for (const v of variants) {
    if (v.price !== null) allPrices.add(v.price);
    for (const [attr, rawValue] of Object.entries(v.attrs || {})) {
      const value = slugify(rawValue);
      if (!valuesByAttr.has(attr)) valuesByAttr.set(attr, new Set());
      valuesByAttr.get(attr).add(value);
      if (v.price !== null) {
        if (!priceMap.has(attr)) priceMap.set(attr, new Map());
        if (!priceMap.get(attr).has(value))
          priceMap.get(attr).set(value, new Set());
        priceMap.get(attr).get(value).add(v.price);
      }
    }
  }

  const impact = new Set();
  const nonImpact = new Set();
  for (const [attr, values] of valuesByAttr.entries()) {
    if (values.size <= 1) continue;
    if (ALWAYS_IMPACT.has(attr)) {
      impact.add(attr);
      continue;
    }
    if (ALWAYS_NON_IMPACT.has(attr)) {
      nonImpact.add(attr);
      continue;
    }
    if (allPrices.size <= 1) {
      nonImpact.add(attr);
      continue;
    }
    const signatures = new Set();
    for (const set of priceMap.get(attr)?.values() || []) {
      signatures.add(JSON.stringify([...set].sort((a, b) => a - b)));
    }
    if (signatures.size > 1) impact.add(attr);
    else nonImpact.add(attr);
  }

  return {
    impactKeys: stableAttrOrder(impact, IMPACT_PRIORITY),
    nonImpactKeys: stableAttrOrder(nonImpact, NON_IMPACT_PRIORITY),
  };
}

function buildPuid({ supplier, model, attrs, impactKeys, nonImpactKeys }) {
  const core = [`P-${supplier}-${model}`];
  for (const k of impactKeys) {
    const raw = attrs[k];
    if (!raw) continue;
    const code = encodeAttrValue(k, raw);
    if (code) core.push(code);
  }
  let puid = core.join("-");
  const suffix = [];
  for (const k of nonImpactKeys) {
    const raw = attrs[k];
    if (!raw) continue;
    const code = encodeAttrValue(k, raw);
    if (code) suffix.push(code);
  }
  if (suffix.length) puid += `.${suffix.join(".")}`;
  return puid;
}

function toCsv(rows) {
  const headers = [
    "variant_id",
    "product_id",
    "product_sku",
    "product_name",
    "current_sku",
    "proposed_sku",
    "final_sku",
    "price",
    "impact_attrs",
    "non_impact_attrs",
    "attrs",
  ];
  const esc = (v) => {
    const s = String(v ?? "");
    if (/[,"\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.variant_id,
        r.product_id,
        r.product_sku,
        r.product_name,
        r.current_sku,
        r.proposed_sku,
        r.final_sku,
        r.price ?? "",
        (r.impact_attrs || []).join("|"),
        (r.non_impact_attrs || []).join("|"),
        JSON.stringify(r.attrs || {}),
      ]
        .map(esc)
        .join(","),
    );
  }
  return lines.join("\n");
}

async function fetchAllProducts(supabase) {
  const page = 500;
  const out = [];
  let from = 0;
  while (true) {
    const to = from + page - 1;
    const { data, error } = await supabase
      .from("products")
      .select("id,sku,name,type,status,supplier_code")
      .eq("status", "publish")
      .eq("type", "variable")
      .order("name", { ascending: true })
      .range(from, to);
    if (error) throw new Error(`products fetch: ${error.message}`);
    if (!data || !data.length) break;
    out.push(...data);
    if (data.length < page) break;
    from += page;
  }
  return out;
}

async function main() {
  loadEnv(ENV_FILE);
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local",
    );
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } },
  );

  // Build global attribute maps once.
  const [
    { data: attrsData, error: attrsErr },
    { data: termsData, error: termsErr },
  ] = await Promise.all([
    supabase.from("attributes").select("id,slug,name"),
    supabase.from("attribute_terms").select("attribute_id,slug,name"),
  ]);
  if (attrsErr) throw new Error(`attributes: ${attrsErr.message}`);
  if (termsErr) throw new Error(`attribute_terms: ${termsErr.message}`);

  const attrById = new Map((attrsData || []).map((a) => [a.id, a]));
  const termNameByAttrSlug = new Map();
  for (const t of termsData || []) {
    termNameByAttrSlug.set(`${t.attribute_id}::${t.slug}`, t.name);
  }

  const focusTokens = FOCUS.split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);

  let products = await fetchAllProducts(supabase);
  if (PRODUCT_SKUS.size > 0) {
    products = products.filter((p) => PRODUCT_SKUS.has(p.sku));
  }
  if (focusTokens.length) {
    products = products.filter((p) => {
      const txt = stripAccents(`${p.name || ""} ${p.sku || ""}`).toLowerCase();
      return focusTokens.some((t) => txt.includes(t));
    });
  }

  const plans = [];

  for (const product of products) {
    // Stop when enough variants planned.
    if (plans.length >= LIMIT) break;

    const { data: variants, error: varErr } = await supabase
      .from("variants")
      .select("id,product_id,sku,name,regular_price,status,position")
      .eq("product_id", product.id)
      .eq("status", "publish")
      .order("position", { ascending: true });
    if (varErr) throw new Error(`variants ${product.sku}: ${varErr.message}`);
    if (!variants || !variants.length) continue;

    const variantIds = variants.map((v) => v.id);
    const { data: varAttrs, error: vaErr } = await supabase
      .from("variant_attributes")
      .select("variant_id,attribute_id,term_slug")
      .in("variant_id", variantIds);
    if (vaErr)
      throw new Error(`variant_attributes ${product.sku}: ${vaErr.message}`);

    const attrsByVariant = new Map();
    for (const va of varAttrs || []) {
      if (!attrsByVariant.has(va.variant_id))
        attrsByVariant.set(va.variant_id, []);
      attrsByVariant.get(va.variant_id).push(va);
    }

    const enriched = variants.map((v) => {
      const attrs = {};
      for (const row of attrsByVariant.get(v.id) || []) {
        const attr = attrById.get(row.attribute_id);
        if (!attr?.slug) continue;
        const termName =
          termNameByAttrSlug.get(`${row.attribute_id}::${row.term_slug}`) ||
          row.term_slug;
        attrs[attr.slug.replace(/^pa_/, "")] = termName;
      }
      return {
        variant_id: v.id,
        product_id: product.id,
        product_sku: product.sku,
        product_name: product.name,
        current_sku: v.sku,
        price: parsePrice(v.regular_price),
        attrs,
      };
    });

    const { impactKeys, nonImpactKeys } = detectImpactSplit(enriched);
    const supplier = supplierCode(product.supplier_code, product.sku);
    const model = extractModelCode(product.sku, product.name, supplier);

    for (const row of enriched) {
      if (plans.length >= LIMIT) break;
      const proposed = buildPuid({
        supplier,
        model,
        attrs: row.attrs,
        impactKeys,
        nonImpactKeys,
      });
      plans.push({
        ...row,
        impact_attrs: impactKeys,
        non_impact_attrs: nonImpactKeys,
        proposed_sku: proposed,
        final_sku: proposed,
      });
    }
  }

  if (!plans.length) {
    throw new Error(
      "No pilot rows selected. Try broader --focus or higher --limit.",
    );
  }

  // Resolve collisions with existing DB SKUs.
  const { data: allVariants, error: allVarErr } = await supabase
    .from("variants")
    .select("id,sku");
  if (allVarErr) throw new Error(`variants full list: ${allVarErr.message}`);
  const pilotIds = new Set(plans.map((p) => p.variant_id));
  const used = new Set(
    (allVariants || []).filter((v) => !pilotIds.has(v.id)).map((v) => v.sku),
  );
  for (const row of plans) {
    let candidate = row.proposed_sku;
    if (!candidate) candidate = row.current_sku;
    if (used.has(candidate)) {
      let i = 2;
      while (used.has(`${candidate}-V${i}`)) i += 1;
      candidate = `${candidate}-V${i}`;
    }
    used.add(candidate);
    row.final_sku = candidate;
  }

  const report = {
    generated_at: new Date().toISOString(),
    mode: APPLY ? "apply" : "dry-run",
    focus: FOCUS,
    product_skus_filter: [...PRODUCT_SKUS],
    limit: LIMIT,
    selected: plans.length,
    updates_needed: plans.filter((p) => p.current_sku !== p.final_sku).length,
    families: [...new Set(plans.map((p) => p.product_sku))].length,
    rows: plans,
  };

  fs.mkdirSync(DOCS_DIR, { recursive: true });
  fs.writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2));
  fs.writeFileSync(REPORT_CSV, toCsv(plans));

  if (APPLY) {
    const backup = {
      generated_at: new Date().toISOString(),
      focus: FOCUS,
      limit: LIMIT,
      rows: plans.map((p) => ({
        variant_id: p.variant_id,
        product_id: p.product_id,
        product_sku: p.product_sku,
        old_sku: p.current_sku,
        new_sku: p.final_sku,
      })),
    };
    fs.writeFileSync(BACKUP_JSON, JSON.stringify(backup, null, 2));

    for (const row of plans) {
      if (row.current_sku === row.final_sku) continue;
      const { error } = await supabase
        .from("variants")
        .update({ sku: row.final_sku })
        .eq("id", row.variant_id);
      if (error) throw new Error(`update ${row.variant_id}: ${error.message}`);
    }
  }

  console.log(
    JSON.stringify(
      {
        mode: report.mode,
        selected: report.selected,
        updates_needed: report.updates_needed,
        families: report.families,
        report_json: REPORT_JSON,
        report_csv: REPORT_CSV,
        backup_json: APPLY ? BACKUP_JSON : null,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error("apply-puid-pilot failed:", err.message);
  process.exit(1);
});
