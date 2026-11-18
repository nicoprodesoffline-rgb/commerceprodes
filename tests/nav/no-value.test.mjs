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
const { axesText, shownAxes } = load("components/site/format.ts");
const { axesLabel } = load("lib/format.ts");
const { lookUp } = load("lib/site-catalog/family-lookup.ts");
const { VariantSelector } = load("components/product/variant-selector.tsx");
const { ReceiptDetails } = load("components/checkout/receipt-details.tsx");

const AXES = [{ axis_key: "type", label: "Type" }, { axis_key: "dimension", label: "Dimensions" }];
const item = (key, type, dimension) => ({ public_item_key: key, variant_axes: { type, dimension } });
const FAMILY = { slug: "mixte", name: "Table", description_short: "d", image_main_sha256: "", axes: AXES, items: [item("P1", "Produit", "120 cm"), item("P2", "Produit", "140 cm"), item("A1", "Accessoire", "rv-none")] };

const nodes = (tree, predicate) => {
  const found = [];
  (function walk(node) {
    if (!node || typeof node !== "object") return;
    if (predicate(node)) found.push(node);
    React.Children.forEach(node.props?.children, walk);
  })(tree);
  return found;
};

test("fiche : aucune pastille « rv-none » parmi les valeurs de l'axe ; les axes gardent l'ordre et les libellés", () => {
  assert.deepEqual(selectorAxes(FAMILY), [
    { axis: "type", label: "Type", values: ["Produit", "Accessoire"] },
    { axis: "dimension", label: "Dimensions", values: ["120 cm", "140 cm"] },
  ]);
});

test("sélecteur : sur un accessoire, l'axe Dimensions n'affiche aucune valeur « rv-none », ni dans l'intitulé ni en pastille ; ses valeurs restent cliquables et recalent", () => {
  const calls = [];
  const tree = VariantSelector({
    options: [...selectorAxes(FAMILY)].reverse(), items: FAMILY.items, selectedKey: "A1", onSelect: (key) => calls.push(key),
  });
  const html = renderToStaticMarkup(tree);
  assert.equal(html.includes("rv-none"), false);
  assert.equal(html.toLowerCase().includes("rv-none"), false);
  const groups = nodes(tree, (n) => n.type === "fieldset").map((n) => n.props["data-axis"]);
  assert.deepEqual(groups, ["type", "dimension"], "Type en premier");
  const radios = nodes(tree, (n) => n.type === "input");
  assert.deepEqual(radios.map((n) => n.props.value), ["Produit", "Accessoire", "120 cm", "140 cm"]);
  assert.deepEqual(radios.filter((n) => n.props.checked).map((n) => n.props.value), ["Accessoire"], "aucune dimension n'est cochée sur l'accessoire");
  assert.deepEqual(radios.map((n) => n.props.disabled), [undefined, undefined, undefined, undefined]);
  radios.find((n) => n.props.value === "140 cm").props.onChange(); // clic sur une dimension : on quitte l'accessoire
  assert.deepEqual(calls, ["P2"]);
});

test("sélecteur : un axe qui n'a qu'une valeur pour les produits mais pas pour l'accessoire n'est pas « seule option » (le clic recale)", () => {
  const items = [item("P1", "Produit", "120 cm"), item("A1", "Accessoire", "rv-none")];
  const tree = VariantSelector({ options: [{ axis: "dimension", label: "Dimensions", values: ["120 cm", "rv-none"] }], items, selectedKey: "A1", onSelect() {} });
  const html = renderToStaticMarkup(tree);
  assert.equal(html.includes("seule option"), false);
  assert.equal(html.includes("rv-none"), false);
  assert.equal(nodes(tree, (n) => n.type === "input").length, 1, "une seule pastille : 120 cm");
  // Tous les articles ont une dimension : le libellé « seule option » reste.
  const alone = VariantSelector({ options: [{ axis: "dimension", label: "Dimensions", values: ["120 cm"] }], items: [item("P1", "Produit", "120 cm")], selectedKey: "P1", onSelect() {} });
  assert.match(renderToStaticMarkup(alone), /120 cm.*seule option/);
});

test("sélecteur : un axe qui ne porte que « rv-none » n'est pas affiché du tout", () => {
  const tree = VariantSelector({ options: [{ axis: "dimension", label: "Dimensions", values: ["rv-none"] }, { axis: "type", label: "Type", values: ["Produit", "Accessoire"] }], items: [], selectedKey: "", onSelect() {} });
  assert.deepEqual(nodes(tree, (n) => n.type === "fieldset").map((n) => n.props["data-axis"]), ["type"]);
});

test("panier, devis, reçu : la ligne n'affiche pas l'axe sans valeur ; une ligne sans aucun axe à montrer se lit « Modèle unique »", () => {
  assert.equal(axesText([{ label: "Type", value: "Accessoire" }, { label: "Dimensions", value: "rv-none" }]), "Type : Accessoire");
  assert.equal(axesText([{ label: "Dimensions", value: "rv-none" }]), "Modèle unique");
  assert.deepEqual(shownAxes([{ label: "Dimensions", value: "rv-none" }, { label: "Couleur", value: "" }, { label: "Type", value: "Option" }]), [{ label: "Type", value: "Option" }]);
  assert.equal(axesLabel({ type: "Accessoire", dimension: "rv-none" }), "Type : Accessoire");
  const html = renderToStaticMarkup(ReceiptDetails({
    isOrder: true,
    receipt: { lines: [
      { public_item_key: "PI-000000CHJ", variant_axes: { type: "Accessoire", dimension: "rv-none" }, quantity: 2, unit_amount: "5.00", tax_basis_or_status: "UNQUALIFIED", line_total: "10.00" },
      { public_item_key: "PI-000000CJS", variant_axes: { dimension: "rv-none" }, quantity: 1, unit_amount: "5.00", tax_basis_or_status: "UNQUALIFIED", line_total: "5.00" },
    ] },
  }));
  assert.equal(html.includes("rv-none"), false);
  assert.match(html, /Type : Accessoire/);
  assert.equal(html.includes("Dimensions"), false);
  assert.match(html, /Modèle unique/);
});

test("favoris et comparateur : l'article unique ne porte pas l'axe sans valeur, mais garde ses axes complets pour le panier côté serveur", () => {
  const one = { ...FAMILY, items: [item("A1", "Accessoire", "rv-none")] };
  const out = lookUp(["mixte"], () => one, () => null, () => "Sur devis", () => null);
  assert.deepEqual(out.found[0].single.axes, [{ label: "Type", value: "Accessoire" }]);
  assert.deepEqual(out.found[0].single.variant_axes, { type: "Accessoire", dimension: "rv-none" }, "la clé d'axes envoyée au serveur reste exacte (C0 exige une valeur pour chaque axe)");
});
