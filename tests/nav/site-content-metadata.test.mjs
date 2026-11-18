import { test } from "node:test";
import assert from "node:assert/strict";
import { editorialMetadata } from "../../lib/site-content/metadata.ts";
import { editorialSlug } from "../../lib/site-content/pages.ts";

test("segments décodés puis validés, sans segment vide ni séparateur injecté", () => {
  assert.equal(editorialSlug(["saison", "no%65l_2026"]), "/saison/noel_2026");
  assert.equal(editorialSlug(["a".repeat(199)]).length, 200);
  for (const segments of [[], undefined, [""], [".."], ["A"], ["a\n"], ["a/b"], ["a%2fb"], ["%252f"], ["%"], ["a?b"], [42], ["a".repeat(200)]]) assert.equal(editorialSlug(segments), null);
});
test("métadonnées : titre SEO puis titre de page ; description seulement si renseignée", () => {
  const page = { title: "Démo", seo_title: "", seo_description: "", canonical: "" };
  assert.deepEqual(editorialMetadata(page, undefined), { title: "Démo" });
  assert.deepEqual(editorialMetadata({ ...page, seo_title: "SEO démo", seo_description: "Description démo" }, undefined), { title: "SEO démo", description: "Description démo" });
});
test("canonique seulement avec chemin renseigné et origine HTTP(S) valide", () => {
  const page = { title: "Démo", seo_title: "", seo_description: "", canonical: "/saison/noel" };
  for (const origin of [undefined, "", "invalid", "ftp://demo.invalid", "https://demo.invalid/path", "https://user:demo@demo.invalid", "https://demo.invalid?x=1", "https://demo.invalid#demo"]) assert.equal(editorialMetadata(page, origin).alternates, undefined);
  assert.deepEqual(editorialMetadata(page, "https://demo.invalid/").alternates, { canonical: "https://demo.invalid/saison/noel" });
  assert.deepEqual(editorialMetadata({ ...page, canonical: "/" }, "http://demo.invalid:1234").alternates, { canonical: "http://demo.invalid:1234/" });
  assert.equal(editorialMetadata({ ...page, canonical: "" }, "https://demo.invalid").alternates, undefined);
  assert.equal(editorialMetadata(page, "https://demo.invalid").robots, undefined);
});
