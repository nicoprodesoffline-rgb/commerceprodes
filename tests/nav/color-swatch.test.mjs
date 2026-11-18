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
  // palette.json et ral.json sont recopiés à l'octet (décision de l'Owner, teintes comprises) : seul le CODE ne porte aucune teinte tout en chiffres.
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

// ---- N4 : teinte fine (ral.json), pastille seule sur la fiche, et fonctions de MESURE de la comparaison ----
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

const inkOf = (out, i) => /<span class="sr-only">[^<]+<\/span><\/label>/.test(out[i]); // pastille seule : le nom n'est que pour les lecteurs d'écran

test("fiche : toute valeur qui a une pastille est en pastille seule, même quand deux pastilles se confondent", () => {
  const rows = [["Réf. A1 (blanc)", "Blanc"], ["Réf. B2 (blanc)", "Blanc"], ["Réf. C3 (noir)", "Noir"], ["Étiquette D", "Rouge / Blanc"], ["Étiquette E", "Rouge / Blanc"],
    ["Étiquette F", "Anthracite", "RAL 7016"], ["Étiquette G", "Anthracite", "RAL 7021"], ["Étiquette H", NON_PRECISE], ["Étiquette I", NON_PRECISE], ["Étiquette J", "Gris clair"], ["Étiquette K", MULTICOLORE]];
  assert.ok(namedValues(items(rows), "coloris", rows.map(([v]) => v)).size >= 8, "pré-condition : la mesure voit bien des pastilles qui se confondent");
  const out = labelHtml(render(rows));
  assert.equal(out.length, rows.length);
  rows.forEach(([value], i) => {
    assert.ok(inkOf(out, i), `pastille seule : ${value}`);
    assert.match(out[i], /<span aria-hidden="true"/, `pastille dessinée : ${value}`);
    assert.equal(out[i].replace(/<span class="sr-only">[^<]+<\/span>/, "").replace(/<[^>]*>/g, ""), "", `aucun texte visible à côté de la pastille : ${value}`);
    assert.match(out[i], new RegExp(`title="${value.replace(/[.()]/g, "\\$&")}"`), `l'infobulle est le texte exact : ${value}`);
  });
});

test("fiche : « Non précisé » est lui aussi en pastille seule ; la légende écrit la valeur choisie", () => {
  const out = labelHtml(render([["Standard", NON_PRECISE], ["Noir", "Noir"]]));
  assert.ok(inkOf(out, 0));
  assert.match(renderToStaticMarkup(render([["Standard", NON_PRECISE], ["Noir", "Noir"]])), /<legend[^>]*>Coloris<span class="font-normal text-ink-2"> : Standard<\/span><\/legend>/);
});

test("fiche : seule une valeur sans « Pastille » publiée (ancien catalogue) reste en texte", () => {
  const out = labelHtml(render([["Texte A", undefined], ["Texte B", undefined], ["Pastillée", "Noir"], ["Inconnue", "Inconnu"]]));
  assert.doesNotMatch(out[0], /<span aria-hidden/);
  assert.match(out[0], />Texte A<\/label>/);
  assert.match(out[1], />Texte B<\/label>/);
  assert.ok(inkOf(out, 2));
  assert.match(out[3], />Inconnue<\/label>/, "valeur de Pastille inconnue : aucune pastille, le texte reste");
});

