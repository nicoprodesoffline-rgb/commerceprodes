#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { parse as csvParse } from "csv-parse/sync";

const DOCS_DIR = "/Users/nico/Desktop/prodes_newsite_codex/docs";

function argValue(name, fallback = "") {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] || fallback;
}

function findLatest(pattern) {
  const files = fs.readdirSync(DOCS_DIR).filter((f) => pattern.test(f));
  if (!files.length) return "";
  files.sort((a, b) => {
    const sa = fs.statSync(path.join(DOCS_DIR, a)).mtimeMs;
    const sb = fs.statSync(path.join(DOCS_DIR, b)).mtimeMs;
    return sb - sa;
  });
  return path.join(DOCS_DIR, files[0]);
}

function normalizeText(v) {
  return String(v || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/×/g, "x")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeKey(v) {
  return normalizeText(v)
    .toUpperCase()
    .replace(/[’']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanAlnum(v) {
  return normalizeText(v)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
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

function isColorAttr(attrSlug) {
  return /pa_(coloris|couleurs|couleurs-pietements|couleurs-plateau)/i.test(
    attrSlug,
  );
}

function isForcedStyleAttr(attrSlug) {
  return /pa_couvercle-(central|lateral)-[12]/i.test(attrSlug);
}

function normalizeDesignationForMatch(v) {
  return normalizeKey(v)
    .replace(/\s*-\s*A LUNITE$/i, "")
    .replace(/\s*-\s*A L'UNITE$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function designationLooseKey(v) {
  return normalizeDesignationForMatch(v).replace(/[^A-Z0-9]/g, "");
}

function rawTokenFallback(value) {
  const t = normalizeKey(value)
    .replace(/\b(AVEC|SANS|DE|DU|DES|ET|LA|LE|LES|UN|UNE)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!t) return "";

  const withMatch = t.match(/^AVEC\s+([A-Z])/);
  if (withMatch) return `A${withMatch[1]}`;
  const sansMatch = t.match(/^SANS\s+([A-Z])/);
  if (sansMatch) return `S${sansMatch[1]}`;

  const dim = t.match(/\b\d{1,4}\s*[Xx]\s*\d{1,4}\b/);
  if (dim) return dim[0].replace(/\s+/g, "").toUpperCase();

  const dh = t.match(/D\s*\d{1,4}\s*H\s*\d{1,4}/i);
  if (dh) return dh[0].replace(/\s+/g, "").toUpperCase();

  const d = t.match(/(?:DIAMETRE|Ø)\s*(\d{1,4})/i);
  if (d) return `D${d[1]}`;

  const cm = t.match(/\b(\d{2,4})\s*CM\b/i);
  if (cm) return `${cm[1]}CM`;

  const mm = t.match(/\b(\d{2,4})\s*MM\b/i);
  if (mm) return `${mm[1]}`;

  const m = t.match(/\b(\d+(?:[.,]\d+)?)\s*M\b/i);
  if (m) {
    const n = Number(String(m[1]).replace(",", "."));
    if (Number.isFinite(n)) return `${Math.round(n * 100)}CM`;
  }

  return cleanAlnum(t).slice(0, 8);
}

function sanitizeToken(token) {
  let t = String(token || "")
    .toUpperCase()
    .trim();
  if (!t) return "";

  while (/-[0-9]+$/.test(t)) t = t.replace(/-[0-9]+$/, "");
  t = t.replace(/-/g, "");
  t = t.replace(/\.{2,}/g, ".");
  return t;
}

function splitCommaAware(value) {
  return String(value || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function colorTokenFromValue(raw, colorMap) {
  const value = normalizeKey(raw);
  if (!value) return "";

  if (colorMap.has(value)) return sanitizeToken(colorMap.get(value));

  const cleaned = value
    .replace(/[()]/g, " ")
    .replace(/\bBICOLORE\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const chunks = cleaned
    .split(/[\/+]/)
    .map((s) => s.trim())
    .filter(Boolean);

  const tokens = [];
  for (const chunk of chunks) {
    if (colorMap.has(chunk)) {
      tokens.push(sanitizeToken(colorMap.get(chunk)));
      continue;
    }

    const words = chunk.split(/\s+/).filter(Boolean);
    let matched = false;
    for (let n = Math.min(3, words.length); n >= 1; n -= 1) {
      const candidate = words.slice(0, n).join(" ");
      if (colorMap.has(candidate)) {
        tokens.push(sanitizeToken(colorMap.get(candidate)));
        matched = true;
        break;
      }
    }

    if (!matched) {
      const ral = chunk.match(/RAL\s*([0-9]{4})/i);
      if (ral && colorMap.has(`RAL${ral[1]}`)) {
        tokens.push(sanitizeToken(colorMap.get(`RAL${ral[1]}`)));
      } else {
        tokens.push(sanitizeToken(cleanAlnum(chunk).slice(0, 4)));
      }
    }
  }

  const uniq = [];
  for (const token of tokens) {
    if (!token) continue;
    if (!uniq.includes(token)) uniq.push(token);
  }

  return sanitizeToken(uniq.join("+"));
}

function mapToken(attrSlugRaw, rawValue, branch, valueMap, colorMap) {
  const attrSlug = normalizeKey(attrSlugRaw);
  const value = normalizeKey(rawValue);
  if (!value) return "";

  if (isColorAttr(attrSlugRaw)) {
    return colorTokenFromValue(rawValue, colorMap);
  }

  const direct = valueMap.get(`${attrSlug}||${value}`);
  if (direct) return sanitizeToken(direct);

  const parts = splitCommaAware(rawValue);
  if (parts.length > 1) {
    const mapped = parts.map((part) => {
      const partNorm = normalizeKey(part);
      const key = `${attrSlug}||${partNorm}`;
      return sanitizeToken(valueMap.get(key) || rawTokenFallback(part));
    });
    return sanitizeToken(mapped.filter(Boolean).join(""));
  }

  if (branch === "style") {
    const styleColor = colorTokenFromValue(rawValue, colorMap);
    if (styleColor) return sanitizeToken(styleColor);
  }

  return sanitizeToken(rawTokenFallback(rawValue));
}

function main() {
  const newsitePath = argValue(
    "--newsite-variants",
    findLatest(/^puid-full-export-with-acronymes-v2-.*-v5\.csv$/) ||
      findLatest(/^puid-full-export-with-acronymes-v2-.*\.csv$/),
  );
  const webtoffeePath = argValue(
    "--webtoffee",
    path.join(DOCS_DIR, "270226.csv"),
  );
  const valueMapPath = argValue(
    "--value-map",
    findLatest(/^webtoffee-pa-non-color-values-map-v\d+\.csv$/),
  );
  const colorMapPath = argValue(
    "--color-map",
    path.join(DOCS_DIR, "puid-color-map-proposal-v1.csv"),
  );
  const outDir = argValue("--out-dir", DOCS_DIR);

  for (const f of [newsitePath, webtoffeePath, valueMapPath, colorMapPath]) {
    if (!f || !fs.existsSync(f)) throw new Error(`Missing input file: ${f}`);
  }

  const newsiteRows = csvParse(fs.readFileSync(newsitePath, "utf8"), {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    relax_quotes: true,
    bom: true,
  });

  const webtoffeeRows = csvParse(fs.readFileSync(webtoffeePath, "utf8"), {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    relax_quotes: true,
    bom: true,
  });

  const valueRows = csvParse(fs.readFileSync(valueMapPath, "utf8"), {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    bom: true,
  });

  const colorRows = csvParse(fs.readFileSync(colorMapPath, "utf8"), {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    bom: true,
  });

  const valueMap = new Map();
  for (const r of valueRows) {
    const attr = normalizeKey(r.pa_attribute);
    const val = normalizeKey(r.value_original);
    const ab = cleanAlnum(r.abbr_value_propose);
    if (!attr || !val || !ab) continue;
    valueMap.set(`${attr}||${val}`, ab);
  }

  const colorMap = new Map();
  for (const r of colorRows) {
    const alias = normalizeKey(r.alias_detecte);
    const ab = String(r.abbr_propose || "")
      .trim()
      .toUpperCase();
    if (!alias || !ab) continue;
    colorMap.set(alias, ab);
  }

  const webBySku = new Map();
  const webByTitle = new Map();
  const webByTitleLoose = new Map();
  for (const row of webtoffeeRows) {
    const sku = normalizeKey(row.sku);
    if (sku && !webBySku.has(sku)) webBySku.set(sku, row);

    const title = normalizeDesignationForMatch(row.post_title || "");
    if (title) {
      if (!webByTitle.has(title)) webByTitle.set(title, []);
      webByTitle.get(title).push(row);

      const loose = designationLooseKey(title);
      if (!webByTitleLoose.has(loose)) webByTitleLoose.set(loose, []);
      webByTitleLoose.get(loose).push(row);
    }
  }

  const attrCols = Object.keys(webtoffeeRows[0] || {}).filter(
    (c) => c && c.startsWith("meta:attribute_pa_"),
  );

  function findWebtoffeeRow(currentVariant) {
    const sku = normalizeKey(currentVariant.sku_originel || "");
    if (sku && webBySku.has(sku)) {
      return { row: webBySku.get(sku), mode: "sku_exact" };
    }

    const title = normalizeDesignationForMatch(
      currentVariant.designation || "",
    );
    if (title) {
      const exact = webByTitle.get(title) || [];
      if (exact.length === 1) {
        return { row: exact[0], mode: "title_exact_unique" };
      }

      const loose = designationLooseKey(title);
      const looseMatches = webByTitleLoose.get(loose) || [];
      if (looseMatches.length === 1) {
        return { row: looseMatches[0], mode: "title_loose_unique" };
      }
    }

    return { row: null, mode: "no_match" };
  }

  const out = [];
  const unmatched = [];
  const stats = {
    total_variants_newsite: 0,
    sku_exact: 0,
    title_exact_unique: 0,
    title_loose_unique: 0,
    no_match: 0,
    matched_without_attributes: 0,
  };

  for (const current of newsiteRows) {
    if (String(current.entity_level || "").trim() !== "variant") continue;

    const mother = normalizeKey(current.puid_root_v3 || "");
    if (!mother.startsWith("P-")) continue;

    stats.total_variants_newsite += 1;

    const matched = findWebtoffeeRow(current);
    stats[matched.mode] += 1;

    const impactTokens = [];
    const styleTokens = [];

    if (matched.row) {
      for (const col of attrCols) {
        const rawValue = String(matched.row[col] || "").trim();
        if (!rawValue) continue;

        const attrSlugRaw = col.replace("meta:attribute_", "");
        const branch =
          isColorAttr(attrSlugRaw) || isForcedStyleAttr(attrSlugRaw)
            ? "style"
            : "impact";
        const token = mapToken(
          attrSlugRaw,
          rawValue,
          branch,
          valueMap,
          colorMap,
        );
        if (!token) continue;

        if (branch === "style") {
          if (!styleTokens.includes(token)) styleTokens.push(token);
        } else if (!impactTokens.includes(token)) {
          impactTokens.push(token);
        }
      }

      if (!impactTokens.length && !styleTokens.length) {
        stats.matched_without_attributes += 1;
      }
    } else {
      unmatched.push({
        sku_de_base: String(current.sku_originel || "").trim(),
        designation: String(current.designation || "").trim(),
        puid_de_la_mere: mother,
      });
    }

    const impact = impactTokens.join("-");
    const style = styleTokens.join(".");

    let puidFinal = mother;
    if (impact) puidFinal += `-${impact}`;
    if (style) puidFinal += `.${style}`;

    out.push({
      type: "variante",
      sku_de_base: String(current.sku_originel || "").trim(),
      puid_de_la_mere: mother,
      branche_impact: impact,
      branche_style: style,
      puid_final: puidFinal,
    });
  }

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = path.join(
    outDir,
    `puid-variations-newsite-from-webtoffee-${ts}.csv`,
  );
  writeCsv(
    out,
    [
      "type",
      "sku_de_base",
      "puid_de_la_mere",
      "branche_impact",
      "branche_style",
      "puid_final",
    ],
    outPath,
  );

  let unmatchedPath = "";
  if (unmatched.length) {
    unmatchedPath = path.join(
      outDir,
      `puid-variations-newsite-from-webtoffee-${ts}-unmatched.csv`,
    );
    writeCsv(
      unmatched,
      ["sku_de_base", "designation", "puid_de_la_mere"],
      unmatchedPath,
    );
  }

  console.log(
    JSON.stringify(
      {
        source_newsite_variants: newsitePath,
        source_webtoffee: webtoffeePath,
        source_value_map: valueMapPath,
        source_color_map: colorMapPath,
        output: outPath,
        unmatched_output: unmatchedPath || null,
        stats,
        rows: out.length,
      },
      null,
      2,
    ),
  );
}

main();
