import { test } from "node:test";
import assert from "node:assert/strict";
import { validateEnvelope } from "../../lib/site-content/validate.ts";

const uuid = "88888888-8888-4888-8888-888888888888";
const sha = "a".repeat(64);
const refs = { categoryKeys: new Set(["demo-a", "demo-b"]), familyKeys: new Set(["demo-2", "demo-1"]), mediaShas: new Set([sha]) };
const sections = () => [
  { type: "hero", data: { title: "Démo", text: "<script>démo</script>\nTexte", link: "/demo" } },
  { type: "category_grid", data: { categories: ["demo-b", "demo-a"] } },
  { type: "product_carousel", data: { families: ["demo-2", "demo-1"] } },
  { type: "text_image", data: { title: "Image démo", text: "Texte\nDémo", media_sha: sha } },
];
const page = () => ({ key: uuid, slug: "/demo", title: "Page démo", revision: 1, seo_title: "", seo_description: "", canonical: "", sections: sections() });
const doc = () => ({ contract_version: "site_content.v1", generation: 1, publication_id: uuid, catalogue_sequence: null, pages: [page()] });
const fail = (mutate, code) => { const d = doc(); mutate(d); const r = validateEnvelope(d, refs); assert.equal(r.ok, false); assert.equal(r.code, code); assert.equal(typeof r.detail, "string"); };

test("jeu vide valide, champs d'enveloppe supplémentaires ignorés, ordre et clés conservés", () => {
  const d = doc(); d.extra = "ignoré";
  const r = validateEnvelope(d, refs);
  assert.equal(r.ok, true);
  assert.deepEqual(r.set, { generation: 1, publicationId: uuid, pages: d.pages });
  assert.equal(validateEnvelope({ ...d, pages: [] }, refs).ok, true);
  assert.equal(validateEnvelope({ ...d, catalogue_sequence: -1 }, refs).ok, true);
});

test("version et forme de l'enveloppe", () => {
  for (const v of [null, [], 1, "démo"]) assert.equal(validateEnvelope(v, refs).code, "ENVELOPE");
  fail(d => { d.contract_version = "autre"; }, "CONTRACT_VERSION");
  for (const generation of [0, -1, 1.5, true, Number.MAX_SAFE_INTEGER + 1]) fail(d => { d.generation = generation; }, "ENVELOPE");
  for (const publication_id of ["demo", null, 42, uuid + "\n"]) fail(d => { d.publication_id = publication_id; }, "ENVELOPE");
  for (const catalogue_sequence of [undefined, "1", 1.2, true]) fail(d => { d.catalogue_sequence = catalogue_sequence; }, "ENVELOPE");
  for (const pages of [null, {}, "demo"]) fail(d => { d.pages = pages; }, "ENVELOPE");
});

test("slugs locaux, borne 200, unicité atomique", () => {
  for (const slug of ["/", "/saison/noel_2026", "/" + "a".repeat(199)]) {
    const d = doc(); d.pages[0].slug = slug; assert.equal(validateEnvelope(d, refs).ok, true);
  }
  for (const slug of ["demo", "//demo", "/demo/", "/a//b", "/..", "/A", "/a?b", "/a#b", "/a:b", "/a b", "/" + "a".repeat(200), 12, "/a\n"]) fail(d => { d.pages[0].slug = slug; }, "PAGE_SLUG");
  fail(d => { d.pages.push(page()); }, "PAGE_DUPLICATE_SLUG");
});

test("champs de page requis, clés inconnues, bornes et contrôles", () => {
  for (const key of Object.keys(page())) fail(d => { delete d.pages[0][key]; }, key === "slug" ? "PAGE_SLUG" : "PAGE_FIELD");
  fail(d => { d.pages[0].extra = "démo"; }, "PAGE_FIELD");
  for (const value of [null, [], "demo"]) fail(d => { d.pages[0] = value; }, "PAGE_FIELD");
  for (const [key, values] of Object.entries({ key: ["demo", 1], revision: [0, -1, 1.2, true], title: ["", "a".repeat(201), "a\t", "a\n"], seo_title: ["a".repeat(201), null], seo_description: ["a".repeat(1001), "a\u0085"], canonical: ["https://demo.invalid", "/a?b", "/a\n"], sections: [[], Array.from({ length: 31 }, () => sections()[0]), null] })) {
    for (const value of values) fail(d => { d.pages[0][key] = value; }, "PAGE_FIELD");
  }
  const d = doc(); Object.assign(d.pages[0], { title: "a".repeat(200), seo_title: "a".repeat(200), seo_description: "a".repeat(1000), canonical: "/demo", sections: Array.from({ length: 30 }, () => sections()[0]) });
  assert.equal(validateEnvelope(d, refs).ok, true);
});

