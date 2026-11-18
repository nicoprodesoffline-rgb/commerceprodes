import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { PALETTE, pastilleStyle, isColorAxis } from "../../lib/site-catalog/color-swatch.ts";
import { MULTICOLORE, NON_PRECISE, BICOLORE_SEPARATOR } from "../../lib/site-catalog/pastille.ts";
import * as variantChoice from "../../lib/site-catalog/variant-choice.ts";

const palette = JSON.parse(readFileSync(new URL("../../lib/site-catalog/fixtures/site_filters_v1/palette.json", import.meta.url), "utf8"));
const image = (value) => pastilleStyle(value)?.backgroundImage ?? null;

test("palette : la table du site égale palette.json, nom, teinte et motif", () => {
  assert.equal(palette.rule, "palette");
  assert.deepEqual(PALETTE.map(([name, hex, motif]) => ({ name, hex, motif })), palette.nuances);
  assert.deepEqual([MULTICOLORE, NON_PRECISE, BICOLORE_SEPARATOR], [palette.speciaux.multicolore, palette.speciaux.non_precise, palette.speciaux.separateur_bicolore]);
  for (const motif of new Set(palette.nuances.map((n) => n.motif))) assert.ok(["uni", "metal", "brosse", "galva", "bois", "transparent"].includes(motif), motif);
});

