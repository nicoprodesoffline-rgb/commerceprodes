import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { PALETTE, pastilleStyle, isColorAxis, namedValues, deltaE76, INDISCERNIBLE_DELTA_E } from "../../lib/site-catalog/color-swatch.ts";
import * as pastille from "../../lib/site-catalog/pastille.ts";
import { MULTICOLORE, NON_PRECISE, BICOLORE_SEPARATOR } from "../../lib/site-catalog/pastille.ts";
import * as variantChoice from "../../lib/site-catalog/variant-choice.ts";

const ral = JSON.parse(readFileSync(new URL("../../lib/site-catalog/fixtures/site_filters_v1/ral.json", import.meta.url), "utf8"));
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
  assert.doesNotMatch(source, /\bfold\b|SWATCH_KEYWORDS|RAL_SWATCHES|RAL_CLASSIC/);
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
  if (name === "@/lib/site-catalog/color-swatch") return { isColorAxis, pastilleStyle, namedValues };
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
  assert.match(html, /title="Rouge vif"/, "l'infobulle est le texte exact de l'axe");
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

// ---- N4 : teinte fine (ral.json) et règle de sûreté du sélecteur ----
const hexOf = (nuance) => palette.nuances.find((n) => n.name === nuance).hex;
const full = (value, teinte) => pastilleStyle(value, teinte)?.backgroundImage ?? null;

