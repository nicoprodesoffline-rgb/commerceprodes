// Cercle 3 (3.21, 3.22 ; B01 à B04) — l'ordre des familles dans une rubrique, l'ordre des rubriques, le masquage. Fonction pure `buildNavigation`, jeu R-A Bancs (F1, F2, F3), R-B Tables (F4, F5), R-C Corbeilles (vide).
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildNavigation } from "../../lib/site-catalog/navigation.ts";

const categories = (extra = {}) => [
  { category_key: "bancs", name: "Bancs", parent_category_key: null, ...(extra.bancs ?? {}) },
  { category_key: "tables", name: "Tables", parent_category_key: null, ...(extra.tables ?? {}) },
  { category_key: "corbeilles", name: "Corbeilles", parent_category_key: null, ...(extra.corbeilles ?? {}) },
];
const fam = (slug, primary, positions) => ({ slug, primary_category_key: primary, secondary_category_keys: [], ...(positions ? { category_positions: positions } : {}) });
const families = (positionsOf = {}) => [fam("f1", "bancs", positionsOf.f1), fam("f2", "bancs", positionsOf.f2), fam("f3", "bancs", positionsOf.f3), fam("f4", "tables"), fam("f5", "tables")];

test("sans place donnée (catalogue v1) : l'ordre du DTO, comme avant", () => {
  const nav = buildNavigation(categories(), families());
  assert.deepEqual(nav.familySlugs("bancs"), ["f1", "f2", "f3"]);
  assert.deepEqual(nav.menu.map((n) => n.key), ["bancs", "tables"], "R-C est vide : absente du menu");
});

test("B01 : F3 mise en tête de R-A : ordre F3, F1, F2", () => {
  const nav = buildNavigation(categories(), families({ f3: [{ category_key: "bancs", position: 1 }], f1: [{ category_key: "bancs", position: 2 }], f2: [{ category_key: "bancs", position: 3 }] }));
  assert.deepEqual(nav.familySlugs("bancs"), ["f3", "f1", "f2"]);
});

test("B01 : une famille sans place dans cette rubrique vient après celles qui en ont une, dans l'ordre du DTO", () => {
  const nav = buildNavigation(categories(), families({ f3: [{ category_key: "bancs", position: 1 }] }));
  assert.deepEqual(nav.familySlugs("bancs"), ["f3", "f1", "f2"]);
});

test("B02 : R-B placée avant R-A : le menu montre R-B avant R-A", () => {
  const nav = buildNavigation(categories({ bancs: { position: 2 }, tables: { position: 1 }, corbeilles: { position: 3 } }), families());
  assert.deepEqual(nav.menu.map((n) => n.key), ["tables", "bancs"]);
});

test("B04 : R-B masquée est absente du menu mais ses familles et sa page restent résolues", () => {
  const nav = buildNavigation(categories({ tables: { hidden: true } }), families());
  assert.deepEqual(nav.menu.map((n) => n.key), ["bancs"]);
  assert.ok(nav.node("tables"), "la page de la rubrique répond");
  assert.deepEqual(nav.familySlugs("tables"), ["f4", "f5"], "ses familles restent accessibles");
});
