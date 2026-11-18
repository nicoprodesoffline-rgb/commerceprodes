// Valeur réservée « rv-none » (« pas de valeur » : option ou accessoire sur un axe qui ne le concerne pas) : jamais affichée, nulle part où l'acheteur lit un axe.
// Famille mixte : un axe « Type » (Produit / Accessoire / Option), un accessoire sans dimension. Aucun serveur, aucun catalogue.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "../..");
const require = createRequire(import.meta.url);
function load(file) {
  const cache = new Map();
  function read(filename) {
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} };
    cache.set(filename, module);
    const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, target: ts.ScriptTarget.ES2022 } }).outputText;
    const localRequire = (name) => {
      if (name.startsWith("@/") || name.startsWith(".")) {
        const base = name.startsWith("@/") ? path.join(root, name.slice(2)) : path.resolve(path.dirname(filename), name);
        return read([base, `${base}.ts`, `${base}.tsx`].find((f) => fs.existsSync(f)));
      }
      if (name === "react") return { ...React, useId: () => "t", useState: (initial) => [initial, () => {}] };
      return require(name);
    };
    new Function("require", "module", "exports", code)(localRequire, module, module.exports);
    return module.exports;
  }
  return read(path.join(root, file));
}
const { selectorAxes } = load("lib/site-catalog/view.ts");
const { PACK_AXIS, packValue, comparePack, sortPackValues, firstByPack } = load("lib/site-catalog/conditionnement.ts");
const { PriceGrid } = load("components/product/price-grid.tsx");
const { ReceiptDetails } = load("components/checkout/receipt-details.tsx");

// Axe « conditionnement » (lots, X achetés + Y offerts) : détecté par sa CLÉ, jamais par un libellé ; jamais de prix « à l'unité » déduit ou affiché pour un lot.
const AXES = [{ axis_key: "taille", label: "Taille" }, { axis_key: "conditionnement", label: "Conditionnement" }];
const item = (key, taille, cond) => ({ public_item_key: key, variant_axes: { taille, conditionnement: cond } });
// C0 range les Items par clé publique : ici « Lot de 20 » vient avant « Unitaire » et « Lot de 11 », l'ordre d'affichage est décidé par la vitrine.
const FAMILY = { slug: "t", name: "Table", description_short: "d", image_main_sha256: "", axes: AXES,
  items: [item("PI-A", "120 cm", "Lot de 20"), item("PI-B", "120 cm", "Lot de 11"), item("PI-C", "140 cm", "Unitaire"), item("PI-D", "120 cm", "Unitaire"), item("PI-E", "140 cm", "3 achetés + 1 offert"), item("PI-F", "120 cm", "Lot de 110")] };

test("l'axe se reconnaît à sa clé ; la valeur réservée « pas de valeur » n'est pas un conditionnement", () => {
  assert.equal(PACK_AXIS, "conditionnement");
  assert.equal(packValue({ taille: "120 cm", conditionnement: "Lot de 11" }), "Lot de 11");
  assert.equal(packValue({ taille: "120 cm" }), null);
  assert.equal(packValue({ conditionnement: "rv-none" }), null);
  assert.equal(packValue(undefined), null);
});

test("ordre proposé : sans chiffre d'abord, puis le premier entier croissant, puis alphabétique", () => {
  assert.deepEqual(sortPackValues(["Lot de 110", "Lot de 20", "Unitaire", "3 achetés + 1 offert", "Lot de 11", "Boîte"]), ["Boîte", "Unitaire", "3 achetés + 1 offert", "Lot de 11", "Lot de 20", "Lot de 110"]);
  assert.ok(comparePack("Lot de 9", "Lot de 11") < 0, "9 < 10 (nombre, pas texte)");
  assert.ok(comparePack("Lot de 11 pièces", "Lot de 11") > 0, "à entier égal, alphabétique");
});

test("fiche : seules les valeurs de l'axe « conditionnement » sont rangées ; les autres axes gardent l'ordre publié", () => {
  assert.deepEqual(selectorAxes(FAMILY), [
    { axis: "taille", label: "Taille", values: ["120 cm", "140 cm"] },
    { axis: "conditionnement", label: "Conditionnement", values: ["Unitaire", "3 achetés + 1 offert", "Lot de 11", "Lot de 20", "Lot de 110"] },
  ]);
});

test("variante présélectionnée : la première combinaison publiée dans l'ordre proposé ; sans l'axe, comportement d'avant (aucune clé forcée)", () => {
  assert.equal(firstByPack(FAMILY.items), "PI-C", "« Unitaire », première publiée dans l'ordre des Items à cette valeur");
  assert.equal(firstByPack(FAMILY.items.slice(0, 2)), "PI-B", "lots seuls : le plus petit lot");
  assert.equal(firstByPack([{ public_item_key: "X", variant_axes: { taille: "120 cm" } }]), undefined);
  assert.equal(firstByPack([]), undefined);
});

const row = { tier_quantity: 1, selected: true, error_codes: [], rate_id: "r1", unit_amount: "40.00", currency: "EUR", tax_basis_or_status: "HT", quantity_min: 1, quantity_max: null, validity_label: null };
const text = (node) => renderToStaticMarkup(node).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

test("grille de prix : « Prix unitaire » seulement hors conditionnement", () => {
  assert.match(text(React.createElement(PriceGrid, { rows: [row] })), /Prix unitaire/);
  const pack = text(React.createElement(PriceGrid, { rows: [row], pack: true }));
  assert.doesNotMatch(pack, /unitaire/i);
  assert.match(pack, /Prix/);
});

test("reçu et devis : l'en-tête ne dit pas « Prix unitaire » dès qu'une ligne est un conditionnement, et l'axe y est lisible", () => {
  const line = (cond) => ({ public_item_key: "PI-0000001", variant_axes: cond ? { taille: "120 cm", conditionnement: cond } : { taille: "120 cm" }, quantity: 2, priced: true, unit_amount: "40.00", tax_basis_or_status: "HT", line_total: "80.00" });
  const withPack = text(React.createElement(ReceiptDetails, { receipt: { lines: [line("Lot de 11")], total_amount: "80.00" }, isOrder: true }));
  assert.doesNotMatch(withPack, /unitaire/i);
  assert.match(withPack, /Lot de 11/);
  assert.match(text(React.createElement(ReceiptDetails, { receipt: { lines: [line(null)], total_amount: "80.00" }, isOrder: true })), /Prix unitaire/);
});
