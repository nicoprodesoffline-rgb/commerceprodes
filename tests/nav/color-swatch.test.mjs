import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { normalizeColorName, swatchFor, SWATCH_KEYWORDS, RAL_SWATCHES, isColorAxis } from "../../lib/site-catalog/color-swatch.ts";

// Noms génériques fournis dans la consigne, sans lecture du catalogue.
const base = [
  ["blanc", "#f5f5f5"], ["white", "#f5f5f5"], ["noir", "#1a1a1a"], ["black", "#1a1a1a"],
  ["rouge", "#cc0000"], ["red", "#cc0000"], ["bleu fonce", "#1a4080"], ["bleu pastel", "#7bb8d4"],
  ["bleu", "#1a4080"], ["blue", "#1a4080"], ["bordeaux", "#5e1a1a"], ["vert fonce", "#1a5c3a"],
  ["vert pastel", "#7bc47e"], ["vert", "#1a5c3a"], ["green", "#1a5c3a"], ["gris soie", "#a0a09a"],
  ["gris ardoise", "#606060"], ["gris", "#606060"], ["grey", "#606060"], ["gray", "#606060"],
  ["jaune", "#f5c400"], ["yellow", "#f5c400"], ["marron", "#6b3a2a"], ["brown", "#6b3a2a"],
  ["magenta", "#cc3399"], ["rose", "#e8a0b4"], ["saumon", "#f2937a"], ["beige", "#d4b896"],
  ["anthracite", "#3a3a3a"], ["chrome", "#c0c0c0"], ["argent", "#c0c0c0"], ["silver", "#c0c0c0"],
  ["or", "#c8a850"], ["gold", "#c8a850"], ["orange", "#e07820"],
];
const extra = [
  ["gris anthracite", "#3a3a3a"], ["gris clair", "#c8c8c4"], ["bleu gentiane", "#1f3a93"],
  ["vert mousse", "#2f5233"], ["blanc pur", "#f4f4f0"],
];

test("normalisation : casse, accents NFD, tirets, soulignés, ponctuation et espaces", () => {
  assert.equal(normalizeColorName("  BLEU-FONCÉ__ /  satiné.  "), "bleu fonce satine");
  assert.equal(normalizeColorName("Gris\t  SOIE\n"), "gris soie");
  assert.equal(normalizeColorName("Écru e\u0301cru"), "ecru ecru");
  assert.equal(normalizeColorName("... — _ "), "");
});

test("table générique : 35 noms de base et 5 ajouts comptés séparément", (t) => {
  assert.equal(base.length, 35);
  assert.equal(extra.length, 5);
  assert.deepEqual(SWATCH_KEYWORDS, [...base, ...extra]);
  let count = 0;
  for (const [name, color] of base) {
    assert.equal(swatchFor(name), color, name);
    count++;
  }
  t.diagnostic(`${count}/35 noms de base avec teinte ; ${extra.length} ajouts génériques`);
  for (const [name, color] of extra) assert.equal(swatchFor(name), color, name);
});

test("la plus longue entrée gagne, puis la première position à longueur égale", () => {
  for (const [name, color] of [
    ["Bleu foncé", "#1a4080"], ["Bleu pastel", "#7bb8d4"],
    ["Gris anthracite", "#3a3a3a"], ["Vert-pastel", "#7bc47e"],
    ["Finition gris soie satinée", "#a0a09a"], ["Or puis orange", "#e07820"],
    ["Rouge puis blanc", "#cc0000"], ["Blanc puis rouge", "#f5f5f5"],
  ]) assert.equal(swatchFor(name), color, name);
});

test("frontières : aucune sous-chaîne de mot ni expression coupée", () => {
  assert.equal(swatchFor("Corde"), null);
  assert.equal(swatchFor("Orange"), "#e07820");
  assert.equal(swatchFor("Bordeaux"), "#5e1a1a");
  assert.equal(swatchFor("blanche argenté coloration"), null);
  assert.equal(swatchFor("gris très clair"), "#606060");
});

test("RAL : dix codes publics exacts, prioritaires sur les noms, avec repli", () => {
  assert.deepEqual(RAL_SWATCHES, {
    1021: "#f3b400", 3000: "#a72920", 5010: "#0e4c92", 6005: "#2f4538", 7016: "#293133",
    7035: "#cbd0cc", 8017: "#45322e", 9005: "#0e0e10", 9010: "#f4f4f4", 9016: "#f6f6f6",
  });
  for (const [code, color] of Object.entries(RAL_SWATCHES)) assert.equal(swatchFor(`Rouge RAL ${code}`), color);
  assert.equal(swatchFor("RAL 7016"), "#293133");
  assert.equal(swatchFor("Gris RAL 7035"), "#cbd0cc");
  assert.equal(swatchFor("RAL 1234"), null);
  assert.equal(swatchFor("Rouge RAL 1234"), "#cc0000");
  assert.equal(swatchFor("RAL 1234 puis ral-7016"), "#293133");
  for (const value of ["RAL 70160", "RAL 7016x", "coral 7016", "RAL7016"]) assert.equal(swatchFor(value), null, value);
});

