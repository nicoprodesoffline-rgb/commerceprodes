import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "../..");
const require = createRequire(import.meta.url);
// Exécute les composants réels avec des hooks contrôlés ; aucun navigateur ni serveur.
function load(file, stubs = {}) {
  const cache = new Map();
  function read(filename) {
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} };
    cache.set(filename, module);
    const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, target: ts.ScriptTarget.ES2022 } }).outputText;
    const localRequire = (name) => {
      if (Object.hasOwn(stubs, name)) return stubs[name];
      if (name.startsWith("@/") || name.startsWith(".")) {
        const base = name.startsWith("@/") ? path.join(root, name.slice(2)) : path.resolve(path.dirname(filename), name);
        return read([base, `${base}.ts`, `${base}.tsx`].find((f) => fs.existsSync(f)));
      }
      return require(name);
    };
    new Function("require", "module", "exports", code)(localRequire, module, module.exports);
    return module.exports;
  }
  return read(path.join(root, file));
}
function hooks() {
  const values = [], effects = [];
  let cursor = 0;
  const useState = (initial) => {
    const index = cursor++;
    if (!(index in values)) values[index] = typeof initial === "function" ? initial() : initial;
    return [values[index], (value) => { values[index] = typeof value === "function" ? value(values[index]) : value; }];
  };
  return {
    react: { ...React, useState, useRef: (value) => useState(() => ({ current: value }))[0], useEffect: (fn) => effects.push(fn), useId: () => "test-row" },
    render: (fn, props) => { cursor = 0; effects.length = 0; return fn(props); },
    effects,
  };
}
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
const text = (tree) => {
  if (typeof tree === "string" || typeof tree === "number") return String(tree);
  return React.Children.toArray(tree?.props?.children).map(text).join("");
};

test("squelette de recherche : titre gris, 8 tuiles cachées et annonce de chargement", () => {
  const Loading = load("app/recherche/loading.tsx").default;
  const html = renderToStaticMarkup(React.createElement(Loading));
  assert.match(html, /role="status"/);
  assert.match(html, /class="sr-only">Chargement des résultats…/);
  assert.equal((html.match(/aria-hidden="true"/g) ?? []).length, 9);
  assert.match(html, /bg-/);
});

test("carrousel : sans effets aucun bouton, puis flèches selon le débordement et les bornes", () => {
  const h = hooks();
  const { CarouselRow } = load("components/site/carousel-row.tsx", { react: h.react });
  const props = { label: "Produits", children: React.createElement("li", null, "A") };
  let tree = h.render(CarouselRow, props);
  const row = nodes(tree, (n) => n.props?.role === "region")[0];
  assert.equal(row.props.tabIndex, 0);
  assert.equal(row.props["aria-label"], "Produits");
  assert.match(row.props.className, /snap-x/);
  assert.match(row.props.className, /overflow-x-auto/);
  assert.equal(nodes(tree, (n) => n.type === "button").length, 0);
  const calls = [], observers = [], listeners = new Map();
  const element = { scrollLeft: 0, scrollWidth: 1000, clientWidth: 300, children: [], scrollBy: (options) => calls.push(options), addEventListener: (key, fn) => listeners.set(key, fn), removeEventListener: (key) => listeners.delete(key) };
  row.props.ref.current = element;
  const previousWindow = globalThis.window, previousObserver = globalThis.ResizeObserver;
  let reduced = false, disconnected = false;
  globalThis.window = { matchMedia: () => ({ matches: reduced }), addEventListener() {}, removeEventListener() {} };
  globalThis.ResizeObserver = class { constructor(fn) { observers.push(fn); } observe() {} disconnect() { disconnected = true; } };
  try {
    const cleanups = h.effects.map((fn) => fn());
    tree = h.render(CarouselRow, props);
    let buttons = nodes(tree, (n) => n.type === "button");
    assert.deepEqual(buttons.map((b) => b.props["aria-label"]), ["Précédent", "Suivant"]);
    assert.deepEqual(buttons.map((b) => b.props.disabled), [true, false]);
    assert.match(buttons[0].props.className, /hidden md:/);
    assert.match(buttons[0].props.className, /\[42px\]/);
    buttons[1].props.onClick();
    assert.deepEqual(calls.pop(), { left: 300, behavior: "smooth" });
    reduced = true;
    element.scrollLeft = 700;
    listeners.get("scroll")();
    tree = h.render(CarouselRow, props);
    buttons = nodes(tree, (n) => n.type === "button");
    assert.deepEqual(buttons.map((b) => b.props.disabled), [false, true]);
    buttons[0].props.onClick();
    assert.deepEqual(calls.pop(), { left: -300, behavior: "auto" });
    element.scrollWidth = 300;
    observers[0]();
    tree = h.render(CarouselRow, props);
    assert.equal(nodes(tree, (n) => n.type === "button").length, 0);
    cleanups.forEach((cleanup) => cleanup?.());
    assert.equal(disconnected, true);
    assert.equal(listeners.size, 0);
  } finally { globalThis.window = previousWindow; globalThis.ResizeObserver = previousObserver; }
});