test("types, clés et données des sections stricts", () => {
  for (const value of [null, [], {}, { type: "inconnu", data: {} }]) fail(d => { d.pages[0].sections = [value]; }, "SECTION_TYPE");
  fail(d => { d.pages[0].sections[0].extra = 1; }, "SECTION_FIELD");
  for (let i = 0; i < 4; i++) {
    fail(d => { d.pages[0].sections[i].data.extra = 1; }, "SECTION_FIELD");
    fail(d => { d.pages[0].sections[i].data = null; }, "SECTION_FIELD");
    fail(d => { d.pages[0].sections[i].data.title = "a".repeat(201); }, "SECTION_FIELD");
    fail(d => { d.pages[0].sections[i].data.title = ""; }, "SECTION_FIELD");
    const d = doc(); d.pages[0].sections[i].data.title = "a".repeat(200); assert.equal(validateEnvelope(d, refs).ok, true);
  }
  for (const [i, key] of [[0, "title"], [1, "categories"], [2, "families"], [3, "text"], [3, "media_sha"]]) fail(d => { delete d.pages[0].sections[i].data[key]; }, "SECTION_FIELD");
  for (const [i, key] of [[0, "title"], [0, "text"], [3, "text"]]) {
    fail(d => { d.pages[0].sections[i].data[key] = ""; }, "SECTION_FIELD");
    for (const text of [42, "a\u0000", "a\t", "a\r", "a\u007f"]) fail(d => { d.pages[0].sections[i].data[key] = text; }, "SECTION_FIELD");
  }
  for (const i of [0, 3]) {
    const d = doc(); d.pages[0].sections[i].data.text = "a".repeat(10000); assert.equal(validateEnvelope(d, refs).ok, true);
    fail(d => { d.pages[0].sections[i].data.text = "a".repeat(10001); }, "SECTION_FIELD");
  }
  fail(d => { d.pages[0].sections[3].data.media_sha = "x".repeat(64); }, "SECTION_FIELD");
});

test("liens locaux uniquement, sans contrôles, encodages contournés ni schéma", () => {
  for (const link of ["https://demo.invalid", "//demo.invalid", "javascript:demo", "/a:b", "/a b", "/a\n", "/a\\b", "/%2f%2fdemo.invalid", "/a%0ab", 42]) fail(d => { d.pages[0].sections[0].data.link = link; }, "LINK_NOT_LOCAL");
  for (const link of ["/", "/demo", "/demo?tri=nom#selection"]) {
    const d = doc(); d.pages[0].sections[0].data.link = link; assert.equal(validateEnvelope(d, refs).ok, true);
  }
});

test("références : non vides, uniques, au plus 24, présentes dans le catalogue", () => {
  for (const [i, key] of [[1, "categories"], [2, "families"]]) {
    for (const value of [[], ["demo-a", "demo-a"], Array.from({ length: 25 }, (_, n) => `demo-${n}`), [12], ["a\t"], "demo-a"]) fail(d => { d.pages[0].sections[i].data[key] = value; }, "SECTION_FIELD");
    fail(d => { d.pages[0].sections[i].data[key] = ["absent"]; }, "REFERENCE_MISSING");
    const keys = Array.from({ length: 24 }, (_, n) => `demo-${n}`);
    const d = doc(); d.pages[0].sections = [{ type: i === 1 ? "category_grid" : "product_carousel", data: { [key]: keys } }];
    assert.equal(validateEnvelope(d, { ...refs, [i === 1 ? "categoryKeys" : "familyKeys"]: new Set(keys) }).ok, true);
  }
  fail(d => { d.pages[0].sections[3].data.media_sha = "b".repeat(64); }, "REFERENCE_MISSING");
});

test("bornes en caractères Unicode, y compris hors du plan multilingue de base", () => {
  const d = doc(); d.pages[0].title = "🟢".repeat(200); d.pages[0].sections[0].data.text = "🟢".repeat(10000);
  assert.equal(validateEnvelope(d, refs).ok, true);
  fail(d => { d.pages[0].title = "🟢".repeat(201); }, "PAGE_FIELD");
  fail(d => { d.pages[0].sections[0].data.text = "🟢".repeat(10001); }, "SECTION_FIELD");
});
