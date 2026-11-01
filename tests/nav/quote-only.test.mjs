// « Prix sur devis » : une fenêtre dont le rate_id commence par « rq- » (montant de convention 0.01) n'est jamais affichée ni comptée.
// Génération de départ = fixture C0 F_SELL_WINDOWS (snapshot_s7) dont UNE fenêtre est passée en « rq- » en mémoire ; sans « rq- », rien ne change.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "../..");
const require = createRequire(import.meta.url);
function load(file) {
  const cache = new Map();
  function read(filename) {
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} };
    cache.set(filename, module);
    const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true, target: ts.ScriptTarget.ES2022 } }).outputText;
    const localRequire = (name) => {
      if (name.startsWith("@/") || name.startsWith(".")) {
        const base = name.startsWith("@/") ? path.join(root, name.slice(2)) : path.resolve(path.dirname(filename), name);
        return read([base, `${base}.ts`, `${base}.tsx`].find((f) => fs.existsSync(f)));
      }
      return require(name);
    };
    new Function("require", "module", "exports", code)(localRequire, module, module.exports);
    return module.exports;
  }
  return read(path.join(root, file));
}
const { previewCart } = load("lib/site-business/validate.ts");
const { priceRows } = load("lib/site-catalog/view.ts");
const { familyPrice } = load("lib/site-catalog/listing-price.ts");
const { listFamilies, parseListingQuery } = load("lib/site-catalog/listing.ts");
const { isQuoteOnlyRate, isUnpricedOnly } = load("lib/site-catalog/quote-only.ts");

