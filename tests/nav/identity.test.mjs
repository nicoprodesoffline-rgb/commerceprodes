import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const root = path.resolve(import.meta.dirname, "../..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("identité Commerce : rouge historique, alias compatibles et fond blanc", () => {
  const css = read("app/globals.css");
  assert.match(css, /--color-brand:\s*#a71c19/);
  assert.match(css, /--color-brand-dark:\s*#8f1815/);
  assert.match(css, /--color-brand-subtle:\s*#f6e9e8/);
  assert.doesNotMatch(css, /#7a2e3b|#f2e9ea|#cc1818/i);
  assert.match(css, /--color-signal:\s*var\(--color-brand\)/);
  assert.match(css, /--color-canvas:\s*#fff(?:fff)?\s*;/);
});

test("coque publique : politique média branchée et bandeau interne retiré", () => {
  const layout = read("app/layout.tsx");
  const header = read("components/layout/site-header.tsx");
  assert.doesNotMatch(layout, /staging-banner/);
  assert.doesNotMatch(header, /démonstration|staging-banner|dataLabel/);
  assert.match(layout, /<MediaPolicyProvider showImages=\{imagesAllowed\(catalog\?\.meta\.data_label\)\}>/);
  assert.match(header, /width=\{48\} height=\{48\}/);
  assert.match(read("components/layout/utility-bar.tsx"), /bg-brand/);
  assert.match(read("components/layout/live-search.tsx"), /MediaImage/);
  assert.doesNotMatch(read("components/layout/live-search.tsx"), /<img\b/);
});

test("le prédicat média appelé sur le serveur provient d’un module pur", () => {
  for (const file of ["app/layout.tsx", "app/page.tsx"]) {
    const source = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const declaration = source.statements.find(statement => ts.isImportDeclaration(statement) &&
      statement.importClause?.namedBindings && ts.isNamedImports(statement.importClause.namedBindings) &&
      statement.importClause.namedBindings.elements.some(element => element.name.text === "imagesAllowed"));
    assert.ok(declaration, `${file}: import du prédicat manquant`);
    const target = declaration.moduleSpecifier.text.replace(/^@\//, "");
    const filename = [target, `${target}.ts`, `${target}.tsx`].find(candidate => fs.existsSync(path.join(root, candidate)));
    assert.ok(filename, `${file}: module du prédicat absent`);
    assert.doesNotMatch(read(filename), /^\s*["']use client["']/, `${file}: Next interdit l’appel d’une fonction cliente sur le serveur`);
  }
});

const forbidden = /staging_fixture|démonstration|données de test|enregistrées localement|traitées par personne|base fiscale non précisée|prix et base fiscale|taxes, port et remises\s*:\s*non calculés|prix de vente prodes publiés|en vigueur maintenant|\b(?:provenance|hash|génération|séquence|contrat|c0|factory|calculateur|publication)\b|catalogue servable/i;

test("aucun jargon interne dans les textes de l’accueil et de la coque", () => {
  const files = ["app/page.tsx", ...["components/layout", "components/home"].flatMap(dir =>
    fs.readdirSync(path.join(root, dir), { recursive: true }).filter(file => /\.tsx?$/.test(file)).map(file => `${dir}/${file}`))];
  for (const file of files) {
    const source = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const visit = (node) => {
      if (ts.isJsxText(node) || ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
        // Les imports décrivent le code ; les littéraux et attributs décrivent aussi le public.
        if (!ts.isImportDeclaration(node.parent) && !ts.isExportDeclaration(node.parent)) {
          assert.doesNotMatch(node.text, forbidden, `${file}: ${node.text}`);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
});

test("cartes et accueil : grilles adaptatives et absence de faux visuels", () => {
  for (const file of ["components/home/family-card.tsx", "components/home/category-grid.tsx"]) {
    const source = read(file);
    assert.match(source, /commerce-grid/);
    // Les cartes de familles passent par MediaImage ; la liste des univers n'a plus de cases d'image (liste de liens rouges, D7).
    if (file.endsWith("family-card.tsx")) assert.match(source, /MediaImage/);
    assert.doesNotMatch(source, /image-rendering:pixelated|bg-gradient|<img\b/);
  }
  const css = read("app/globals.css");
  for (const width of [640, 1024, 1280]) assert.match(css, new RegExp(`min-width: ${width}px`));
  assert.match(read("app/page.tsx"), /imagesAllowed\(catalog.meta.data_label\)/);
});

const require = createRequire(import.meta.url);
function load(file, stubs = {}) {
  const cache = new Map();
  function moduleAt(filename) {
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} };
    cache.set(filename, module);
    const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: {
      module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
    } }).outputText;
    function localRequire(name) {
      if (Object.hasOwn(stubs, name)) return stubs[name];
      if (name.startsWith("@/") || name.startsWith(".")) {
        const base = name.startsWith("@/") ? path.join(root, name.slice(2)) : path.resolve(path.dirname(filename), name);
        return moduleAt([base, `${base}.ts`, `${base}.tsx`].find(candidate => fs.existsSync(candidate)));
      }
      return require(name);
    }
    new Function("require", "module", "exports", code)(localRequire, module, module.exports);
    return module.exports;
  }
  return moduleAt(path.join(root, file));
}
const stubs = {
  "next/link": ({ children, ...props }) => React.createElement("a", props, children),
  "next/image": ({ priority, ...props }) => React.createElement("img", props),
  "@/lib/site-content/validate": { isLocalLink: value => value.startsWith("/") && !value.startsWith("//") },
};

test("hero sans image : typographie, deux actions, aucun substitut de visuel", () => {
  const { Hero } = load("components/home/hero.tsx", stubs);
  const html = renderToStaticMarkup(React.createElement(Hero, { references: 0 }));
  assert.match(html, /Voir le catalogue/);
  assert.match(html, /Demander un devis/);
  assert.doesNotMatch(html, /<img|media-missing|reference-count/);
  assert.doesNotMatch(html, forbidden);
});

test("cartes : image interdite remplacée par l’état neutre et accès produit visible", () => {
  const { CategoryGrid } = load("components/home/category-grid.tsx", stubs);
  const { FamilyCard } = load("components/home/family-card.tsx", {
    ...stubs, "@/components/site/list-buttons": { CompareButton: () => null, WishlistButton: () => null },
  });
  // Politique refusée, même si le catalogue fournit un média.
  const tree = load("components/home/category-grid.tsx", {
    ...stubs, "@/components/site/media-policy": { useShowImages: () => false },
  }).CategoryGrid({ categories: [{ key: "exemple", name: "Exemple", familyCount: 1, imageSha: "a".repeat(64), children: [] }] });
  const html = renderToStaticMarkup(tree);
  assert.doesNotMatch(html, /<img|Visuel non disponible/, "liste des univers : jamais d'image ni de case grise vide");
  assert.match(html, /href="\/categorie\/exemple"/);
  assert.equal(CategoryGrid({ categories: [] }), null);
  const refused = load("components/home/family-card.tsx", {
    ...stubs, "@/components/site/media-policy": { useShowImages: () => false }, "@/components/site/list-buttons": { CompareButton: () => null, WishlistButton: () => null },
  }).FamilyCard;
  const refusedCard = renderToStaticMarkup(React.createElement(refused, { data: { slug: "exemple", name: "Exemple", imageSha: "a".repeat(64), description: "", variantCount: 1 }, from: null }));
  assert.match(refusedCard, /Visuel non disponible/);
  assert.doesNotMatch(refusedCard, /<img/);
  const card = renderToStaticMarkup(React.createElement(FamilyCard, { data: { slug: "exemple", name: "Exemple", imageSha: null, description: "", variantCount: 1 }, from: null }));
  assert.match(card, /Sur devis/);
  assert.match(card, /Découvrir/);
  assert.doesNotMatch(card, /opacity-0/);
});

test("pied public : aucune métadonnée technique, indisponibilité compréhensible", () => {
  const { SiteFooter } = load("components/layout/footer.tsx", stubs);
  const html = renderToStaticMarkup(React.createElement(SiteFooter, { meta: null, basis: "NOT_DECLARED" }));
  assert.match(html, /Catalogue momentanément indisponible/);
  assert.doesNotMatch(html, /Montant indicatif/, "mention déplacée : une seule fois, sous le total du panier");
  assert.doesNotMatch(html, /<details|Détail technique|\bHT\b|\bTTC\b|\bTVA\b/);
  assert.doesNotMatch(html, forbidden);
});

test("FAQ : question fiscale seulement quand les prix sont déclarés HT", async () => {
  for (const basis of ["NOT_DECLARED", "HT"]) {
    const Page = load("app/faq/page.tsx", {
      ...stubs,
      "@/lib/site-catalog/page": { catalogOrNull: async () => ({ families: [], meta: { payload_sha256: "" } }) },
      "@/lib/site-catalog/basis": { catalogBasis: () => basis },
    }).default;
    const html = renderToStaticMarkup(await Page());
    if (basis === "HT") assert.match(html, /Les prix sont-ils hors taxes/);
    else assert.doesNotMatch(html, /hors taxes|\bHT\b|\bTTC\b|\bTVA\b|base fiscale/);
  }
});

test("accueil vide : pas de section produits ou catégories vide, ni image de remplissage", async () => {
  const Home = load("app/page.tsx", {
    ...stubs,
    "@/lib/site-content/source": { getEditorialSet: async () => null },
    "@/lib/site-content/metadata": { editorialMetadata: () => ({}) },
    "@/components/site/catalog-views": { navigationOf: () => ({ menu: [] }) },
    "@/lib/site-catalog/page": { catalogForPage: async () => ({ families: [], meta: { data_label: "STAGING_FIXTURE" } }) },
    "@/lib/site-catalog/clock": { serverNowUtc: () => "" },
    "@/lib/site-catalog/listing-price": { familyPrice: () => null },
    "@/lib/site-catalog/basis": { catalogBasis: () => "NOT_DECLARED" },
  }).default;
  const html = renderToStaticMarkup(await Home());
  assert.doesNotMatch(html, /id="categories"|id="familles"|trust-bar|<img|media-missing/);
  assert.match(html, /quote-banner/);
});
