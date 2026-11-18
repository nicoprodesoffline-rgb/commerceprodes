import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { buildNavigation } from "../../lib/site-catalog/navigation.ts";

const root = resolve(import.meta.dirname, "../..");
const source = (file) => readFileSync(resolve(root, file), "utf8");
function filesIn(dir) {
  return readdirSync(resolve(root, dir), { withFileTypes: true }).flatMap((entry) => {
    const file = `${dir}/${entry.name}`;
    return entry.isDirectory() ? filesIn(file) : /\.tsx?$/.test(file) ? [file] : [];
  });
}
function publicLiterals(file) {
  const ast = ts.createSourceFile(file, source(file), ts.ScriptTarget.Latest, true);
  const values = [];
  function visit(node) {
    if (ts.isStringLiteralLike(node) || ts.isJsxText(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) values.push(node.text);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return values.join("\n");
}

test("D1 : les textes du parcours parlent au client et conservent les confirmations exactes", () => {
  for (const dir of ["components/checkout", "components/home", "components/layout", "app/devis", "app/commande", "app/recu"]) {
    for (const file of filesIn(dir)) assert.doesNotMatch(publicLiterals(file), /fictiv|de test|démonstration|montant indicatif/i, file);
  }
  const result = source("components/checkout/result-panel.tsx");
  assert.ok(result.includes("Votre demande est enregistrée ; nous vous répondons rapidement."));
  assert.ok(result.includes("Commande enregistrée ; nous vous recontactons pour la confirmer."));
  assert.match(result, /\/recu#ref=\$\{encodeURIComponent\(outcome.ref\)\}&code=\$\{encodeURIComponent\(outcome.token\)\}/);
  assert.match(source("components/checkout/receipt-lookup.tsx"), /h.get\("ref"\)/);
  assert.match(source("components/checkout/receipt-lookup.tsx"), /h.get\("code"\)/);
});

const cat = (key, parent = null) => ({ category_key: key, name: key, parent_category_key: parent });
const fam = (slug, primary, secondary = []) => ({ slug, primary_category_key: primary, secondary_category_keys: secondary });

test("D2 : la racine liste tout le sous-arbre dans l’ordre des familles, compteur et liste concordent", () => {
  const nav = buildNavigation([cat("root"), cat("left", "root"), cat("right", "root"), cat("deep", "left"), cat("lower", "deep"), cat("empty")], [fam("a", "lower"), fam("b", "root"), fam("c", "right"), fam("d", "left")]);
  assert.deepEqual(nav.familySlugs("root"), ["a", "b", "c", "d"]);
  assert.equal(nav.node("root").subtreeFamilyCount, nav.familySlugs("root").length);
  assert.equal(nav.node("root").subtreeFamilyCount, nav.node("root").ownFamilyCount + nav.node("left").subtreeFamilyCount + nav.node("right").subtreeFamilyCount);
  assert.deepEqual(nav.familySlugs("deep"), ["a"]);
  assert.deepEqual(nav.familySlugs("empty"), []);
  assert.deepEqual(nav.familySlugs("unknown"), []);
  assert.equal(nav.node("unknown"), null);
  assert.equal(nav.node("lower"), null);
  const page = source("app/categorie/[key]/page.tsx");
  assert.match(page, /nav.familySlugs\(cat.key\)/);
  assert.match(page, /listFamilies\(families, query/);
  assert.match(page, /listing.total/);
  assert.match(page, /listing.rows.map/);
  assert.match(page, /page=\{listing.page\} pages=\{listing.pages\}/);
  assert.match(page, /if \(!cat\) notFound\(\)/);
});

test("D2 : une famille dans plusieurs descendants n’est comptée et listée qu’une fois", () => {
  const nav = buildNavigation([cat("root"), cat("left", "root"), cat("right", "root")], [fam("a", "left", ["right", "root"]), fam("b", "right")]);
  assert.deepEqual(nav.familySlugs("root"), ["a", "b"]);
  assert.equal(nav.node("root").subtreeFamilyCount, 2);
  assert.deepEqual(nav.familySlugs("left"), ["a"]);
  assert.deepEqual(nav.familySlugs("right"), ["a", "b"]);
});

test("D5 : la mention est réservée au total du panier", () => {
  for (const file of ["components/home/family-card.tsx", "components/content/sections.tsx", "components/checkout/receipt-details.tsx", "components/cart/cart-summary.tsx"]) {
    assert.doesNotMatch(source(file), /<BasisNotice/, file);
  }
  assert.doesNotMatch(source("components/checkout/checkout-flow.tsx"), /totalsNote/);
  assert.match(source("components/cart/cart-summary.tsx"), /data-testid="totals-note"/);
});

test("D7 : les catégories sont des liens rouges sans cadres ni visuels de remplacement", () => {
  const grid = source("components/home/category-grid.tsx");
  assert.doesNotMatch(grid, /MediaImage|border|bg-surface/);
  assert.match(grid, /text-brand/);
  assert.match(grid, /data-testid="category-tile"/);
});

test("D9 : les actions primaires ne gardent pas de fond noir", () => {
  for (const dir of ["components/checkout", "components/cart", "components/catalog", "components/home"]) {
    for (const file of filesIn(dir)) {
      if (file.endsWith("category-sidebar.tsx")) continue;
      assert.doesNotMatch(source(file), /(?:\s|["`])bg-ink(?:\s|["`])/, file);
    }
  }
  assert.match(source("components/home/hero.tsx"), /bg-brand[^"\n]*text-white[^"\n]*hover:bg-brand-dark">Voir le catalogue/);
});

test("D10 : un seul champ de recherche, dans l’en-tête et synchronisé avec q", () => {
  const page = source("app/recherche/page.tsx");
  assert.doesNotMatch(page, /type="search"|q-page|<QuickOrder/);
  assert.match(page, /<ListingControls/);
  assert.match(page, /<ListingSort/);
  assert.match(page, /data-testid="search-count"/);
  const header = source("components/layout/live-search.tsx");
  assert.match(header, /useSearchParams/);
  assert.match(header, /\.get\("q"\)/);
  assert.match(header, /setValue\(query\)/);
  assert.match(header, /setOpen\(document.activeElement === input.current\)/);
  assert.match(header, /data-testid="live-search"/);
});

test("D11 : boutons de sélection discrets, sans surface, avec une cible tactile de 44 px", () => {
  const card = source("components/home/family-card.tsx");
  assert.match(card, /<CompareButton/);
  assert.match(card, /<WishlistButton/);
  for (const style of ["[&_button]:min-h-11", "[&_button]:border-0", "[&_button]:bg-transparent", "[&_button]:text-ink-2", "[&_button]:py-3", "[&_button]:text-xs"]) assert.ok(card.includes(style), style);
});

test("D12 : champs accessibles à 44 px et actions longues sans hauteur bloquée", () => {
  for (const file of ["components/catalog/quick-order.tsx", "components/catalog/listing-controls.tsx"]) assert.doesNotMatch(source(file), /h-\[34px\]/, file);
  assert.match(source("components/checkout/checkout-flow.tsx"), /min-h-\[44px\][^"\n]*py-2[^"\n]*"\n\s+data-testid="submit"/);
  assert.doesNotMatch(source("components/cart/cart-drawer.tsx"), /whitespace-nowrap/);
});
