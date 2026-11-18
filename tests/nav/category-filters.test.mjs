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

const fam = (coloris, type) => ({ characteristics: [{ label: "Coloris", value: coloris }, { label: "Type", value: type }], items: [] });
const families = [fam("Noire", "Banc"), fam("Rouge/Blanc", "Banc"), fam("Standard", "Table"), fam("Noire", "Table"), fam("Rouge/Blanc", "Chaise")];
const groups = filterGroups(families);
const query = { q: "", minRaw: "", maxRaw: "", min: null, max: null, sort: "pertinence", page: 1, ignored: [] };

test("filtres : cases à cocher natives, nombre de familles, pastilles décoratives sur Coloris seulement", () => {
  const html = renderToStaticMarkup(React.createElement(ListingControls, { formId: "f", action: "/categorie/x", query, filters: groups, choice: { coloris: ["Noire"], type: ["Banc"] } }));
  assert.equal([...html.matchAll(/<input type="checkbox"/g)].length, 3 + 3);
  assert.match(html, /name="coloris" checked="" value="Noire"/);
  assert.match(html, /name="type" checked="" value="Banc"/);
  assert.doesNotMatch(html, /name="type" checked="" value="Table"/);
  assert.match(html, /Noire<\/span><span class="text-ink-3">\(2\)<\/span>/);
  assert.match(html, /<legend[^>]*>Coloris<\/legend>/);
  assert.match(html, /<legend[^>]*>Type<\/legend>/);
  assert.equal([...html.matchAll(/aria-hidden="true" class="h-4 w-4[^"]*"/g)].length, 2, "Noire et Rouge/Blanc ont une teinte ; Standard reste écrit seul ; aucune pastille sur Type");
  assert.match(html, /linear-gradient\(90deg/);
  assert.match(html, /Coloris : Noire/);
  assert.match(html, />Standard<\/span>/);
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