const NOW = "2026-10-20T09:00:00Z";
const CHJ = "PI-000000CHJ"; // 2 fenêtres de palier (1 et 10) : reste normal
const CJS = "PI-000000CJS"; // fenêtre R-402-A (5.25) : passée en « rq- »
const original = () => JSON.parse(fs.readFileSync(path.join(root, "c0/fixtures/documents/F_SELL_WINDOWS/snapshot_s7.json"), "utf8"));
function quoteOnlyGeneration() {
  const doc = original();
  const w = doc.families[1].items[0].public_sell_price_windows[0];
  assert.equal(w.rate_id, "R-402-A");
  w.rate_id = "rq-402-A";
  w.unit_amount = "0.01";
  return { snapshot: doc, status: "ACTIVE" };
}
const body = (lines) => new TextEncoder().encode(JSON.stringify({ lines }));
const preview = (generation, lines) => previewCart({ bytes: body(lines), generation, nowUtc: NOW, catalogueSequence: 7 });
const line = (key, quantity) => ({ public_item_key: key, variant_axes: {}, quantity });
const itemOf = (generation, key) => {
  const raw = generation.snapshot.families.flatMap((f) => f.items).find((i) => i.public_item_key === key);
  return { public_item_key: key, variant_axes: raw.variant_axes, windows: raw.public_sell_price_windows };
};
const noAmount = (value) => assert.doesNotMatch(JSON.stringify(value), /0\.01|0,01|"unit_amount":"0\./);

test("le préfixe « rq- » (sensible à la casse) et les raisons qui laissent le devis possible", () => {
  assert.equal(isQuoteOnlyRate("rq-402-A"), true);
  for (const v of ["R-402-A", "RQ-402", "xrq-1", "", null, undefined, 3]) assert.equal(isQuoteOnlyRate(v), false, String(v));
  assert.equal(isUnpricedOnly(["QUOTE_ONLY"]), true);
  assert.equal(isUnpricedOnly(["PRICE_WINDOW_UNAVAILABLE"]), true);
  assert.equal(isUnpricedOnly(["QUOTE_ONLY", "PRICE_WINDOW_UNAVAILABLE"]), false);
  assert.equal(isUnpricedOnly([]), false);
});

test("aperçu : la ligne « rq- » est non chiffrée (QUOTE_ONLY), sans montant ni total ; les autres lignes restent chiffrées", () => {
  const r = preview(quoteOnlyGeneration(), [line(CHJ, 10), line(CJS, 3)]);
  assert.equal(r.status, 200);
  const [a, b] = r.body.lines;
  assert.equal(a.accepted, true);
  assert.equal(a.selection.unit_amount, "11.00");
  assert.equal(b.accepted, false);
  assert.deepEqual(b.error_codes, ["QUOTE_ONLY"]);
  assert.equal(b.selection, null);
  assert.equal(b.line_total, null);
  assert.equal(r.body.accepted, false, "une commande ne peut pas partir avec cette ligne");
  assert.equal(r.body.total_amount, null);
  assert.deepEqual(r.body.error_codes, ["QUOTE_ONLY"]);
  noAmount(b);
  noAmount(r.body.total_amount);
});

test("aperçu : seule la ligne « rq- » seule → aucun montant nulle part dans la réponse", () => {
  const r = preview(quoteOnlyGeneration(), [line(CJS, 1)]);
  assert.equal(r.body.lines[0].accepted, false);
  assert.equal(r.body.total_amount, null);
  noAmount(r.body);
});

test("réversible : sans fenêtre « rq- », l'aperçu est celui de toujours (5.25 × 3 = 15.75)", () => {
  const r = preview({ snapshot: original(), status: "ACTIVE" }, [line(CJS, 3)]);
  assert.equal(r.body.accepted, true);
  assert.equal(r.body.lines[0].selection.unit_amount, "5.25");
  assert.equal(r.body.lines[0].line_total, "15.75");
  assert.equal(r.body.total_amount, "15.75");
});

test("fiche : la grille de prix d'une variante « rq- » est non sélectionnée, sans montant ni rate_id ; les autres variantes sont intactes", () => {
  const g = quoteOnlyGeneration();
  const rows = priceRows(g, itemOf(g, CJS), NOW);
  assert.ok(rows.length >= 1);
  for (const row of rows.filter((x) => x.error_codes.includes("QUOTE_ONLY"))) {
    assert.deepEqual([row.selected, row.unit_amount, row.rate_id, row.currency, row.tax_basis_or_status], [false, null, null, null, null]);
  }
  assert.ok(rows.some((x) => x.error_codes.includes("QUOTE_ONLY")));
  noAmount(rows.filter((x) => x.error_codes.includes("QUOTE_ONLY")));
  const normal = priceRows(g, itemOf(g, CHJ), NOW);
  assert.ok(normal.every((x) => x.selected && x.unit_amount !== null));
});

test("cartes, recherche, tri et filtre : le prix « à partir de » ignore la fenêtre « rq- » ; une famille uniquement « rq- » est « Sur devis »", () => {
  const g = quoteOnlyGeneration();
  const mk = (key, name) => ({ name, slug: name, items: [itemOf(g, key)] });
  const catalog = { c0Generation: g };
  const quoteFamily = mk(CJS, "famille-devis");
  const normalFamily = mk(CHJ, "famille-normale");
  assert.equal(familyPrice(catalog, quoteFamily, NOW), null, "uniquement « rq- » → Sur devis, aucun montant");
  const p = familyPrice(catalog, normalFamily, NOW);
  assert.equal(p.amount, "10.00", "plus bas palier publié, comme avant");
  // Famille mixte : une variante « rq- » et une normale → le prix « à partir de » est celui de la normale, jamais 0.01.
  const mixed = { name: "mixte", slug: "mixte", items: [itemOf(g, CJS), itemOf(g, CHJ)] };
  assert.equal(familyPrice(catalog, mixed, NOW).amount, "10.00");
  // Filtre de prix 0 → 1 € : la famille « rq- » n'est PAS trouvée par 0,01 ; tri croissant : elle passe en dernier.
  const cheap = listFamilies([quoteFamily, normalFamily], parseListingQuery({ prix_min: "0", prix_max: "1" }), (f) => familyPrice(catalog, f, NOW));
  assert.equal(cheap.total, 0, "le montant de convention n'alimente ni le filtre ni les résultats");
  const sorted = listFamilies([quoteFamily, normalFamily], parseListingQuery({ tri: "prix-croissant" }), (f) => familyPrice(catalog, f, NOW));
  assert.deepEqual(sorted.rows.map((r) => r.family.slug), ["famille-normale", "famille-devis"]);
  assert.equal(sorted.rows[1].price, null);
  noAmount(sorted.rows.map((r) => r.price));
});
