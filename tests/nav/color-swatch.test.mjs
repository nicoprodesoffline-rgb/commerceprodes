import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { normalizeColorName, swatchFor, swatchStyle, SWATCH_KEYWORDS, RAL_SWATCHES, isColorAxis } from "../../lib/site-catalog/color-swatch.ts";
import * as variantChoice from "../../lib/site-catalog/variant-choice.ts";

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
  // 4.27 : « blanche » est désormais au nuancier (féminins) ; une sous-chaîne de mot n'en trouve toujours pas.
  assert.equal(swatchFor("blanche argenté coloration"), "#f5f5f5");
  assert.equal(swatchFor("coloration"), null);
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
  if (name === "react") return { ...React, useId: () => "test-color", useState: (initial) => [initial, () => {}] };
  if (name === "@/lib/site-catalog/variant-choice") return variantChoice;
  if (name === "@/components/site/format") return { axisValue: (value) => value };
  if (name === "@/lib/site-catalog/color-swatch") return { isColorAxis, swatchFor, swatchStyle };
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
  assert.deepEqual(radios.map((n) => n.props.disabled), [undefined, undefined, undefined], "aucune valeur n'est désactivée : une valeur grisée reste cliquable");
  assert.deepEqual(radios.map((n) => n.props["data-compatible"]), ["true", "true", "false"], "« Inconnu » n'est portée par aucune variante publiée : grisée");
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
  assert.match(html, /Grisé : aucune variante publiée : Inconnu\. Un clic ajuste les autres choix\./);
  assert.match(html, /aucune variante avec vos choix : un clic ajuste les autres choix/);
  assert.match(html, /Inconnu/);
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
  const axes = nodes(tree, (n) => n.type === "fieldset").map((n) => n.props["data-axis"]);
  assert.deepEqual(axes, ["type_assise", "couleur", "taille"]);
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

// ---- 4.27 : nuancier élargi, recherche sur la clé de pli, bicolore, jamais de teinte devinée ----
import { RAL_CLASSIC, EXTRA_SWATCH_KEYWORDS } from "../../lib/site-catalog/color-swatch.ts";

test("4.27 : féminins, pluriels et accents trouvent la même teinte que le nom de base", () => {
  for (const [value, like] of [
    ["noire", "noir"], ["Noires", "noir"], ["BLANCHE", "blanc"], ["blanches", "blanc"], ["verte", "vert"], ["bleue", "bleu"], ["grise", "gris"], ["Grises", "gris"],
    ["Chêne", "chene"], ["Doré", "or"],
  ]) assert.notEqual(swatchFor(value), null, value);
  assert.equal(swatchFor("noire"), swatchFor("noir"));
  assert.equal(swatchFor("Verte"), swatchFor("vert"));
  assert.equal(swatchFor("Noirs"), swatchFor("noir"));
});

test("4.27 : noms courants, finitions métal et bois ont une teinte", () => {
  for (const value of ["taupe", "brun", "crème", "sable", "turquoise", "violet", "terracotta", "doré", "platine",
    "inox", "galvanisé", "aluminium", "zingué", "chrome", "laiton", "bronze", "cuivre",
    "chêne", "hêtre", "pin", "teck", "noyer", "bambou", "bois", "Inox brossé 304", "Chêne clair"]) assert.match(swatchFor(value) ?? "", /^#[0-9a-f]{6}$/, value);
  assert.equal(new Set(EXTRA_SWATCH_KEYWORDS.map(([n]) => n)).size, EXTRA_SWATCH_KEYWORDS.length, "aucun nom en double");
});

test("4.27 : RAL classique complet, un code à quatre chiffres sans « RAL » reste écrit", () => {
  const codes = new Set([...Object.keys(RAL_SWATCHES), ...Object.keys(RAL_CLASSIC)]);
  assert.ok(codes.size >= 190, `${codes.size} codes`);
  for (const code of [1000, 2004, 3020, 4005, 5015, 6018, 7021, 8017, 9005, 9010]) assert.ok(codes.has(String(code)), String(code));
  for (const code of Object.keys(RAL_CLASSIC)) assert.match(RAL_CLASSIC[code], /^#[0-9a-f]{6}$/, code);
  for (const code of Object.keys(RAL_SWATCHES)) assert.equal(RAL_CLASSIC[code], undefined, "les dix teintes existantes ne sont pas redéfinies");
  assert.equal(swatchFor("RAL 5015"), RAL_CLASSIC["5015"]);
  assert.equal(swatchFor("ral 9006"), RAL_CLASSIC["9006"]);
  for (const value of ["7016", "9005", "5015", "standard", "transparent", "Non précisée", "selon nuancier", "Selon nuancier RAL", "RAL 7016x", "RAL 9999"]) assert.equal(swatchFor(value), null, value);
});

test("4.27 : bicolore « A/B » ou « A et B » : pastille coupée en deux ; une partie sans teinte : la valeur reste écrite", () => {
  const rouge = swatchFor("rouge"), blanc = swatchFor("blanc");
  assert.equal(swatchFor("Rouge/Blanc"), `linear-gradient(90deg, ${rouge} 50%, ${blanc} 50%)`);
  assert.equal(swatchFor("rouge / blanc"), swatchFor("Rouge/Blanc"));
  assert.equal(swatchFor("Rouge et blanc"), swatchFor("Rouge/Blanc"));
  assert.equal(swatchFor("Noire et Verte"), `linear-gradient(90deg, ${swatchFor("noir")} 50%, ${swatchFor("vert")} 50%)`);
  assert.equal(swatchFor("RAL 9005/RAL 9010"), `linear-gradient(90deg, ${RAL_SWATCHES["9005"]} 50%, ${RAL_SWATCHES["9010"]} 50%)`);
  assert.equal(swatchFor("Rouge/Transparent"), null);
  assert.equal(swatchFor("Standard et Rouge"), null);
  assert.equal(swatchFor("Rouge/Blanc/Bleu"), null, "trois parties : rien n'est deviné");
  assert.equal(swatchFor("Rouge/rouge"), rouge, "deux fois la même teinte : un aplat");
  assert.equal(swatchStyle(swatchFor("Rouge/Blanc")).backgroundImage, swatchFor("Rouge/Blanc"));
  assert.deepEqual(swatchStyle("#cc0000"), { backgroundColor: "#cc0000" });
});

test("4.27 : abréviations « galva » et « alu » ; « standard/galva », transparent, brut, nature, naturel et 4 chiffres sans RAL restent écrits", () => {
  assert.equal(swatchFor("Galva"), swatchFor("galvanisé"));
  assert.equal(swatchFor("galva"), swatchFor("Galva"));
  assert.equal(swatchFor("Alu"), swatchFor("aluminium"));
  assert.notEqual(swatchFor("alu"), null);
  assert.equal(swatchFor("Alu/Noir"), `linear-gradient(90deg, ${swatchFor("aluminium")} 50%, ${swatchFor("noir")} 50%)`);
  assert.equal(swatchFor("standard/galva"), null, "« standard » n'a pas de teinte : la valeur reste écrite");
  for (const value of ["transparent", "brut", "nature", "naturel", "1234", "7016", "aluminerie", "valu"]) assert.equal(swatchFor(value), null, value);
});
