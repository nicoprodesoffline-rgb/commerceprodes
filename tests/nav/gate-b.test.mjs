import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import React from "react";
import ts from "typescript";

const root = new URL("../../", import.meta.url);
const require = createRequire(import.meta.url);
const read = (file) => readFileSync(new URL(file, root), "utf8");
function files(directory) {
  return readdirSync(new URL(directory, root), { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? files(`${directory}/${entry.name}`) : [`${directory}/${entry.name}`]);
}
function load(file, stubs) {
  const module = { exports: {} };
  const code = ts.transpileModule(read(file), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function("require", "module", "exports", code)((name) => {
    if (name in stubs) return stubs[name];
    if (name.startsWith("@/")) {
      const dependency = [".ts", ".tsx"].map((extension) => name.slice(2) + extension)
        .find((candidate) => existsSync(new URL(candidate, root)));
      assert.ok(dependency, name);
      return load(dependency, stubs);
    }
    return require(name);
  }, module, module.exports);
  return module.exports;
}
function nodes(tree, predicate) {
  const found = [];
  function visit(node) {
    if (!node || typeof node !== "object") return;
    if (predicate(node)) found.push(node);
    React.Children.forEach(node.props?.children, visit);
  }
  visit(tree);
  return found;
}
function text(node) {
  if (typeof node === "string" || typeof node === "number") return String(node);
  return React.Children.toArray(node?.props?.children).map(text).join("");
}
function buyBox() {
  const values = [], setters = [];
  let cursor = 0;
  const PriceGrid = () => null;
  const VariantSelector = () => null;
  const { FamilyBuyBox } = load("components/product/family-buy-box.tsx", {
    react: { ...React, useEffect() {}, useRef: (current) => ({ current }), useState(initial) {
      const index = cursor++;
      if (!(index in values)) values[index] = typeof initial === "function" ? initial() : initial;
      setters[index] = (next) => { values[index] = next; };
      return [values[index], setters[index]];
    } },
    "next/link": "a",
    "next/navigation": { useRouter: () => ({ push() {} }) },
    "@/components/cart/cart-provider": { MAX_QUANTITY: 1000000, useCart: () => ({ add() {}, lines: [] }) },
    "@/components/product/price-grid": { PriceGrid },
    "@/components/product/variant-selector": { VariantSelector },
    "@/components/site/api": { previewCart() { assert.fail("Pas de requête réseau dans ce test"); } },
    "@/components/site/format": { price: (amount) => amount, money: (amount) => amount, basisLabel: () => "", axesText: () => "" },
  });
  const props = {
    familyName: "Produit exemple", familySlug: "produit-exemple", schema: [],
    gallery: React.createElement("div", { "data-testid": "example-gallery" }),
    items: ["item-example-a", "item-example-b"].map((key) => ({
      public_item_key: key, variant_axes: {}, axes: [], image_sha256: null,
      rows: [{ tier_quantity: 1, selected: true, unit_amount: "amount-tier", rate_id: "rate-tier" }],
    })),
  };
  let tree;
  const render = () => { cursor = 0; tree = FamilyBuyBox(props); return tree; };
  const byId = (id) => nodes(tree, (node) => node.props?.["data-testid"] === id)[0];
  const quote = (quantity, overrides = {}) => {
    setters[2]({ state: "line", key: props.items[0].public_item_key, quantity, sequence: 1,
      line: { public_item_key: props.items[0].public_item_key, quantity, accepted: true, error_codes: [],
        selection: { rate_id: "rate-current", unit_amount: "amount-current", tax_basis_or_status: null }, line_total: null },
      ...overrides });
  };
  render();
  return { render, byId, quote, PriceGrid, props,
    quantity(value) { nodes(tree, (node) => node.type === "input")[0].props.onChange({ target: { value } }); },
    variant(key) { nodes(tree, (node) => node.type === VariantSelector)[0].props.onSelect(key); },
  };
}

test("D3 : aucune formule de prix minimum dans la fiche", () => {
  for (const file of [...files("app/famille"), ...files("components/product")]) {
    assert.doesNotMatch(read(file), /à partir de/i, file);
  }
});

test("D3 : grand prix, indication de quantité et tableau partagent la sélection serveur", () => {
  const source = read("components/product/family-buy-box.tsx");
  const priceBlock = source.slice(source.indexOf('data-testid="product-price"'), source.indexOf('data-testid="product-price"') + 700);
  assert.match(priceBlock, /price\(priced\.selection\.unit_amount, priced\.selection\.tax_basis_or_status\)/);
  assert.match(source, /selectedRateId=\{priced\?\.selection\?\.rate_id \?\? null\}/);
  assert.match(source, /unit\(priced\.selection\.unit_amount, priced\.selection\.tax_basis_or_status\)/);
  assert.doesNotMatch(source, /const lowest|availableRows\.reduce|localeCompare/);
  const h = buyBox();
  assert.equal(h.byId("product-price"), undefined, "Aucun prix avant la réponse");
  h.quote(1);
  let tree = h.render();
  assert.match(text(h.byId("product-price")), /amount-current.*l.unité/);
  assert.match(text(h.byId("qty-price")), /Pour 1 : amount-current/);
  assert.equal(nodes(tree, (node) => node.type === h.PriceGrid)[0].props.selectedRateId, "rate-current");
  h.quantity("7");
  tree = h.render();
  assert.equal(h.byId("product-price"), undefined, "Le prix précédent disparaît dès la saisie");
  assert.equal(nodes(tree, (node) => node.type === h.PriceGrid)[0].props.selectedRateId, null);
  assert.doesNotMatch(text(h.byId("qty-price")), /amount-current/);
  h.quote(7, { line: { public_item_key: h.props.items[0].public_item_key, quantity: 7, accepted: true,
    selection: { rate_id: "rate-next", unit_amount: "amount-next", tax_basis_or_status: null }, line_total: null } });
  tree = h.render();
  assert.match(text(h.byId("product-price")), /amount-next/);
  assert.match(text(h.byId("qty-price")), /Pour 7 : amount-next/);
  assert.equal(nodes(tree, (node) => node.type === h.PriceGrid)[0].props.selectedRateId, "rate-next");
});

test("D3 : aucun grand prix pour une réponse obsolète, refusée, en erreur ou une quantité invalide", () => {
  const h = buyBox();
  h.quote(1, { state: "loading" });
  h.render();
  assert.equal(h.byId("product-price"), undefined);
  h.quote(1, { line: { public_item_key: "item-example-a", quantity: 7, accepted: true, selection: { unit_amount: "amount-other" } } });
  h.render();
  assert.equal(h.byId("product-price"), undefined);
  h.quote(1, { line: { public_item_key: "item-example-b", quantity: 1, accepted: true, selection: { unit_amount: "amount-other" } } });
  h.render();
  assert.equal(h.byId("product-price"), undefined);
  h.quote(1, { line: { public_item_key: "item-example-a", quantity: 1, accepted: false, selection: { unit_amount: "amount-refused" }, error_codes: [] } });
  h.render();
  assert.equal(h.byId("product-price"), undefined);
  h.quote(1, { state: "error", text: "Réessayez", codes: [] });
  h.render();
  assert.equal(h.byId("product-price"), undefined);
  h.quote(1);
  h.quantity("");
  h.render();
  assert.equal(h.byId("product-price"), undefined);
  h.quantity("1");
  h.variant("item-example-b");
  h.render();
  assert.equal(h.byId("product-price"), undefined);
});

test("D6 : en-tête puis galerie puis contrôles sur mobile, galerie à gauche sur ordinateur", () => {
  const h = buyBox();
  h.quote(1);
  const tree = h.render();
  const heading = h.byId("product-heading");
  const gallery = h.byId("product-gallery");
  const controls = h.byId("product-controls");
  assert.ok(heading && gallery && controls);
  assert.match(heading.props.className, /\border-1\b/);
  assert.match(gallery.props.className, /\border-2\b/);
  assert.match(controls.props.className, /\border-3\b/);
  const headingNodes = nodes(heading, () => true);
  assert.ok(headingNodes.findIndex((node) => node.type === "h1") < headingNodes.indexOf(h.byId("selected-variant")));
  assert.ok(headingNodes.indexOf(h.byId("selected-variant")) < headingNodes.indexOf(h.byId("product-price")));
  assert.ok(nodes(tree, () => true).indexOf(heading) < nodes(tree, () => true).indexOf(gallery));
  const panel = nodes(tree, (node) => /contents lg:order-2 lg:block/.test(node.props?.className ?? ""))[0];
  assert.ok(panel, "Le panneau d'achat reste à droite à partir de lg");
  assert.match(gallery.props.className, /lg:order-1/);
  assert.match(read("app/famille/[slug]/page.tsx"), /lg:grid-cols-\[minmax\(0,58fr\)_minmax\(0,42fr\)\]/);
  assert.match(read("components/product/gallery.tsx"), /aspect-\[4\/3\].*max-h-\[50vh\].*lg:aspect-square/);
  const button = nodes(controls, (node) => node.props?.className?.includes("product-add-to-cart"))[0];
  assert.match(button.props.className, /fixed.*lg:static/);
});

test("D9 / D11 / D4 : actions rouges, liens de liste discrets et référence publique conservée", () => {
  const source = read("components/site/selection-views.tsx");
  assert.doesNotMatch(source, /bg-ink/);
  assert.match(source, /bg-brand.*hover:bg-brand-dark/);
  const page = read("app/famille/[slug]/page.tsx");
  assert.match(page, /product-list-links/);
  for (const name of ["WishlistButton", "CompareButton"]) assert.match(page, new RegExp(`<${name} slug=\\{family\\.slug\\}`));
  const css = read("components/product/product-sheet.css");
  assert.match(css, /\.product-list-links button\s*\{[^}]*min-height:\s*44px;[^}]*border:\s*0;[^}]*background:\s*transparent;[^}]*color:\s*var\(--color-ink-2, #55554f\);/);
  assert.match(read("components/product/family-buy-box.tsx"), /Référence <span[^>]*data-testid="item-ref">\{item\.public_item_key\}/);
});
