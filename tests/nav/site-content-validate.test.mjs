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
  assert.deepEqual(r.set, { generation: 1, publicationId: uuid, pages: d.pages.map(p => ({ ...p, nav: { showInBar: true, order: 100 } })) });
  assert.equal(validateEnvelope({ ...d, pages: [] }, refs).ok, true);
  assert.equal(validateEnvelope({ ...d, catalogue_sequence: -1 }, refs).ok, true);
});

test("ancien document sans ajouts : navigation par défaut, libellé et alternatif absents", () => {
  const r = validateEnvelope(doc(), refs);
  assert.equal(r.ok, true);
  assert.deepEqual(r.set.pages[0].nav, { showInBar: true, order: 100 });
  assert.equal(r.set.pages[0].sections[0].data.linkLabel, undefined);
  assert.equal(r.set.pages[0].sections[3].data.imageAlt, undefined);
});

test("nav facultatif : défauts, ordre 0 et 1 000 000, types et clés stricts", () => {
  for (const [nav, expected] of [[{}, { showInBar: true, order: 100 }], [{ order: 0 }, { showInBar: true, order: 0 }], [{ show_in_bar: false }, { showInBar: false, order: 100 }], [{ order: 1000000, show_in_bar: true }, { showInBar: true, order: 1000000 }]]) {
    const d = doc(); d.pages[0].nav = nav;
    const r = validateEnvelope(d, refs); assert.equal(r.ok, true); assert.deepEqual(r.set.pages[0].nav, expected);
  }
  for (const nav of [null, [], "nav", 3, true, { extra: 1 }]) fail(d => { d.pages[0].nav = nav; }, "PAGE_FIELD");
  for (const order of [-1, 1.5, "3", null, 1000001, Infinity, NaN]) fail(d => { d.pages[0].nav = { order }; }, "PAGE_FIELD");
  for (const show_in_bar of ["false", 0, null, [], {}]) fail(d => { d.pages[0].nav = { show_in_bar }; }, "PAGE_FIELD");
});

test("libellé hero : 40 caractères Unicode admis, 41 refusés, accepté sans lien", () => {
  for (const linked of [true, false]) {
    const d = doc(); d.pages[0].sections[0].data.link_label = "🟢".repeat(40);
    if (!linked) delete d.pages[0].sections[0].data.link;
    const r = validateEnvelope(d, refs); assert.equal(r.ok, true);
    assert.equal(r.set.pages[0].sections[0].data.linkLabel, "🟢".repeat(40));
    assert.equal(r.set.pages[0].sections[0].data.link, linked ? "/demo" : undefined);
  }
  for (const link_label of ["a".repeat(41), "🟢".repeat(41), "", null, 42, "a\t", "a\u0085"]) fail(d => { d.pages[0].sections[0].data.link_label = link_label; }, "SECTION_FIELD");
});

test("alternatif text_image : vide décoratif, 150 caractères Unicode admis, 151 refusés", () => {
  for (const image_alt of ["", "a".repeat(150), "🟢".repeat(150)]) {
    const d = doc(); d.pages[0].sections[3].data.image_alt = image_alt;
    const r = validateEnvelope(d, refs); assert.equal(r.ok, true);
    assert.equal(r.set.pages[0].sections[3].data.imageAlt, image_alt);
  }
  for (const image_alt of ["a".repeat(151), "🟢".repeat(151), null, 42, "a\t", "a\u0085"]) fail(d => { d.pages[0].sections[3].data.image_alt = image_alt; }, "SECTION_FIELD");
});

test("0x0B (tabulation verticale) et 0x0C (saut de page) refusés partout ; LF 0x0A et CR 0x0D admis seulement en multiligne", () => {
  for (const control of ["\u000b", "\u000c", "\n", "\r"]) {
    for (const key of ["title", "seo_title", "seo_description"]) fail(d => { d.pages[0][key] = `Démo${control}`; }, "PAGE_FIELD");
    for (const [i, key] of [[0, "title"], [0, "link_label"], [3, "title"], [3, "image_alt"]]) fail(d => { d.pages[0].sections[i].data[key] = `Démo${control}`; }, "SECTION_FIELD");
    for (const i of [0, 3]) {
      if (control === "\u000b" || control === "\u000c") {
        fail(d => { d.pages[0].sections[i].data.text = `Démo${control}Suite`; }, "SECTION_FIELD");
      } else {
        const d = doc(); d.pages[0].sections[i].data.text = `Démo${control}Suite`;
        const r = validateEnvelope(d, refs); assert.equal(r.ok, true);
        assert.equal(r.set.pages[0].sections[i].data.text, "Démo\nSuite");
      }
    }
  }
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
    for (const text of [42, "a\u0000", "a\t", "a\u007f"] /* « a\r » n'est plus refusé : un formulaire HTML envoie « \r\n », constaté sur un export réel (voir le test dédié plus bas) */) fail(d => { d.pages[0].sections[i].data[key] = text; }, "SECTION_FIELD");
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

// Constat sur un export RÉEL de la Factory : le texte d'un champ saisi dans un formulaire arrive avec « \r\n ».
test("un retour chariot + saut de ligne est accepté dans un texte et normalisé en saut de ligne ; un autre contrôle reste refusé", async () => {
  const { validateEnvelope } = await import("../../lib/site-content/validate.ts");
  const refs = { categoryKeys: new Set(), familyKeys: new Set(), mediaShas: new Set() };
  const doc = (text) => ({ contract_version: "site_content.v1", generation: 1, publication_id: "11111111-1111-4111-8111-111111111111", catalogue_sequence: null, pages: [{ key: "22222222-2222-4222-8222-222222222222", slug: "/demo", title: "Démo", revision: 1, seo_title: "", seo_description: "", canonical: "", sections: [{ type: "hero", data: { title: "Titre", text } }] }] });
  const ok = validateEnvelope(doc("Ligne un\r\nLigne deux\rLigne trois"), refs);
  assert.equal(ok.ok, true);
  assert.equal(ok.set.pages[0].sections[0].data.text, "Ligne un\nLigne deux\nLigne trois");
  assert.equal(validateEnvelope(doc("Alerte\u0007"), refs).ok, false);
  assert.equal(validateEnvelope(doc("Tab\there"), refs).ok, false, "la tabulation n'est pas admise");
});