test("chaque nuance a une pastille ; les motifs se distinguent d'une teinte unie voisine", () => {
  for (const n of palette.nuances) assert.notEqual(pastilleStyle(n.name), null, n.name);
  const byName = Object.fromEntries(palette.nuances.map((n) => [n.name, n]));
  assert.match(image("Blanc"), /^linear-gradient\(#[0-9a-f]{6}, #[0-9a-f]{6}\)$/, "uni : un aplat");
  assert.match(image("Argent"), /^linear-gradient\(135deg/, "metal");
  assert.match(image("Inox"), /^repeating-linear-gradient\(90deg/, "brosse");
  assert.match(image("Galvanisé"), /^conic-gradient\(from 30deg/, "galva");
  assert.match(image("Bois"), /^repeating-linear-gradient\(100deg/, "bois");
  assert.match(image("Transparent"), /^repeating-linear-gradient\(45deg/, "transparent");
  const motifs = new Set(Object.values(byName).map((n) => n.motif));
  assert.equal(motifs.size, 6);
  const looks = new Set(["Blanc", "Argent", "Inox", "Galvanisé", "Bois", "Transparent"].map(image));
  assert.equal(looks.size, 6, "six rendus différents");
});

test("bicolore « A / B » : deux moitiés, A puis B, dans l'ordre du texte ; jamais de visuel générique", () => {
  const style = pastilleStyle("Rouge / Blanc");
  assert.equal(style.backgroundImage, `${image("Rouge")}, ${image("Blanc")}`);
  assert.equal(style.backgroundSize, "50% 100%, 50% 100%");
  assert.equal(style.backgroundPosition, "left top, right top");
  assert.notEqual(pastilleStyle("Blanc / Rouge").backgroundImage, style.backgroundImage, "l'ordre du texte est respecté");
  assert.equal(pastilleStyle("Blanc / Rouge").backgroundImage, `${image("Blanc")}, ${image("Rouge")}`);
  assert.equal(pastilleStyle("Inox / Noir").backgroundImage, `${image("Inox")}, ${image("Noir")}`, "chaque moitié garde son motif");
  assert.equal(pastilleStyle("Rouge / Inconnu"), null, "une moitié inconnue : aucune pastille, rien de deviné");
  assert.equal(pastilleStyle("Rouge / Blanc / Noir"), null);
});

test("Multicolore : arc-en-ciel ; Non précisé : neutre ; inconnu ou absent : aucune pastille", () => {
  assert.match(image(MULTICOLORE), /^conic-gradient/);
  assert.match(image(NON_PRECISE), /^linear-gradient\(#[0-9a-f]{6}, #[0-9a-f]{6}\)$/);
  assert.notEqual(image(MULTICOLORE), image(NON_PRECISE));
  for (const value of ["", undefined, null, "Inconnu", "bleu", "BLEU", "Noire", "RAL 9005", "9005", "Standard", "Transparent ", "galva", "Bicolore"]) assert.equal(pastilleStyle(value), null, String(value));
});

test("le site ne devine rien : aucun nom de couleur ne se cherche dans un texte, aucune teinte écrite tout en chiffres", () => {
  const source = readFileSync(new URL("../../lib/site-catalog/color-swatch.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /\bfold\b|SWATCH_KEYWORDS|RAL_/);
  assert.doesNotMatch(source, /#\d{6}\b/);
  assert.equal(PALETTE.some(([, hex]) => /^#\d{6}$/.test(hex)), false);
  assert.equal(pastilleStyle("Noir très foncé"), null);
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
  if (name === "react") return { ...React, useId: () => "test-color", useState: (initial) => [initial, () => {}] };
  if (name === "@/lib/site-catalog/variant-choice") return variantChoice;
  if (name === "@/components/site/format") return { axisValue: (value) => value };
  if (name === "@/lib/site-catalog/color-swatch") return { isColorAxis, pastilleStyle };
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
const tinted = (n) => n.props?.style?.backgroundImage;

test("sélecteur : pastille de la « Pastille » de la variante, texte et nom accessible inchangés, radios et indisponibilités préservées", () => {
  const calls = [];
  const tree = VariantSelector({
    options: [{ axis: "finition", label: "Coloris", values: ["Bleu pastel", "Rouge vif", "Inconnu", "Sans nuance"] }],
    items: [
      { public_item_key: "bleu", variant_axes: { finition: "Bleu pastel" }, pastille: "Bleu clair" },
      { public_item_key: "rouge", variant_axes: { finition: "Rouge vif" }, pastille: "Rouge / Blanc" },
      { public_item_key: "sans", variant_axes: { finition: "Sans nuance" } },
    ], selectedKey: "bleu", onSelect: (key) => calls.push(key),
  });
  const labels = nodes(tree, (n) => n.type === "label");
  const radios = nodes(tree, (n) => n.type === "input");
  assert.deepEqual(radios.map((n) => n.props.value), ["Bleu pastel", "Rouge vif", "Inconnu", "Sans nuance"], "le texte exact de l'axe");
  assert.deepEqual(radios.map((n) => n.props.checked), [true, false, false, false]);
  assert.deepEqual(radios.map((n) => n.props["data-compatible"]), ["true", "true", "false", "true"]);
  const swatch0 = nodes(labels[0], (n) => tinted(n))[0];
  assert.equal(swatch0.props.style.backgroundImage, image("Bleu clair"), "la nuance vient de la Pastille, pas du texte « Bleu pastel »");
  assert.equal(swatch0.props["aria-hidden"], "true");
  assert.match(swatch0.props.className, /\brounded-full\b/);
  assert.equal(nodes(labels[1], (n) => tinted(n))[0].props.style.backgroundImage, `${image("Rouge")}, ${image("Blanc")}`, "bicolore : deux moitiés");
  assert.equal(nodes(labels[2], (n) => tinted(n)).length, 0, "aucune variante ne la porte : aucune pastille");
  assert.equal(nodes(labels[3], (n) => tinted(n)).length, 0, "variante sans Pastille : aucune pastille, le texte reste écrit");
  radios[1].props.onChange();
  radios[2].props.onChange();
  assert.deepEqual(calls, ["rouge"]);
  const html = renderToStaticMarkup(tree);
  assert.match(html, /Rouge vif/);
  assert.doesNotMatch(html, /title="Rouge/);
});

test("sélecteur : un axe « Type » déclaré EN DERNIER par la Factory s'affiche en premier ; les autres gardent leur ordre", () => {
  const tree = VariantSelector({
    options: [
      { axis: "couleur", label: "Couleur", values: ["Rouge", "Bleu"] },
      { axis: "taille", label: "Taille", values: ["S", "M"] },
      { axis: "type_assise", label: "Type de siège", values: ["Fixe", "Pivotant"] },
    ],
    items: [], selectedKey: "", onSelect() {},
  });
  assert.deepEqual(nodes(tree, (n) => n.type === "fieldset").map((n) => n.props["data-axis"]), ["type_assise", "couleur", "taille"]);
});

test("sélecteur : valeur unique avec Pastille ; autre axe, sans Pastille : aucune pastille", () => {
  const render = (axis, label, values, pastille) => VariantSelector({
    options: [{ axis, label, values }], items: values.map((v, i) => ({ public_item_key: `k${i}`, variant_axes: { [axis]: v }, pastille })), selectedKey: "k0", onSelect() {},
  });
  const single = render("color", "Finition", ["Blanc pur"], "Blanc");
  assert.equal(nodes(single, (n) => tinted(n))[0]?.props.style.backgroundImage, image("Blanc"));
  assert.match(renderToStaticMarkup(single), /Blanc pur.*seule option/);
  for (const tree of [render("matiere", "Matière", ["Rouge", "Bleu"], "Rouge"), render("coloris", "Coloris", ["Inconnu"], undefined)]) assert.equal(nodes(tree, (n) => tinted(n)).length, 0);
});
