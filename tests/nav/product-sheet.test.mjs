import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
const root = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
function load(path, stubs = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(read(path), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function("require", "module", "exports", code)((name) => {
    if (name in stubs) return stubs[name];
    if (name.startsWith("@/")) {
      const path = [".ts", ".tsx"].map((extension) => name.slice(2) + extension).find((candidate) => existsSync(new URL(candidate, root)));
      assert.ok(path, `Module introuvable : ${name}`);
      return load(path, stubs);
    }
    return require(name);
  }, module, module.exports);
  return module.exports;
}
function files(dir) {
  return readdirSync(new URL(dir, root), { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? files(`${dir}/${entry.name}`) : /\.tsx?$/.test(entry.name) ? [`${dir}/${entry.name}`] : []);
}
const productFiles = [...files("components/product"), ...files("app/famille")];

test("la fiche ne contient plus de tableau de variantes ni de détails techniques", () => {
  for (const path of productFiles) {
    assert.doesNotMatch(read(path), /Variantes proposées|data-testid=["']provenance["']/, path);
  }
});

test("aucun jargon interdit dans les chaînes et textes publics du périmètre", () => {
  const forbidden = /staging_fixture|démonstration|données de test|enregistrées localement|traitées par personne|base fiscale non précisée|prix et base fiscale précisés sur le devis|taxes, port et remises\s*:\s*non calculés|prix de vente prodes publiés|en vigueur maintenant|\b(?:provenance|hash|génération|séquence|contrat|c0|factory|calculateur|publication)\b|catalogue servable/i;
  for (const path of [...productFiles, "components/site/selection-views.tsx", "components/site/carousel-row.tsx"]) {
    const source = ts.createSourceFile(path, read(path), ts.ScriptTarget.Latest, true, path.endsWith("tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    function visit(node) {
      if (ts.isStringLiteralLike(node) || ts.isJsxText(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
        assert.doesNotMatch(node.text, forbidden, `${path}: ${node.text}`);
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
});

test("la grille se limite aux quantités et prix, en conservant les marqueurs serveur", () => {
  const source = read("components/product/price-grid.tsx");
  assert.doesNotMatch(source.slice(source.indexOf("export function PriceGrid")), /validity_label|validity-inline|validity-cell/);
  const { PriceGrid } = load("components/product/price-grid.tsx", {
    "@/components/site/format": { money: (value) => value, basisLabel: () => "", quantityRange: () => "Quantité" },
  });
  const row = { tier_quantity: 1, selected: true, rate_id: "rate-example", unit_amount: "amount-example", tax_basis_or_status: null };
  const html = renderToStaticMarkup(React.createElement(PriceGrid, { rows: [row], selectedRateId: row.rate_id }));
  assert.match(html, /Prix selon la quantité/);
  assert.equal((html.match(/<th scope=/g) ?? []).length, 2);
  assert.match(html, /data-rate-id="rate-example" data-tier="1" aria-current="true"/);
  const unavailable = renderToStaticMarkup(React.createElement(PriceGrid, { rows: [{ ...row, selected: false, error_codes: ["EXAMPLE"] }] }));
  assert.match(unavailable, /Prix sur demande/);
  assert.match(unavailable, /demande de devis/);
  const mixed = renderToStaticMarkup(React.createElement(PriceGrid, { rows: [row, { ...row, tier_quantity: 2, selected: false, error_codes: ["EXAMPLE"] }] }));
  assert.match(mixed, /data-tier="2" data-unavailable="EXAMPLE"/);
});

test("les quatre sections optionnelles ne rendent rien sans données", () => {
  const { visibleSectionItems } = load("components/product/section-visibility.ts");
  assert.equal(visibleSectionItems(), null);
  assert.equal(visibleSectionItems([]), null);
  assert.equal(visibleSectionItems(null), null);
  const example = [{ label: "Exemple", value: "Exemple" }];
  assert.equal(visibleSectionItems(example), example);
  const sections = load("components/product/product-sections.tsx", {
    "next/link": "a",
    "@/components/home/family-card": { FamilyCard: () => null },
    "@/components/site/carousel-row": { CarouselRow: () => null },
  });
  for (const name of ["ProductCharacteristics", "ProductDocuments", "RelatedProducts", "UpsellProducts"]) {
    for (const items of [undefined, [], null]) assert.equal(sections[name]({ items }), null, name);
  }
  assert.match(renderToStaticMarkup(React.createElement(sections.ProductCharacteristics, { items: example })), /<dt[^>]*>Exemple/);
  assert.match(renderToStaticMarkup(React.createElement(sections.ProductDocuments, { items: [{ label: "Document exemple", href: "/document-exemple" }] })), /href="\/document-exemple"/);
});

test("galerie : alt produit, clavier, vignettes masquées si les visuels sont interdits", () => {
  let allowed = true;
  const changes = [];
  const { Gallery } = load("components/product/gallery.tsx", {
    react: { ...React, useState: () => [0, (next) => changes.push(next)], useRef: () => ({ current: [] }) },
    "@/components/site/media-policy": { useShowImages: () => allowed },
    "@/components/site/media-image": { MediaImage: (props) => React.createElement("img", { alt: props.alt, "data-media": props.sha256 }) },
  });
  const props = { familyName: "Produit exemple", images: [{ sha256: "media-example-a", caption: "Vue avant" }, { sha256: "media-example-b", caption: "Vue arrière" }] };
  const tree = Gallery(props);
  const html = renderToStaticMarkup(tree);
  assert.match(html, /alt="Produit exemple"/);
  assert.match(html, /aria-pressed="true"/);
  assert.equal(typeof tree.props.onKeyDown, "function");
  tree.props.onKeyDown({ key: "ArrowRight", preventDefault() {} });
  assert.equal(changes.at(-1), 1);
  allowed = false;
  const hidden = renderToStaticMarkup(Gallery(props));
  assert.doesNotMatch(hidden, /<button/);
  assert.doesNotMatch(hidden, /data-media="media-example/);
});

test("description pleine largeur, sections futures branchées et URL de variante conservée", () => {
  const page = read("app/famille/[slug]/page.tsx");
  assert.match(page, /lg:grid-cols-\[minmax\(0,58fr\)_minmax\(0,42fr\)\]/);
  assert.match(page, /family\.description_long/);
  for (const name of ["ProductCharacteristics", "ProductDocuments", "RelatedProducts", "UpsellProducts"]) assert.match(page, new RegExp(`<${name} items=\\{undefined\\}`));
  const buy = read("components/product/family-buy-box.tsx");
  assert.match(buy, /url\.searchParams\.set\("article", item\.public_item_key\)/);
  assert.match(buy, /data-testid="quote-from-family"/);
  assert.match(buy, /minimumQuantity/);
});


test("le minimum reste respecté avec les seuls sélecteurs conservés", () => {
  const values = [];
  let cursor = 0;
  const react = { ...React,
    useState(initial) {
      const index = cursor++;
      if (!(index in values)) values[index] = typeof initial === "function" ? initial() : initial;
      return [values[index], (next) => { values[index] = next; }];
    },
    useEffect() {}, useRef: (value) => ({ current: value }),
  };
  const VariantSelector = () => null;
  const { FamilyBuyBox } = load("components/product/family-buy-box.tsx", {
    react, "next/link": "a", "next/navigation": { useRouter: () => ({ push() {} }) },
    "@/components/cart/cart-provider": { MAX_QUANTITY: 1000000, useCart: () => ({ add() {}, lines: [] }) },
    "@/components/product/variant-selector": { VariantSelector },
    "@/components/product/price-grid": { PriceGrid: () => null },
    "@/components/site/api": { previewCart() { assert.fail("Aucune requête avant interaction"); } },
  });
  const props = { familyName: "Produit exemple", familySlug: "produit-exemple", schema: [], items:
    [6, 12, 1].map((tier, index) => ({ public_item_key: `example-${index}`, variant_axes: {}, axes: [], rows: [{ tier_quantity: tier, selected: false }] })),
  };
  function nodes(tree, predicate) {
    const result = [];
    function visit(node) {
      if (!node || typeof node !== "object") return;
      if (predicate(node)) result.push(node);
      React.Children.forEach(node.props?.children, visit);
    }
    visit(tree);
    return result;
  }
  const render = () => { cursor = 0; return FamilyBuyBox(props); };
  let tree = render();
  const input = () => nodes(tree, (node) => node.type === "input")[0];
  const select = (key) => nodes(tree, (node) => node.type === VariantSelector)[0].props.onSelect(key);
  assert.equal(input().props.value, "6");
  input().props.onChange({ target: { value: "2" } });
  tree = render();
  assert.equal(input().props["aria-invalid"], true);
  select("example-1");
  tree = render();
  assert.equal(input().props.value, "12");
  select("example-2");
  tree = render();
  assert.equal(input().props.value, "12");
  assert.equal(input().props["aria-invalid"], false);
  const buyButton = nodes(tree, (node) => node.type === "button" && node.props.className?.includes("product-add-to-cart"))[0];
  assert.match(buyButton.props.className, /fixed.*lg:static/);
  const css = read("components/product/product-sheet.css");
  assert.match(css, /body:has\(\[data-testid="compare-bar"\]\)/);
});