test("mesure : le rendu final décide — deux RAL proches deviennent indiscernables, deux RAL éloignés non, motif différent non", () => {
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

test("mesure : « Non précisé » est un aplat — un Gris clair indiscernable le garde, un Noir éloigné non ; aucun autre motif n'est un aplat déguisé", () => {
  assert.ok(deltaE76(hexOf("Gris clair"), "#d9d9d6") < INDISCERNIBLE_DELTA_E, "pré-condition : le gris neutre est proche de la nuance Gris clair");
  assert.deepEqual([...namedValues(items([["a", "Gris clair"], ["b", NON_PRECISE]]), "coloris", ["a", "b"])].sort(), ["a", "b"], "les deux sont relevés");
  assert.deepEqual([...namedValues(items([["a", "Noir"], ["b", NON_PRECISE]]), "coloris", ["a", "b"])], ["b"], "seul « Non précisé » est relevé");
  const flat = (value) => /^linear-gradient\(#[0-9a-f]{6}, #[0-9a-f]{6}\)$/.test(full(value));
  const flats = palette.nuances.filter((n) => flat(n.name)).map((n) => n.motif);
  assert.ok(flats.length > 0 && flats.every((motif) => motif === "uni"), "seuls les motifs « uni » sont des aplats");
  assert.equal(flat(NON_PRECISE), true);
  assert.equal(flat(MULTICOLORE), false, "l'arc-en-ciel reste à part");
  assert.deepEqual([...namedValues(items([["a", "Gris clair"], ["b", MULTICOLORE]]), "coloris", ["a", "b"])], [], "Multicolore ne se confond avec aucun aplat : les deux restent en pastille seule");
});

test("teinte « #rrggbb » : une partie hexadécimale prend cette teinte avec le motif de sa nuance ; mal écrite, la Teinte est ignorée en entier", () => {
  const half = (hex) => `linear-gradient(${hex}, ${hex})`;
  assert.equal(full("Gris", "#5b6770"), half("#5b6770"));
  assert.equal(full("Anthracite / Blanc", "#5b6770 / Blanc"), `${half("#5b6770")}, ${half(hexOf("Blanc"))}`, "une seule moitié a une teinte directe : l'autre garde sa nuance");
  assert.equal(full("Gris / Noir", "#5b6770 / RAL 7016"), `${half("#5b6770")}, ${half(ral.teintes["7016"])}`, "hexadécimal et RAL dans la même teinte");
  assert.match(full("Inox", "#5b6770"), /^repeating-linear-gradient\(90deg, #5b6770 /, "le motif brossé de la nuance Inox est gardé");
  assert.match(full("Bois", "#aa8f5c"), /^repeating-linear-gradient\(100deg, #aa8f5c /, "le motif bois est gardé");
  for (const bad of ["#5B6770", "#5b677", "#5b67700", "5b6770", "#5b677g", "# 5b6770", "#5b6770 / #5b6770", "#5b6770 / RAL 9999"]) assert.equal(full("Gris", bad), full("Gris"), bad);
  assert.equal(full("Rouge / Blanc", "#5b6770 / #zzzzzz"), full("Rouge / Blanc"), "une partie mal écrite : tout est ignoré, pas seulement elle");
  assert.equal(full(MULTICOLORE, "#5b6770"), full(MULTICOLORE));
  assert.equal(full(NON_PRECISE, "#5b6770"), full(NON_PRECISE), "pas de teinte directe sur Non précisé");
});

test("mesure : la comparaison prend en compte une teinte « #rrggbb »", () => {
  const rows = (...teintes) => teintes.map((teinte, i) => ["v" + i, "Gris", teinte]);
  assert.deepEqual([...namedValues(items(rows("#5b6770", "#5c6871", "#d0d8de")), "coloris", ["v0", "v1", "v2"])].sort(), ["v0", "v1"], "deux teintes directes proches se confondent, la troisième non");
  assert.deepEqual([...namedValues(items(rows("#5b6770", "RAL 7016")), "coloris", ["v0", "v1"])].sort(), [], "une teinte directe et un RAL éloignés se distinguent");
});

// ---- K3 : « Reflet » (brillant / mat) et nouvelles nuances de la palette ----
const withGloss = (value, teinte, reflet) => pastilleStyle(value, teinte, reflet);
const GLOSS_LAYER = /^radial-gradient\(/;

test("reflet : une partie « brillant » reçoit un éclat par-dessus son motif ; « mat » ne change rien", () => {
  const base = pastilleStyle("Rouge");
  assert.deepEqual(withGloss("Rouge", undefined, "mat"), base, "mat : identique à la pastille sans reflet");
  const shiny = withGloss("Rouge", undefined, "brillant");
  assert.match(shiny.backgroundImage, GLOSS_LAYER, "l'éclat est la première couche, donc dessiné par-dessus");
  assert.ok(shiny.backgroundImage.endsWith(base.backgroundImage), "le motif de la nuance reste dessous, intact");
  assert.match(shiny.backgroundImage, /rgba\(255, 255, 255, 0\)\s*100%\)/, "l'éclat s'éteint avant le bord : dégradé, jamais un aplat");
  const metal = withGloss("Inox", undefined, "brillant").backgroundImage;
  assert.ok(metal.endsWith(pastilleStyle("Inox").backgroundImage), "un motif à relief garde aussi son relief sous l'éclat");
});

test("reflet : bicolore, chaque moitié a son propre éclat ; tailles et positions suivent les couches", () => {
  const one = withGloss("Rouge / Blanc", undefined, "brillant / mat");
  const layers = one.backgroundImage.split("), ").length;
  assert.equal(one.backgroundImage.match(/radial-gradient/g).length, 1, "une seule moitié brillante : un seul éclat");
  assert.equal(one.backgroundSize.split(", ").length, 3, "trois couches : éclat A, motif A, motif B");
  assert.equal(one.backgroundPosition, "left top, left top, right top", "l'éclat de A reste dans la moitié gauche");
  const both = withGloss("Rouge / Blanc", undefined, "brillant / brillant");
  assert.equal(both.backgroundImage.match(/radial-gradient/g).length, 2);
  assert.equal(both.backgroundPosition, "left top, right top, left top, right top");
  const second = withGloss("Rouge / Blanc", undefined, "mat / brillant");
  assert.equal(second.backgroundPosition, "right top, left top, right top", "l'éclat de B reste dans la moitié droite");
  assert.deepEqual(withGloss("Rouge / Blanc", undefined, "mat / mat"), pastilleStyle("Rouge / Blanc"));
  assert.ok(layers >= 3);
});

test("reflet : nombre de parties différent de Pastille, ou valeur inconnue = ignoré en entier", () => {
  for (const [value, reflet] of [["Rouge", "brillant / mat"], ["Rouge / Blanc", "brillant"], ["Rouge / Blanc", "brillant / mat / mat"], ["Rouge", "Brillant"], ["Rouge", "satiné"], ["Rouge / Blanc", "brillant / inconnu"], ["Rouge", ""], ["Rouge", undefined], ["Rouge", null], ["Rouge", " brillant"]]) {
    assert.deepEqual(withGloss(value, undefined, reflet), pastilleStyle(value), `${value} + ${String(reflet)}`);
  }
  assert.equal(withGloss(undefined, undefined, "brillant"), null, "Reflet seul ne dessine rien");
  assert.equal(withGloss("Inconnu", undefined, "brillant"), null, "pas de pastille devinée pour une nuance inconnue");
});

test("reflet : s'ajoute à la teinte fine, qui garde sa règle propre", () => {
  const both = withGloss("Gris", "#5b6770", "brillant");
  assert.match(both.backgroundImage, GLOSS_LAYER);
  assert.ok(both.backgroundImage.endsWith(pastilleStyle("Gris", "#5b6770").backgroundImage), "la teinte fine est dessinée sous l'éclat");
  const badFine = withGloss("Gris", "RAL 9999", "brillant");
  assert.ok(badFine.backgroundImage.endsWith(pastilleStyle("Gris").backgroundImage), "Teinte mal formée ignorée ; le reflet, bien formé, reste");
  assert.match(withGloss(MULTICOLORE, undefined, "brillant").backgroundImage, GLOSS_LAYER);
});

test("nouvelle nuance : Zinc (métal) et Gris manganèse (uni) sont dessinées d'après palette.json", () => {
  const zinc = palette.nuances.find((n) => n.name === "Zinc");
  const manganese = palette.nuances.find((n) => n.name === "Gris manganèse");
  assert.equal(zinc.motif, "metal");
  assert.equal(manganese.motif, "uni");
  assert.equal(palette.nuances.length, 40);
  assert.match(pastilleStyle("Zinc").backgroundImage, new RegExp(`^linear-gradient\\(135deg, .*${zinc.hex}`), "Zinc a le relief métal, centré sur sa teinte");
  assert.equal(pastilleStyle("Gris manganèse").backgroundImage, `linear-gradient(${manganese.hex}, ${manganese.hex})`);
  assert.ok(pastilleStyle("Zinc / Gris manganèse") !== null, "bicolore avec les nouvelles nuances");
  assert.match(withGloss("Zinc", undefined, "brillant").backgroundImage, GLOSS_LAYER);
});

test("reflet : jamais une caractéristique, jamais un filtre ; la fiche le reprend là où elle prend la Pastille", async () => {
  assert.equal(pastille.isReservedLabel("Reflet"), true);
  assert.equal(pastille.isReservedLabel(" reflet "), true);
  assert.equal(pastille.isReservedLabel("Reflets"), false);
  const { characteristicsText } = await import("../../lib/site-catalog/merchandising.ts");
  const text = characteristicsText({ characteristics: [{ label: "Pastille", value: "Zebre" }, { label: "Reflet", value: "brillant" }, { label: "Matière", value: "Acier" }], items: [{ characteristics: [{ label: " REFLET", value: "mat" }, { label: "Type", value: "Banc" }] }] });
  assert.doesNotMatch(text, /Reflet|brillant|\bmat\b/i);
  assert.match(text, /Acier/);
  const fam = { characteristics: [{ label: "Pastille", value: "Gris" }, { label: "Reflet", value: "brillant" }] };
  assert.deepEqual(pastille.drawnOf({}, fam), { pastille: "Gris", reflet: "brillant" });
  assert.deepEqual(pastille.drawnOf({ characteristics: [{ label: "Pastille", value: "Noir" }] }, fam), { pastille: "Noir" }, "la variante qui a sa Pastille ne prend pas le Reflet de la famille");
  const { filterGroups } = await import("../../lib/site-catalog/filters.ts");
  const solo = [{ characteristics: [{ label: "Reflet", value: "brillant" }], items: [] }, { characteristics: [{ label: "Reflet", value: "mat" }], items: [] }];
  assert.deepEqual(filterGroups(solo), [], "Reflet seul ne fait aucun filtre");
});
