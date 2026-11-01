import { test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { validateEnvelope } from "../../lib/site-content/validate.ts";

const hooks = registerHooks({ resolve(specifier, context, next) {
  return next(specifier === "./validate" && context.parentURL?.endsWith("/site-content/reader.ts") ? "./validate.ts" : specifier, context);
} });
const { readEditorialSet, __resetForTests } = await import("../../lib/site-content/reader.ts");
hooks.deregister();
const uuid = "77777777-7777-4777-8777-777777777777";
const key = n => `PF-${String(n).padStart(9, "0")}`;
const [a, b, c, d, e, unknown] = [1, 2, 3, 4, 5, 9].map(key);
const refs = { categoryKeys: new Set(), familyKeys: new Set([a, b, c, d, e]), mediaShas: new Set() };
const relation = (source = a, target = b, kind = "LIE", order = 1) => ({ source, target, kind, order });
const doc = merchandising => ({ contract_version: "site_content.v1", generation: 1, publication_id: uuid, catalogue_sequence: null, pages: [], ...(merchandising === undefined ? {} : { merchandising }) });
const valid = () => [relation(a, d, "COMPLEMENTAIRE"), relation(a, c, "LIE"), relation(a, b, "LIE", 2), relation(a, e, "UPSELL"), relation(b, c)];

test("relations valides : conservées, sans prix ; absence normalisée en tableau vide", () => {
  const rows = valid();
  const result = validateEnvelope(doc(rows), refs);
  assert.equal(result.ok, true);
  assert.deepEqual(result.set.merchandising, rows);
  assert.deepEqual(validateEnvelope(doc(), refs).set.merchandising, []);
  // Une référence inconnue n'invalide pas l'ensemble éditorial.
  assert.equal(validateEnvelope(doc([relation(a, unknown), relation(unknown, a)]), refs).ok, true);
});

const rejects = [
  ["tableau vide à omettre", []],
  ...[null, {}, "relations", 42, true].map(value => ["champ non tableau : " + JSON.stringify(value), value]),
  ...[null, [], "relation", 42].map(value => ["objet invalide : " + JSON.stringify(value), [value]]),
  ...["source", "target", "kind", "order"].map(field => {
    const row = relation(); delete row[field]; return [`clé obligatoire ${field}`, [row]];
  }),
  ["clé inconnue", [{ ...relation(), extra: true }]],
  ["prix interdit", [{ ...relation(), price: "interdit" }]],
  ...["source", "target"].flatMap(field => [null, 42, "", "PF-123", "PI-000000001", "pf-000000001", "PF-00000000I", "PF-00000000L", "PF-00000000O", "PF-00000000U", "PF-000000001\n"].map(value => [`clé famille ${field} : ${JSON.stringify(value)}`, [{ ...relation(), [field]: value }]])),
  ...[null, 1, "lie", "SIMILAIRE"].map(kind => [`type de relation ${JSON.stringify(kind)}`, [{ ...relation(), kind }]]),
  ...[null, "1", 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1].map(order => [`ordre invalide ${JSON.stringify(order)}`, [{ ...relation(), order }]]),
  ["ordre commence à deux", [relation(a, b, "LIE", 2)]],
  ["ordre non dense", [relation(), relation(a, c, "LIE", 3)]],
  ["ordre répété", [relation(), relation(a, c)]],
  ["tri source", [relation(b, c), relation()]],
  ["tri type binaire", [relation(), relation(a, c, "COMPLEMENTAIRE")]],
  ["tri ordre", [relation(a, c, "LIE", 2), relation()]],
  ["couple dupliqué même type", [relation(), relation(a, b, "LIE", 2)]],
  ["couple dupliqué entre types", [relation(), relation(a, b, "UPSELL")]],
  ["auto-relation", [relation(a, a)]],
];
for (const [label, rows] of rejects) test(`refus de l'ensemble : ${label}`, () => {
  assert.equal(validateEnvelope(doc(rows), refs).ok, false);
});

test("résolution : LIE puis COMPLEMENTAIRE, UPSELL séparé, ordre éditorial et catalogue actif", async () => {
  const { relatedFamilies } = await import("../../lib/site-content/merchandising.ts");
  const set = validateEnvelope(doc(valid()), refs).set;
  const before = structuredClone(set);
  assert.deepEqual(relatedFamilies(set, a, refs.familyKeys), { complementary: [c, b, d], upsell: [e] });
  assert.deepEqual(relatedFamilies(set, a, new Set([a, b, d])), { complementary: [b, d], upsell: [] });
  assert.deepEqual(relatedFamilies(set, a, new Set([b, c, d, e])), { complementary: [], upsell: [] });
  assert.deepEqual(relatedFamilies(set, unknown, refs.familyKeys), { complementary: [], upsell: [] });
  assert.deepEqual(relatedFamilies(null, a, refs.familyKeys), { complementary: [], upsell: [] });
  assert.deepEqual(relatedFamilies(validateEnvelope(doc(), refs).set, a, refs.familyKeys), { complementary: [], upsell: [] });
  assert.deepEqual(set, before, "résolution sans mutation");
});

test("résolution défensive : cible dédoublonnée entre les listes et ordre numérique", async () => {
  const { relatedFamilies } = await import("../../lib/site-content/merchandising.ts");
  const set = { generation: 1, publicationId: uuid, pages: [], merchandising: [
    relation(a, d, "UPSELL"), relation(a, b, "COMPLEMENTAIRE"), relation(a, c, "LIE", 2),
    relation(a, b), relation(a, c, "UPSELL", 2), relation(a, unknown, "UPSELL", 3), relation(unknown, e),
  ] };
  assert.deepEqual(relatedFamilies(set, a, refs.familyKeys), { complementary: [b, c], upsell: [d] });
});

async function put(dir, document) {
  const file = `${String(document.generation).padStart(12, "0")}-${uuid}.json`;
  // Espaces et saut de ligne : le reçu porte bien sur les octets écrits.
  const bytes = Buffer.from(JSON.stringify(document, null, 2) + "\n");
  await writeFile(path.join(dir, file), bytes);
  await writeFile(path.join(dir, file.replace(/\.json$/, ".ready.json")), JSON.stringify({ contract_version: "site_content.v1", generation: document.generation, publication_id: uuid, file, sha256: createHash("sha256").update(bytes).digest("hex") }));
  return file;
}

test("lecteur : remplacement complet, refus atomique, rétention, non-régression et catalogue actif", async () => {
  __resetForTests();
  const dir = await mkdtemp(path.join(tmpdir(), "site-merchandising-"));
  try {
    await put(dir, doc(valid()));
    const first = await readEditorialSet(dir, refs);
    assert.deepEqual(first.merchandising, valid());
    assert.strictEqual(await readEditorialSet(dir, refs), first);
    const invalid = { ...doc([relation(a, b, "LIE", 2)]), generation: 2 };
    await put(dir, invalid);
    assert.strictEqual(await readEditorialSet(dir, refs), first);
    const changed = { ...refs, familyKeys: new Set([a, b, d]) };
    const retained = await readEditorialSet(dir, changed);
    assert.deepEqual(retained.merchandising, valid(), "le jeu retenu garde les relations, même hors catalogue");
    const { relatedFamilies } = await import("../../lib/site-content/merchandising.ts");
    assert.deepEqual(relatedFamilies(retained, a, changed.familyKeys), { complementary: [b, d], upsell: [] });
    const file = await put(dir, { ...doc(), generation: 3 });
    const cleared = await readEditorialSet(dir, refs);
    assert.equal(cleared.generation, 3);
    assert.deepEqual(cleared.merchandising, []);
    await rm(path.join(dir, file));
    await rm(path.join(dir, file.replace(/\.json$/, ".ready.json")));
    assert.strictEqual(await readEditorialSet(dir, refs), cleared);
  } finally { await rm(dir, { recursive: true, force: true }); __resetForTests(); }
});

const require = createRequire(import.meta.url);
const root = new URL("../../", import.meta.url);
function load(file, stubs) {
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(new URL(file, root), "utf8"), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  new Function("require", "module", "exports", code)(specifier => {
    if (specifier in stubs) return stubs[specifier];
    if (specifier.startsWith("@/")) {
      const target = [".ts", ".tsx"].map(ext => specifier.slice(2) + ext).find(candidate => existsSync(new URL(candidate, root)));
      assert.ok(target, specifier);
      return load(target, stubs);
    }
    return require(specifier);
  }, module, module.exports);
  return module.exports;
}

test("fiche : cartes ordonnées, prix transmis, similaires dédoublonnés et sections vides absentes", async () => {
  const { relatedFamilies } = await import("../../lib/site-content/merchandising.ts");
  const families = [a, b, c, d, e, key(6)].map((public_family_key, index) => ({
    public_family_key, slug: `produit-${index}`, name: `Produit ${index}`, axes: [], items: [],
    primary_category_key: "rubrique", secondary_category_keys: [], description_long: "", image_main_sha256: "a".repeat(64),
  }));
  const catalog = { families, familyBySlug: () => families[0] };
  let set = validateEnvelope(doc(valid()), refs).set;
  const FamilyCard = ({ data, from }) => React.createElement("li", null, React.createElement("a", { href: `/famille/${data.slug}`, "data-price": from?.amount ?? "sur-devis" }, data.name));
  const stubs = {
    "@/components/product/product-sheet.css": {}, "next/link": "a",
    "next/headers": { headers: async () => new Map() }, "next/navigation": { notFound: () => assert.fail("famille attendue") },
    "@/components/home/family-card": { FamilyCard },
    "@/components/layout/breadcrumbs": { Breadcrumbs: () => null },
    "@/components/product/family-buy-box": { FamilyBuyBox: ({ children }) => React.createElement("div", null, children) },
    "@/components/product/gallery": { Gallery: () => null },
    "@/components/site/catalog-views": { familyCard: f => ({ slug: f.slug, name: f.name }), categoryCrumbs: () => [], navigationOf: () => ({ anchor: () => null }) },
    "@/components/site/list-buttons": { CompareButton: () => null, WishlistButton: () => null },
    "@/components/site/selection-views": { RecentlyViewed: () => null },
    "@/components/site/carousel-row": { CarouselRow: ({ children, label }) => React.createElement("ul", { "aria-label": label }, children) },
    "@/components/site/format": { axesText: () => "" },
    "@/lib/site-catalog/clock": { serverNowUtc: () => "2026-10-19T06:00:00Z" },
    "@/lib/site-catalog/listing-price": { familyPrice: (active, f, instant) => {
      assert.strictEqual(active, catalog); assert.equal(instant, "2026-10-19T06:00:00Z");
      return { amount: `prix-${f.slug}`, basis: null };
    } },
    "@/lib/site-catalog/page": { catalogForPage: async () => catalog },
    "@/lib/site-catalog/view": { priceRows: () => [], selectorAxes: () => [] },
    "@/lib/site-content/source": { getEditorialSet: async () => set },
    "@/lib/site-content/merchandising": { relatedFamilies },
  };
  const Page = load("app/famille/[slug]/page.tsx", stubs).default;
  const render = async () => renderToStaticMarkup(await Page({ params: Promise.resolve({ slug: families[0].slug }), searchParams: Promise.resolve({}) }));
  const section = (html, id) => new RegExp(`<section[^>]*aria-labelledby="${id}"[^>]*>([\\s\\S]*?)</section>`).exec(html)?.[1] ?? "";
  const links = html => [...html.matchAll(/href="\/famille\/([^"]+)"/g)].map(match => match[1]);
  const html = await render();
  assert.match(section(html, "related-h"), /Produits complémentaires/);
  assert.match(section(html, "upsell-h"), /Montée en gamme/);
  assert.deepEqual(links(section(html, "related-h")), [families[2].slug, families[1].slug, families[3].slug]);
  assert.deepEqual(links(section(html, "upsell-h")), [families[4].slug]);
  assert.deepEqual(links(section(html, "similar-h")), [families[5].slug]);
  for (const f of families.slice(1)) assert.ok(html.includes(`data-price="prix-${f.slug}"`));
  set = validateEnvelope(doc(), refs).set;
  const empty = await render();
  assert.doesNotMatch(empty, /related-h|upsell-h|Produits complémentaires|Montée en gamme/);
  assert.deepEqual(links(section(empty, "similar-h")), families.slice(1).map(f => f.slug));
  set = { ...set, merchandising: [relation(a, unknown), relation(a, unknown, "UPSELL")] };
  assert.doesNotMatch(await render(), /related-h|upsell-h/);
});
