// 4.27 : rendu du bloc de filtres de la page de rubrique et de la pagination qui garde les filtres (sans navigateur ni serveur).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import * as swatch from "../../lib/site-catalog/color-swatch.ts";
import { filterGroups, parseFilterChoice } from "../../lib/site-catalog/filters.ts";

const require = createRequire(import.meta.url);
function load(path) {
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function("require", "module", "exports", code)((name) => {
    if (name === "next/link") return { default: ({ href, children, ...rest }) => React.createElement("a", { href, ...rest }, children) };
    if (name === "@/components/site/format") return { money: (v) => v };
    if (name === "@/lib/site-catalog/color-swatch") return swatch;
    return require(name);
  }, module, module.exports);
  return module.exports;
}
const { ListingControls } = load("../../components/catalog/listing-controls.tsx");
const { Pager } = load("../../components/catalog/pager.tsx");

const fam = (coloris, type) => ({ characteristics: [{ label: "Pastille", value: coloris }, { label: "Type", value: type }], items: [] });
const families = [fam("Noir", "Banc"), fam("Rouge / Blanc", "Banc"), fam("Inconnu", "Table"), fam("Noir", "Table"), fam("Rouge / Blanc", "Chaise")];
const groups = filterGroups(families);
const query = { q: "", minRaw: "", maxRaw: "", min: null, max: null, sort: "pertinence", page: 1, ignored: [] };

test("filtres : cases à cocher natives, nombre de familles, une pastille par nuance sur Coloris seulement", () => {
  const html = renderToStaticMarkup(React.createElement(ListingControls, { formId: "f", action: "/categorie/x", query, filters: groups, choice: { coloris: ["Noir"], type: ["Banc"] } }));
  assert.deepEqual(groups[0].options.map((o) => o.value).sort(), ["Blanc", "Inconnu", "Noir", "Rouge"], "le bicolore compte dans ses deux nuances");
  assert.equal([...html.matchAll(/<input type="checkbox"/g)].length, 4 + 3);
  assert.match(html, /name="coloris" checked="" value="Noir"/);
  assert.match(html, /name="type" checked="" value="Banc"/);
  assert.doesNotMatch(html, /name="type" checked="" value="Table"/);
  assert.match(html, /Noir<\/span><span class="text-ink-3">\(2\)<\/span>/);
  assert.match(html, /<legend[^>]*>Coloris<\/legend>/);
  assert.equal([...html.matchAll(/aria-hidden="true" class="h-4 w-4[^"]*"/g)].length, 3, "Noir, Rouge et Blanc ont une pastille ; « Inconnu » n'en a pas ; aucune sur Type");
  assert.match(html, />Inconnu<\/span>/);
  assert.match(html, /Coloris : Noir/);
});

test("sans filtre à montrer : le bloc de prix seul, comme avant", () => {
  const html = renderToStaticMarkup(React.createElement(ListingControls, { formId: "f", action: "/categorie/x", query }));
  assert.doesNotMatch(html, /type="checkbox"/);
  assert.match(html, /name="prix_min"/);
});

test("pagination : les choix répétés sont gardés dans les liens", () => {
  const html = renderToStaticMarkup(React.createElement(Pager, { action: "/categorie/x", params: { prix_min: "10", coloris: ["Noire", "Rouge/Blanc"] }, page: 1, pages: 3 }));
  assert.match(html, /href="\/categorie\/x\?prix_min=10&amp;coloris=Noire&amp;coloris=Rouge%2FBlanc&amp;page=2"/);
  assert.deepEqual(parseFilterChoice({ coloris: ["Noire", "Rouge/Blanc"] }), { coloris: ["Noire", "Rouge/Blanc"] });
});
