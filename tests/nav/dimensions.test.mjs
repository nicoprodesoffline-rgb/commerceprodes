// 4.27 N9 : filtre par tranches des dimensions et du poids (docs/site_filters_v1.md §6). Exemples inventés.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { DIMENSION_LABELS, ROUND_MANTISSAS, TRANCHES_MAX, dimensionGroups, formatNumber, inTranche, measuresOf, parseTranche, readMeasure, roundBound, trancheText, trancheToken } from "../../lib/site-catalog/dimensions.ts";
import { FILTER_SETTINGS, applyFilters, pageFilters, parseFilterChoice } from "../../lib/site-catalog/filters.ts";

const tranches = JSON.parse(readFileSync(new URL("../../lib/site-catalog/fixtures/site_filters_v1/tranches.json", import.meta.url), "utf8"));
const NB = " ";

test("tranches : constantes du site égales à tranches.json", () => {
  assert.equal(tranches.rule, "tranches");
  assert.deepEqual([...ROUND_MANTISSAS], tranches.bornes_rondes);
  assert.equal(TRANCHES_MAX, tranches.tranches_max);
  assert.deepEqual(DIMENSION_LABELS.map((d) => d.label), tranches.libelles);
  assert.deepEqual({ ...FILTER_SETTINGS }, tranches.reglages_par_defaut, "mêmes réglages que les autres filtres : une seule constante");
});

test("tranches : chaque cas du jeu d'essai commun, tel quel", () => {
  assert.equal(tranches.cases.length, 8);
  for (const c of tranches.cases) {
    const settings = { ...FILTER_SETTINGS, ...(c.reglages ?? {}) };
    const got = dimensionGroups(c.families, settings).map((g) => ({ label: g.label, unit: g.unit, options: g.options.map((o) => ({ min: o.min, max: o.max, families: o.families })) }));
    assert.deepEqual(got, c.expected, c.name);
  }
});

test("lecture : « nombre unité », espaces et insécables ignorées, virgule décimale ; le reste est ignoré", () => {
  assert.equal(readMeasure(`1${NB}200${NB}cm`, "cm"), 1200);
  assert.equal(readMeasure("3,5 kg", "kg"), 3.5);
  assert.equal(readMeasure("1 200 cm", "cm"), 1200);
  assert.equal(readMeasure("80cm", "cm"), 80);
  for (const value of ["80 mm", "80 kg", "2 m", "environ 80 cm", "80", "cm", "", "3.5 cm", "-5 cm", "80 cm x 40 cm"]) assert.equal(readMeasure(value, "cm"), null, value);
  assert.equal(readMeasure("80 cm", "kg"), null, "Poids ne lit que des kg");
});

test("une famille porte une valeur par elle-même ou par ses variantes, chaque valeur distincte une fois", () => {
  const family = { characteristics: [{ label: "Longueur", value: "80 cm" }], items: [{ characteristics: [{ label: "Longueur", value: "80 cm" }, { label: "Longueur", value: "120 cm" }, { label: "Largeur", value: "9 cm" }] }] };
  assert.deepEqual(measuresOf(family, "Longueur", "cm"), [80, 120]);
});

test("bornes rondes : mantisse la plus proche, à égalité la plus petite, puissances négatives par division", () => {
  const cases = [[78, 80], [149, 150], [125, 100], [175, 150], [225, 200], [275, 250], [350, 300], [450, 400], [550, 500], [675, 600], [775, 750], [900, 800], [1000, 1000], [1234, 1000],
    [0.5, 0.5], [0.12, 0.1], [0.34, 0.3], [0.075, 0.075], [3.5, 3], [7.4, 7.5]];
  for (const [input, expected] of cases) assert.equal(roundBound(input), expected, String(input));
  assert.equal(roundBound(1.5 / 10), 0.15, "1,5 / 10 et non 1,5 × 0,1 : pas de bruit de flottant");
  assert.equal(roundBound(0.015), 0.015);
});

test("libellés des options : virgule décimale, milliers en insécable, format de la fiche", () => {
  assert.equal(formatNumber(1200), `1${NB}200`);
  assert.equal(formatNumber(3.5), "3,5");
  assert.equal(formatNumber(0.15), "0,15");
  assert.equal(trancheText(null, 80, "cm"), `moins de 80${NB}cm`);
  assert.equal(trancheText(80, 150, "cm"), `80 à 150${NB}cm`);
  assert.equal(trancheText(300, null, "cm"), `300${NB}cm et plus`);
  assert.equal(trancheText(1, 7.5, "kg"), `1 à 7,5${NB}kg`);
  assert.equal(trancheText(1000, 2500, "cm"), `1${NB}000 à 2${NB}500${NB}cm`);
});