test("fiche : minimum initial, alerte sous le seuil et réinitialisation par les deux sélecteurs", () => {
  const h = hooks();
  const VariantSelector = () => null;
  const { FamilyBuyBox } = load("components/product/family-buy-box.tsx", {
    react: h.react, "next/link": () => null, "next/navigation": { useRouter: () => ({ push() {} }) },
    "@/components/cart/cart-provider": { MAX_QUANTITY: 1000000, useCart: () => ({ add() {}, lines: [] }) },
    "@/components/product/variant-selector": { VariantSelector },
    "@/components/product/price-grid": { PriceGrid: () => null },
    "@/components/site/api": { previewCart() { assert.fail("aucune demande avant les effets"); } },
    "@/components/site/media-image": { MediaImage: () => null },
    "@/components/site/basis-notice": { BasisNotice: () => null },
  });
  const props = { familyName: "Exemple", familySlug: "exemple", schema: [], items: [
    { public_item_key: "a", axes: [], variant_axes: {}, rows: [{ tier_quantity: 6, selected: false }] },
    { public_item_key: "b", axes: [], variant_axes: {}, rows: [{ tier_quantity: 12, selected: false }] },
    { public_item_key: "c", axes: [], variant_axes: {}, rows: [{ tier_quantity: 1, selected: false }] },
  ] };
  let tree = h.render(FamilyBuyBox, props);
  assert.equal(nodes(tree, (n) => n.type === "input")[0].props.value, "6");
  nodes(tree, (n) => n.type === "input")[0].props.onChange({ target: { value: "2" } });
  tree = h.render(FamilyBuyBox, props);
  assert.equal(nodes(tree, (n) => n.type === "input")[0].props["aria-invalid"], true);
  assert.ok(nodes(tree, (n) => n.props?.["aria-live"] === "polite").some((n) => text(n).includes("Quantité minimale : 6")));
  nodes(tree, (n) => n.type === VariantSelector)[0].props.onSelect("b");
  tree = h.render(FamilyBuyBox, props);
  assert.equal(nodes(tree, (n) => n.type === "input")[0].props.value, "12");
  const choose = nodes(tree, (n) => n.type === "button" && text(n).startsWith("Choisir"));
  choose.at(-1).props.onClick();
  tree = h.render(FamilyBuyBox, props);
  assert.equal(nodes(tree, (n) => n.type === "input")[0].props.value, "12", "minimum 1 : la quantité saisie est conservée comme auparavant");
  assert.doesNotMatch(text(tree), /Quantité minimale/);
});