test("valeurs inconnues ou vides : aucune teinte inventée", () => {
  for (const value of ["", "  ", "___", "inconnu", "transparent", "écru"]) assert.equal(swatchFor(value), null, value);
});

test("axes : clé ou libellé, mot entier ou préfixe, après normalisation", () => {
  for (const value of ["Coloris", "couleur", "Color", "Couleurs", "FINITION_COLORÉE"]) {
    assert.equal(isColorAxis(value, "Finition"), true, value);
    assert.equal(isColorAxis("finition", value), true, value);
  }
  for (const value of ["Longueur", "Matière", "décoloration", "bicolore", ""]) assert.equal(isColorAxis(value, value), false, value);
});

// Même transpilation TSX que les tests de composants existants ; aucun serveur ni catalogue.
const require = createRequire(import.meta.url);
const module = { exports: {} };
const code = ts.transpileModule(readFileSync(new URL("../../components/product/variant-selector.tsx", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
}).outputText;
new Function("require", "module", "exports", code)((name) => {
  if (name === "react") return { ...React, useId: () => "test-color" };
  if (name === "@/components/site/format") return { axisValue: (value) => value };
  if (name === "@/lib/site-catalog/color-swatch") return { isColorAxis, swatchFor };
  return require(name);
}, module, module.exports);
const { VariantSelector } = module.exports;

function nodes(tree, predicate) {
  const found = [];
  function walk(node) {
    if (!node || typeof node !== "object") return;
    if (predicate(node)) found.push(node);
    React.Children.forEach(node.props?.children, walk);
  }
  walk(tree);
  return found;
}

test("sélecteur : pastille décorative avant le texte, radios et indisponibilités préservées", () => {
  const calls = [];
  const tree = VariantSelector({
    options: [{ axis: "finition", label: "Coloris", values: ["Bleu pastel", "Rouge", "Inconnu"] }],
    items: [
      { public_item_key: "bleu", variant_axes: { finition: "Bleu pastel" } },
      { public_item_key: "rouge", variant_axes: { finition: "Rouge" } },
    ], selectedKey: "bleu", onSelect: (key) => calls.push(key),
  });
  assert.equal(tree.props["data-testid"], "variant-selector");
  const labels = nodes(tree, (n) => n.type === "label");
  const radios = nodes(tree, (n) => n.type === "input");
  assert.deepEqual(radios.map((n) => n.props.type), ["radio", "radio", "radio"]);
  assert.deepEqual(radios.map((n) => n.props.checked), [true, false, false]);
  assert.deepEqual(radios.map((n) => n.props.disabled), [false, false, true]);
  for (const [index, color] of [[0, "#7bb8d4"], [1, "#cc0000"]]) {
    const swatch = nodes(labels[index], (n) => n.props?.style?.backgroundColor)[0];
    assert.equal(swatch.props.style.backgroundColor, color);
    assert.equal(swatch.props["aria-hidden"], "true");
    assert.match(swatch.props.className, /\bh-4\b/);
    assert.match(swatch.props.className, /\bw-4\b/);
    assert.match(swatch.props.className, /\brounded-full\b/);
    assert.match(swatch.props.className, /\bborder-line-strong\b/);
    const children = React.Children.toArray(labels[index].props.children);
    const swatchIndex = children.findIndex((child) => child.props?.style?.backgroundColor === color);
    assert.ok(swatchIndex >= 0 && swatchIndex < children.indexOf(radios[index].props.value));
  }
  assert.equal(nodes(labels[2], (n) => n.props?.style?.backgroundColor).length, 0);
  radios[1].props.onChange();
  radios[2].props.onChange();
  assert.deepEqual(calls, ["rouge"]);
  const fieldset = nodes(tree, (n) => n.type === "fieldset")[0];
  const hint = nodes(tree, (n) => n.props?.id === fieldset.props["aria-describedby"])[0];
  assert.ok(hint);
  const html = renderToStaticMarkup(tree);
  assert.match(html, /Changez d&#x27;abord une autre option/);
  assert.match(html, /non proposé avec la sélection actuelle/);
  assert.match(html, /Inconnu/);
});

test("sélecteur : valeur unique colorée ; autre axe et inconnus sans pastille", () => {
  const render = (axis, label, values) => VariantSelector({
    options: [{ axis, label, values }], items: [], selectedKey: "", onSelect() {},
  });
  const single = render("color", "Finition", ["Blanc pur"]);
  assert.equal(nodes(single, (n) => n.props?.style?.backgroundColor)[0]?.props.style.backgroundColor, "#f4f4f0");
  assert.match(renderToStaticMarkup(single), /Blanc pur.*seule option/);
  for (const tree of [render("matiere", "Matière", ["Rouge", "Bleu"]), render("coloris", "Coloris", ["Inconnu"])]) {
    assert.equal(nodes(tree, (n) => n.props?.style?.backgroundColor).length, 0);
  }
});