test("adresses : 80-150, -80, 300- (point décimal) ; tout autre texte est ignoré", () => {
  assert.equal(trancheToken(80, 150), "80-150");
  assert.equal(trancheToken(null, 80), "-80");
  assert.equal(trancheToken(300, null), "300-");
  assert.equal(trancheToken(0.5, 1.5), "0.5-1.5");
  assert.deepEqual(parseTranche("80-150"), { min: 80, max: 150 });
  assert.deepEqual(parseTranche("-80"), { min: null, max: 80 });
  assert.deepEqual(parseTranche("300-"), { min: 300, max: null });
  assert.deepEqual(parseTranche("0.5-1.5"), { min: 0.5, max: 1.5 });
  for (const bad of ["", "-", "abc", "80", "80-150-200", "1,5-2", "80 - 150"]) assert.equal(parseTranche(bad), null, bad);
  assert.equal(inTranche(80, 80, 150), true, "demi-ouvert : le bas est dedans");
  assert.equal(inTranche(150, 80, 150), false, "le haut est dehors");
  assert.equal(inTranche(10, null, 80), true);
  assert.equal(inTranche(300, 300, null), true);
});

const lg = (cm, extra = []) => ({ characteristics: [{ label: "Longueur", value: `${cm} cm` }, ...extra], items: [] });
const sample = [40, 55, 70, 85, 100, 120, 160, 200, 260, 320].map((cm) => lg(cm));

test("page : OU dans un filtre, ET entre filtres, répétable ; une adresse inconnue est ignorée", () => {
  const groups = pageFilters(sample);
  assert.deepEqual(groups.map((g) => g.param), ["longueur"]);
  const tokens = groups[0].options.map((o) => o.value);
  assert.deepEqual(parseFilterChoice({ longueur: [tokens[0], tokens[1]] }), { longueur: [tokens[0], tokens[1]] });
  assert.equal(applyFilters(sample, groups, {}).length, 10);
  const inside = (token) => { const r = parseTranche(token); return sample.filter((f) => inTranche(readMeasure(f.characteristics[0].value, "cm"), r.min, r.max)).length; };
  assert.equal(applyFilters(sample, groups, { longueur: [tokens[0]] }).length, inside(tokens[0]));
  assert.equal(applyFilters(sample, groups, { longueur: [tokens[0], tokens[1]] }).length, inside(tokens[0]) + inside(tokens[1]), "OU entre tranches");
  assert.equal(applyFilters(sample, groups, { longueur: ["10-20", "abc", "9999-"] }).length, 10, "adresses inconnues : ignorées, aucun filtre");
  const withType = sample.map((f, i) => ({ ...f, characteristics: [...f.characteristics, { label: "Type", value: i % 2 === 0 ? "Banc" : "Table" }] }));
  const both = pageFilters(withType);
  assert.deepEqual(both.map((g) => g.param), ["type", "longueur"], "dimensions après Coloris, Matière et Type");
  const t = both.find((g) => g.param === "longueur").options[0].value;
  const r = parseTranche(t);
  const expected = withType.filter((f, i) => i % 2 === 0 && inTranche(readMeasure(f.characteristics[0].value, "cm"), r.min, r.max)).length;
  assert.ok(expected > 0 && expected < applyFilters(withType, both, { longueur: [t] }).length, "pré-condition : le ET restreint");
  assert.equal(applyFilters(withType, both, { type: ["Banc"], longueur: [t] }).length, expected, "ET entre filtres");
});

test("catalogue sans dimensions : aucun filtre de dimension, aucune erreur ; ancienne adresse ignorée", () => {
  const bare = Array.from({ length: 6 }, () => ({ items: [] }));
  assert.deepEqual(pageFilters(bare), []);
  assert.deepEqual(pageFilters([]), []);
  assert.equal(applyFilters(bare, pageFilters(bare), { longueur: ["80-150"] }).length, 6);
  assert.deepEqual(dimensionGroups(sample.slice(0, 4), FILTER_SETTINGS), [], "moins de familles_min familles : rien");
});

test("fiche : une dimension s'affiche comme n'importe quelle autre caractéristique", () => {
  const require = createRequire(import.meta.url);
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(new URL("../../components/product/product-sections.tsx", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function("require", "module", "exports", code)((name) => {
    if (name === "next/link") return { default: "a" };
    if (name === "@/lib/site-catalog/pastille") return { isReservedLabel: (l) => ["pastille", "teinte"].includes(l.trim().toLowerCase()) };
    if (name === "@/components/product/section-visibility") return { visibleSectionItems: (items) => (items && items.length > 0 ? items : null) };
    if (name.startsWith("@/")) return {};
    return require(name);
  }, module, module.exports);
  const html = renderToStaticMarkup(React.createElement(module.exports.ProductCharacteristics, { items: [{ label: "Longueur", value: `180${NB}cm` }, { label: "Poids", value: `3,5${NB}kg` }, { label: "Pastille", value: "Noir" }] }));
  assert.match(html, /<dt[^>]*>Longueur<\/dt><dd[^>]*>180 cm<\/dd>/);
  assert.match(html, /<dt[^>]*>Poids<\/dt><dd[^>]*>3,5 kg<\/dd>/);
  assert.doesNotMatch(html, /Pastille/);
});