test("teinte fine : une partie RAL prend la teinte de ral.json avec le motif de sa nuance ; les autres gardent leur nuance", () => {
  assert.equal(ral.rule, "ral");
  assert.ok(Object.keys(ral.teintes).length >= 200);
  const nuance = full("Anthracite / Blanc");
  const fine = full("Anthracite / Blanc", "RAL 7016 / Blanc");
  assert.notEqual(fine, nuance, "la moitié RAL change");
  const half = (hex) => `linear-gradient(${hex}, ${hex})`;
  assert.equal(fine, `${half(ral.teintes["7016"])}, ${half(hexOf("Blanc"))}`, "une seule moitié a un RAL : l'autre garde sa nuance, ordre du texte respecté");
  assert.match(full("Inox", "RAL 7035"), /^repeating-linear-gradient\(90deg, #[0-9a-f]{6}/, "le motif brossé de la nuance Inox est gardé");
  assert.notEqual(full("Inox", "RAL 7035"), full("Inox"));
  assert.equal(full("Noir", "Noir"), full("Noir"), "une partie qui est un nom de nuance garde la nuance");
});

test("teinte fine mal formée : ignorée en entier, la nuance reste dessinée", () => {
  const base = full("Rouge / Blanc");
  for (const teinte of ["RAL 3020", "RAL 3020 / RAL 9003 / RAL 9010", "RAL 9999 / Blanc", "RAL 3020 / n'importe quoi", "ral 3020 / Blanc", "RAL 30X0 / Blanc", "3020 / Blanc", "", undefined, null]) {
    assert.equal(full("Rouge / Blanc", teinte), base, String(teinte));
  }
  assert.equal(full(MULTICOLORE, "RAL 3020"), full(MULTICOLORE), "pas de RAL sur Multicolore");
  assert.equal(full(NON_PRECISE, "RAL 3020"), full(NON_PRECISE), "pas de RAL sur Non précisé");
  assert.equal(pastilleStyle(undefined, "RAL 3020"), null, "Teinte seule ne dessine rien");
  assert.equal(pastilleStyle("Inconnu", "RAL 3020"), null);
});

test("ΔE CIELAB 1976 : valeurs de référence et seuil unique", () => {
  assert.equal(INDISCERNIBLE_DELTA_E, 10);
  assert.ok(deltaE76("#ffffff", "#ffffff") < 1e-9);
  assert.ok(Math.abs(deltaE76("#000000", "#ffffff") - 100) < 0.1, "noir / blanc : 100");
  assert.ok(Math.abs(deltaE76("#ff0000", "#00ff00") - 170.6) < 1, "rouge / vert : environ 170,6");
});

const items = (rows) => rows.map(([value, pastille, teinte], i) => ({ public_item_key: `k${i}`, variant_axes: { coloris: value }, ...(pastille === undefined ? {} : { pastille }), ...(teinte === undefined ? {} : { teinte }) }));
const render = (rows, selectedKey = "k0") => VariantSelector({ options: [{ axis: "coloris", label: "Coloris", values: rows.map(([v]) => v) }], items: items(rows), selectedKey, onSelect() {} });
const labelHtml = (tree) => renderToStaticMarkup(tree).match(/<label[\s\S]*?<\/label>/g);

test("sûreté : trois valeurs, deux de même pastille gardent leur nom, la troisième reste en pastille seule", () => {
  const out = labelHtml(render([["Réf. A1 (blanc)", "Blanc"], ["Réf. B2 (blanc)", "Blanc"], ["Réf. C3 (noir)", "Noir"]]));
  assert.match(out[0], /<\/span>Réf\. A1 \(blanc\)<\/label>/, "nom visible à côté de la pastille");
  assert.match(out[1], /<\/span>Réf\. B2 \(blanc\)<\/label>/);
  assert.match(out[2], /<span class="sr-only">Réf\. C3 \(noir\)<\/span><\/label>/, "pastille seule : nom réservé aux lecteurs d'écran");
  assert.match(out[2], /title="Réf\. C3 \(noir\)"/, "l'infobulle est le texte exact de l'axe");
  assert.doesNotMatch(out[0], /sr-only">Réf\. A1/);
});

test("sûreté : un bicolore identique deux fois ; le même bicolore à l'envers est une autre pastille", () => {
  const out = labelHtml(render([["A", "Rouge / Blanc"], ["B", "Rouge / Blanc"], ["C", "Blanc / Rouge"]]));
  assert.match(out[0], /<\/span>A<\/label>/);
  assert.match(out[1], /<\/span>B<\/label>/);
  assert.match(out[2], /sr-only">C<\/span><\/label>/);
});

test("sûreté : « Non précisé » garde toujours son nom, même seul", () => {
  const out = labelHtml(render([["Standard", NON_PRECISE], ["Selon nuancier", NON_PRECISE], ["Noir", "Noir"]]));
  assert.match(out[0], /<\/span>Standard<\/label>/);
  assert.match(out[1], /<\/span>Selon nuancier<\/label>/);
  assert.match(labelHtml(render([["Seul", NON_PRECISE], ["Noir", "Noir"]]))[0], /<\/span>Seul<\/label>/);
});

test("sûreté : toutes les pastilles diffèrent, tout en pastille seule ; sans pastille ou inconnue, le rendu texte d'avant", () => {
  const out = labelHtml(render([["A", "Blanc"], ["B", "Noir"], ["C", "Rouge / Noir"], ["D", undefined], ["E", "Inconnu"], ["F", "Inconnu"]]));
  for (const i of [0, 1, 2]) assert.match(out[i], /sr-only">[ABC]<\/span><\/label>/, `pastille seule ${i}`);
  assert.doesNotMatch(out[3], /<span aria-hidden/);
  assert.match(out[3], />D<\/label>/);
  assert.match(out[4], />E<\/label>/);
  assert.match(out[5], />F<\/label>/);
});

test("sûreté : le rendu final décide — deux RAL proches deviennent indiscernables, deux RAL éloignés non, motif différent non", () => {
  const close = namedValues(items([["a", "Anthracite", "RAL 7016"], ["b", "Anthracite", "RAL 7021"], ["c", "Anthracite", "RAL 7035"]]), "coloris", ["a", "b", "c"]);
  assert.ok(deltaE76(ral.teintes["7016"], ral.teintes["7021"]) < INDISCERNIBLE_DELTA_E);
  assert.ok(deltaE76(ral.teintes["7016"], ral.teintes["7035"]) >= INDISCERNIBLE_DELTA_E);
  assert.deepEqual([...close].sort(), ["a", "b"], "7016 et 7021 gardent leur nom ; 7035, éloigné, reste en pastille seule");
  assert.deepEqual([...namedValues(items([["a", "Argent"], ["b", "Inox"]]), "coloris", ["a", "b"])], [], "même teinte proche mais motifs différents : séparés");
  assert.deepEqual([...namedValues(items([["a", "Blanc"], ["b", "Crème"]]), "coloris", ["a", "b"])].sort(), [], "nuances distinctes de la palette");
  // partie par partie : même nuance « Rouge / Blanc », la seconde avec un RAL rouge proche de la nuance, la troisième avec un RAL éloigné
  const rows = [["a", "Rouge / Blanc"], ["b", "Rouge / Blanc", "RAL 3020 / Blanc"], ["c", "Rouge / Blanc", "RAL 3003 / Blanc"]];
  const nearRed = deltaE76(hexOf("Rouge"), ral.teintes["3020"]) < INDISCERNIBLE_DELTA_E;
  assert.equal(nearRed, true, "pré-condition : RAL 3020 est proche de la nuance Rouge");
  assert.ok(deltaE76(hexOf("Rouge"), ral.teintes["3003"]) >= INDISCERNIBLE_DELTA_E, "pré-condition : RAL 3003 est éloigné");
  assert.deepEqual([...namedValues(items(rows), "coloris", ["a", "b", "c"])].sort(), ["a", "b"], "a et b indiscernables, c séparé");
  assert.equal(namedValues(items([["a", "Blanc"]]), "coloris", ["a"]).size, 0);
});

test("sûreté : « Non précisé » est un aplat — un Gris clair indiscernable le garde, un Noir éloigné non ; aucun autre motif n'est un aplat déguisé", () => {
  assert.ok(deltaE76(hexOf("Gris clair"), "#d9d9d6") < INDISCERNIBLE_DELTA_E, "pré-condition : le gris neutre est proche de la nuance Gris clair");
  assert.deepEqual([...namedValues(items([["a", "Gris clair"], ["b", NON_PRECISE]]), "coloris", ["a", "b"])].sort(), ["a", "b"], "les deux gardent leur nom");
  assert.deepEqual([...namedValues(items([["a", "Noir"], ["b", NON_PRECISE]]), "coloris", ["a", "b"])], ["b"], "seul « Non précisé » garde son nom");
  const flat = (value) => /^linear-gradient\(#[0-9a-f]{6}, #[0-9a-f]{6}\)$/.test(full(value));
  const flats = palette.nuances.filter((n) => flat(n.name)).map((n) => n.motif);
  assert.ok(flats.length > 0 && flats.every((motif) => motif === "uni"), "seuls les motifs « uni » sont des aplats");
  assert.equal(flat(NON_PRECISE), true);
  assert.equal(flat(MULTICOLORE), false, "l'arc-en-ciel reste à part");
  assert.deepEqual([...namedValues(items([["a", "Gris clair"], ["b", MULTICOLORE]]), "coloris", ["a", "b"])], [], "Multicolore ne se confond avec aucun aplat : les deux restent en pastille seule");
});
