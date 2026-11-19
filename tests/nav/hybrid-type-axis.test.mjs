// Famille HYBRIDE (variantes, options, accessoires) : l'axe « Type » dit la nature de l'article ; un axe où l'article affiché porte la valeur réservée
// « rv-none » (contrat site_publisher_v1 §6) ne le concerne pas et n'est pas montré. « Type : Option » → seul l'axe « Option » ; « Type : Variante » → les
// axes des variantes. Une famille sans axe « type » est inchangée. Famille inventée, aucun serveur ni catalogue : composants réels, hooks contrôlés.
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
function load(file, stubs = {}) {
  const cache = new Map();
  function read(filename) {
    if (filename.endsWith(".json")) return JSON.parse(fs.readFileSync(filename, "utf8")); // tables de pastilles
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} };
    cache.set(filename, module);
    const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, target: ts.ScriptTarget.ES2022 } }).outputText;
    const localRequire = (name) => {
      if (Object.hasOwn(stubs, name)) return stubs[name];
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
function hooks() {
  const values = [];
  let cursor = 0;
  const useState = (initial) => {
    const index = cursor++;
    if (!(index in values)) values[index] = typeof initial === "function" ? initial() : initial;
    return [values[index], (value) => { values[index] = typeof value === "function" ? value(values[index]) : value; }];
  };
  return {
    react: { ...React, useState, useRef: (value) => useState(() => ({ current: value }))[0], useEffect() {}, useId: () => "t" },
    render: (fn, props) => { cursor = 0; return fn(props); },
  };
}
const nodes = (tree, predicate) => {
  const found = [];
  (function walk(node) {
    if (!node || typeof node !== "object") return;
    if (predicate(node)) found.push(node);
    React.Children.forEach(node.props?.children, walk);
  })(tree);
  return found;
};
const text = (tree) => {
  if (typeof tree === "string" || typeof tree === "number") return String(tree);
  return React.Children.toArray(tree?.props?.children).map(text).join("");
};

const { selectorAxes } = load("lib/site-catalog/view.ts");
const { shownAxes } = load("components/site/format.ts");
const { NO_VALUE, visibleAxes } = load("lib/site-catalog/variant-choice.ts");

// Famille inventée : 2 variantes (axe Coloris), 2 options, 1 accessoire ; « rv-none » sur chaque axe qui ne concerne pas l'article.
const AXES = [{ axis_key: "type", label: "Type" }, { axis_key: "coloris", label: "Coloris" }, { axis_key: "option", label: "Option" }, { axis_key: "accessoire", label: "Accessoire" }];
const item = (key, type, coloris, option, accessoire) => ({ public_item_key: key, variant_axes: { type, coloris, option, accessoire } });
const ITEMS = [
  item("PI-EXV1", "Variante", "Bleu exemple", NO_VALUE, NO_VALUE),
  item("PI-EXV2", "Variante", "Vert exemple", NO_VALUE, NO_VALUE),
  item("PI-EXO1", "Option", NO_VALUE, "Option Zorbex", NO_VALUE),
  item("PI-EXO2", "Option", NO_VALUE, "Option Exemple Duo", NO_VALUE),
  item("PI-EXA1", "Accessoire", NO_VALUE, NO_VALUE, "Accessoire Exemple"),
];
const FAMILY = { slug: "banc-exemple-180", name: "Banc Exemple 180", description_short: "d", image_main_sha256: "", axes: AXES, items: ITEMS };
const OPTIONS = selectorAxes(FAMILY);
const KEYS = ITEMS.map((i) => i.public_item_key);
const byKey = (key) => ITEMS.find((i) => i.public_item_key === key);
// Ce que la fiche passe au bloc d'achat (app/famille/[slug]/page.tsx) : les axes lisibles, sans « pas de valeur ».
const LABELS = new Map(AXES.map((a) => [a.axis_key, a.label]));
const buyItem = (i) => ({ ...i, axes: shownAxes(AXES.map((a) => ({ label: LABELS.get(a.axis_key), value: i.variant_axes[a.axis_key] ?? "" }))), image_sha256: null, rows: [] });

/** Le sélecteur réel, piloté comme dans le navigateur : l'état des choix épinglés persiste d'un rendu à l'autre, `onSelect` déplace l'article affiché. */
let live = hooks(); // un jeu de hooks par sélecteur piloté ; le module n'est chargé qu'une fois
const { VariantSelector } = load("components/product/variant-selector.tsx", {
  react: { ...React, useState: (v) => live.react.useState(v), useRef: (v) => live.react.useRef(v), useEffect() {}, useId: () => "t" },
});
function selector(options, items, startKey) {
  const h = (live = hooks());
  let key = startKey;
  const shown = () => h.render(VariantSelector, { options, items, selectedKey: key, onSelect: (next) => { key = next; } });
  return {
    get key() { return key; },
    groups: () => nodes(shown(), (n) => n.type === "fieldset").map((n) => n.props["data-axis"]),
    radios: (axis) => nodes(shown(), (n) => n.type === "input" && n.props.name === `t-${axis}`),
    html: () => renderToStaticMarkup(shown()),
    click(axis, value) {
      const radio = nodes(shown(), (n) => n.type === "input" && n.props.name === `t-${axis}` && n.props.value === value)[0];
      assert.ok(radio, `pastille ${axis} = ${value} visible`);
      radio.props.onChange();
    },
  };
}

test("famille hybride : chaque type ne montre que ses axes ; l'article retenu est toujours un article réel de la famille ; jamais « rv-none » à l'écran", () => {
  const s = selector(OPTIONS, ITEMS, "PI-EXV1");
  const step = (expectedGroups, expectedType) => {
    assert.ok(KEYS.includes(s.key), `article réel : ${s.key}`);
    assert.equal(byKey(s.key).variant_axes.type, expectedType);
    assert.deepEqual(s.groups(), expectedGroups, `axes visibles pour ${s.key}`);
    assert.equal(s.html().toLowerCase().includes("rv-none"), false);
  };
  step(["type", "coloris"], "Variante");
  assert.deepEqual(s.radios("coloris").map((n) => n.props.value), ["Bleu exemple", "Vert exemple"]);
  assert.doesNotMatch(s.html(), /Option Zorbex|Accessoire Exemple/, "« Type : Variante » : ni l'axe Option, ni l'axe Accessoire");

  s.click("type", "Option");
  step(["type", "option"], "Option");
  assert.deepEqual(s.radios("option").map((n) => [n.props.value, n.props["data-compatible"]]), [["Option Zorbex", "true"], ["Option Exemple Duo", "true"]], "aucune option grisée");
  assert.doesNotMatch(s.html(), /Coloris|Bleu exemple|Accessoire Exemple/, "« Type : Option » : seul l'axe Option");

  s.click("option", "Option Exemple Duo");
  assert.equal(s.key, "PI-EXO2");
  step(["type", "option"], "Option");

  s.click("type", "Accessoire");
  step(["type", "accessoire"], "Accessoire");
  assert.doesNotMatch(s.html(), /Coloris|Option Zorbex/);

  s.click("type", "Variante");
  step(["type", "coloris"], "Variante");
  s.click("coloris", "Vert exemple");
  assert.equal(s.key, "PI-EXV2");
  step(["type", "coloris"], "Variante");
});

test("famille hybride (propriété) : depuis chaque article, chaque type mène à un article réel de ce type, qui montre l'axe Type et ses seuls axes renseignés", () => {
  for (const from of KEYS) for (const type of ["Variante", "Option", "Accessoire"]) {
    const s = selector(OPTIONS, ITEMS, from);
    if (byKey(from).variant_axes.type !== type) s.click("type", type);
    const reached = byKey(s.key);
    assert.ok(reached, `${from} → ${type}`);
    assert.equal(reached.variant_axes.type, type);
    const expected = ["type", ...AXES.map((a) => a.axis_key).filter((a) => a !== "type" && reached.variant_axes[a] !== NO_VALUE)];
    assert.deepEqual(s.groups(), expected, `${from} → ${type}`);
    assert.equal(s.html().includes("rv-none"), false);
  }
});

test("famille hybride : le libellé choisi arrive dans le bloc d'achat, puis dans le panier, sans « rv-none »", async () => {
  // 1. Le choix dans le sélecteur réel : « Type : Option », puis la seconde option.
  const s = selector(OPTIONS, ITEMS, "PI-EXV1");
  s.click("type", "Option");
  s.click("option", "Option Exemple Duo");
  const chosen = s.key;
  assert.equal(chosen, "PI-EXO2");

  // 2. Le bloc d'achat réel reçoit ce choix (même `onSelect` que le sélecteur) et l'affiche.
  const h = hooks(), added = [];
  const VariantSelector = () => null;
  const { FamilyBuyBox } = load("components/product/family-buy-box.tsx", {
    react: h.react, "next/link": "a", "next/navigation": { useRouter: () => ({ push() {} }) },
    "@/components/cart/cart-provider": { MAX_QUANTITY: 1000000, useCart: () => ({ add: (draft) => added.push(draft), lines: [] }) },
    "@/components/product/variant-selector": { VariantSelector },
    "@/components/product/price-grid": { PriceGrid: () => null },
    "@/components/site/api": {
      previewCart: async (lines) => ({ status: 200, network: false, json: { catalogue_sequence: 7, lines: [{ public_item_key: lines[0].public_item_key, quantity: lines[0].quantity, accepted: true, selection: { unit_amount: "12.00", tax_basis_or_status: "HT" }, error_codes: [] }] } }),
    },
  });
  const props = { familyName: FAMILY.name, familySlug: FAMILY.slug, schema: OPTIONS, items: ITEMS.map(buyItem) };
  let tree = h.render(FamilyBuyBox, props);
  nodes(tree, (n) => n.type === VariantSelector)[0].props.onSelect(chosen);
  tree = h.render(FamilyBuyBox, props);
  const heading = text(nodes(tree, (n) => n.props?.["data-testid"] === "selected-variant")[0]);
  assert.match(heading, /Type : Option · Option : Option Exemple Duo/);
  assert.doesNotMatch(heading, /Coloris|Accessoire|rv-none/);
  assert.equal(text(tree).includes("rv-none"), false);

  // 3. « Ajouter au panier » : la ligne ajoutée porte ce libellé.
  const previous = { document: globalThis.document, HTMLElement: globalThis.HTMLElement };
  globalThis.document = { activeElement: null };
  globalThis.HTMLElement = class {};
  try {
    await nodes(tree, (n) => n.type === "button" && n.props.className?.includes("product-add-to-cart"))[0].props.onClick();
  } finally { Object.assign(globalThis, previous); }
  assert.equal(added.length, 1);
  assert.equal(added[0].public_item_key, chosen);
  assert.deepEqual(added[0].variant_axes, byKey(chosen).variant_axes, "le serveur reçoit les axes complets (C0 exige une valeur pour chaque axe)");
  tree = h.render(FamilyBuyBox, props);
  assert.match(text(tree), /Ajouté au panier — 1 × Type : Option · Option : Option Exemple Duo/);

  // 4. Le panier réel affiche la ligne avec ce libellé.
  const { CartLines } = load("components/cart/cart-summary.tsx", { "next/link": "a" });
  const html = renderToStaticMarkup(React.createElement(CartLines, { lines: added, preview: null, loading: false, editable: true, onQuantity() {}, onRemove() {} }));
  assert.match(html, /Type : Option · Option : Option Exemple Duo/);
  assert.match(html, /Banc Exemple 180/);
  assert.equal(html.toLowerCase().includes("rv-none"), false);
  assert.doesNotMatch(html, /Coloris/);
  // Une valeur longue (60 à 100 caractères, même sans espace) revient à la ligne dans le panier et dans le tiroir : mesuré à 360 px, voir le message de commit.
  assert.match(html, /\[overflow-wrap:anywhere\]">Type : Option/);
  assert.match(fs.readFileSync(path.join(root, "components/cart/cart-drawer.tsx"), "utf8"), /\[overflow-wrap:anywhere\]">\{axesText\(l\.axes\)\}/);
});

test("famille sans axe « type » : rien ne change, un axe « rv-none » pour l'article affiché reste montré (titre et pastilles qui recalent)", () => {
  const plain = [
    { public_item_key: "PI-EXP1", variant_axes: { coloris: "Bleu exemple", taille: "120 cm" } },
    { public_item_key: "PI-EXP2", variant_axes: { coloris: "Vert exemple", taille: "140 cm" } },
    { public_item_key: "PI-EXP3", variant_axes: { coloris: "Vert exemple", taille: NO_VALUE } },
  ];
  const options = selectorAxes({ ...FAMILY, axes: [{ axis_key: "coloris", label: "Coloris" }, { axis_key: "taille", label: "Taille" }], items: plain });
  assert.deepEqual(visibleAxes(options, plain[2].variant_axes).map((o) => o.axis), ["coloris", "taille"], "sans axe « type », aucun axe n'est retiré");
  const s = selector(options, plain, "PI-EXP3");
  assert.deepEqual(s.groups(), ["coloris", "taille"]);
  assert.deepEqual(s.radios("taille").map((n) => [n.props.value, n.props.checked]), [["120 cm", false], ["140 cm", false]]);
  assert.equal(s.html().includes("rv-none"), false);
  s.click("taille", "140 cm");
  assert.equal(s.key, "PI-EXP2", "le clic recale sur l'article publié, comme avant");
  // L'ordre et la présence des axes d'une famille ordinaire sont ceux de `orderAxes`, inchangés.
  assert.deepEqual(visibleAxes([{ axis: "b", label: "B" }, { axis: "a", label: "A" }], {}).map((o) => o.axis), ["b", "a"]);
});

test("famille hybride : l'axe « type » n'est jamais retiré, et l'article affiché inconnu ne retire rien", () => {
  assert.deepEqual(visibleAxes(OPTIONS, { type: NO_VALUE, coloris: NO_VALUE, option: "Option Zorbex", accessoire: NO_VALUE }).map((o) => o.axis), ["type", "option"]);
  assert.deepEqual(visibleAxes(OPTIONS, {}).map((o) => o.axis), ["type", "coloris", "option", "accessoire"]);
});