test("favoris : bouton dès deux familles, bilan des refus et des choix, tiroir ouvert une seule fois", async () => {
  const h = hooks(), calls = [], events = [];
  let families = [];
  const { WishlistView } = load("components/site/selection-views.tsx", {
    react: h.react, "next/link": "a",
    "@/components/site/media-image": { MediaImage: () => null },
    "@/components/site/list-buttons": { CompareButton: () => null, WishlistButton: () => null },
    "@/components/site/local-list": { KEYS: { wishlist: "wishlist" }, useLocalList: () => families.map((f) => f.slug) },
    "@/components/site/use-families": { useFamilies: () => ({ status: "ready", families, missing: [] }) },
    "@/components/cart/cart-provider": { CART_ADDED_EVENT: "prodes:cart-added", useCart: () => ({ add: (...args) => calls.push(args) }) },
    "@/components/site/api": { previewCart: async ([line]) => ({ status: 200, network: false, json: { catalogue_sequence: 42, lines: [{ ...line, accepted: line.public_item_key !== "PI-bad", selection: line.public_item_key !== "PI-bad" ? {} : null, error_codes: line.public_item_key === "PI-bad" ? ["ITEM_RETIRED"] : [] }] } }) },
  });
  const family = (slug, single = true) => ({ slug, name: slug, axes: [], single: single ? { public_item_key: `PI-${slug}`, variant_axes: {}, axes: [] } : null });
  const button = (tree) => nodes(tree, (n) => n.type === "button" && text(n).includes("Ajouter tout au panier"))[0];
  families = [family("a")];
  assert.equal(button(h.render(WishlistView)), undefined);
  families = [family("a"), family("b"), family("bad"), family("choix", false)];
  const previousWindow = globalThis.window, previousDocument = globalThis.document;
  globalThis.window = { dispatchEvent: (event) => events.push(event) };
  globalThis.document = { activeElement: null };
  try {
    await button(h.render(WishlistView)).props.onClick();
    const tree = h.render(WishlistView);
    assert.equal(calls.length, 2);
    assert.ok(calls.every((args) => args[2].announce === false));
    assert.equal(events.length, 1);
    assert.equal(events[0].type, "prodes:cart-added");
    assert.match(text(tree), /2 ajoutés, 1 refusé par le serveur/);
    assert.match(text(tree), /1 produit.*demand.*choisir une variante/);
    assert.equal(nodes(tree, (n) => n.props?.href === "/famille/choix").length, 2, "fiche dans la grille et dans le bilan");
    assert.ok(nodes(tree, (n) => n.props?.["aria-live"] === "polite").some((n) => text(n).includes("refusé par le serveur")));
  } finally { globalThis.window = previousWindow; globalThis.document = previousDocument; }
});


test("routes de lecture appelées directement : 120 autorisées, 429 échappé ensuite, autre adresse autorisée", async () => {
  const stubs = {
    "@/components/site/catalog-views": { SEARCH_MAX: 100, searchFamilies: () => [], navigationOf: () => ({ node: () => null, anchor: () => null }) },
    "@/lib/site-catalog/clock": { serverNowUtc: () => "2026-10-31T09:00:00Z" },
    "@/lib/site-catalog/listing-price": { familyPrice: () => null },
    "@/lib/site-catalog/page": { catalogOrNull: async () => ({ familyBySlug: () => null }) },
    "@/lib/site-catalog/suggest": { SUGGEST_MIN: 2, suggestionsOf: () => [] },
  };
  for (const [endpoint, key] of [["search", "results"], ["families", "families"]]) {
    const { GET } = load(`app/api/site/${endpoint}/route.ts`, stubs);
    const req = () => new Request(`http://example.test/api/site/${endpoint}`, { headers: { "x-forwarded-for": " 192.0.2.1 , 198.51.100.2" } });
    for (let i = 0; i < 120; i++) assert.equal((await GET(req())).status, 200);
    const limited = await GET(req());
    assert.equal(limited.status, 429);
    assert.match(limited.headers.get("retry-after"), /^[1-9]\d*$/);
    assert.match(limited.headers.get("cache-control"), /no-store/);
    const body = await limited.text();
    assert.deepEqual(JSON.parse(body), { [key]: [], limited: true });
    assert.doesNotMatch(body, /[<>&]/);
    assert.equal((await GET(new Request(`http://example.test/api/site/${endpoint}`, { headers: { "x-forwarded-for": "192.0.2.2" } }))).status, 200);
  }
});

test("icône déclarée et route favicon existante toujours sans contenu (204)", () => {
  assert.match(fs.readFileSync(path.join(root, "app/layout.tsx"), "utf8"), /icons: \{ icon: "\/logo-prodes\.png" \}/);
  assert.ok(fs.existsSync(path.join(root, "public/logo-prodes.png")));
  const response = load("app/favicon.ico/route.ts").GET();
  assert.equal(response.status, 204);
  assert.equal(response.body, null);
});
