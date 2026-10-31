// Modèle site_content.v1 : ordre reçu, aucun kind ni order ; données fictives uniquement.
import { test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { universeEntries, SLUG_RE, UNIVERSE_MAX } from "../../lib/site-content/pages.ts";

const sourceUrl = new URL("../../lib/site-content/source.ts", import.meta.url).href;
const stub = 'data:text/javascript,export async function catalogOrNull(){return null}';
const hooks = registerHooks({ resolve(specifier, context, next) {
  if (specifier === "@/lib/site-catalog/page" && context.parentURL === sourceUrl) return next(stub, context);
  if (context.parentURL?.includes("/lib/site-content/") && ["./pages", "./reader", "./validate"].includes(specifier)) return next(specifier + ".ts", context);
  return next(specifier, context);
} });
const { getPagesSource, loadUniverse } = await import(sourceUrl);
hooks.deregister();
const page = (slug, title = "Page démo") => ({ slug, title });

test("accueil exclu, segments métier et saisonniers conservés", () => {
  assert.deepEqual(universeEntries([page("/", "Accueil"), page("collectivites"), page("saison/noel_2026")]).map(p => p.slug), ["collectivites", "saison/noel_2026"]);
});
test("slugs invalides écartés, longueur sans / initial au plus 199", () => {
  const invalid = ["../x", "A", "", "/demo", "a//b", "a/", "a?b", "a#b", "a%2fb", "a\\b", "a\n", "a".repeat(200)];
  assert.deepEqual(universeEntries(invalid.map(slug => page(slug))), []);
  assert.ok(SLUG_RE.test("saison/noel_2026"));
  assert.equal(universeEntries([page("a".repeat(199))]).length, 1);
});
test("titres vides, contrôles et borne 200 ; titres retenus nettoyés", () => {
  assert.deepEqual(universeEntries([page("vide", ""), page("espaces", "   "), page("long", "a".repeat(201)), page("controle", "a\t")]), []);
  assert.equal(universeEntries([page("borne", "a".repeat(200))]).length, 1);
  assert.equal(universeEntries([page("unicode", "🟢".repeat(200))]).length, 1);
  assert.equal(universeEntries([page("nettoye", "  Page démo  ")])[0].title, "Page démo");
});
test("première occurrence valide gagne ; liste reçue jamais modifiée ni triée", () => {
  const first = page("commun", "Première");
  assert.deepEqual(universeEntries([first, page("commun", "Autre")]), [first]);
  assert.deepEqual(universeEntries([page("commun", ""), first]), [first]);
  const pages = Object.freeze([page("z"), page("a"), page("saison/noel")]);
  assert.deepEqual(universeEntries(pages), pages);
});
test("plafond huit entrées, appliqué après filtrage et dédoublonnage", () => {
  const pages = Array.from({ length: 12 }, (_, i) => page(`demo-${i}`));
  assert.equal(UNIVERSE_MAX, 8);
  assert.deepEqual(universeEntries([page("/"), pages[0], ...pages]).map(p => p.slug), pages.slice(0, 8).map(p => p.slug));
});
test("entrées mal formées écartées sans exception", () => {
  const malformed = [null, undefined, 42, "page", [], {}, { slug: "sans-titre" }, page(42), page("titre", 42)];
  assert.deepEqual(universeEntries([...malformed, page("valide")]), [page("valide")]);
});
test("liste vide ou mauvais type : liste vide", () => {
  for (const input of [[], null, undefined, 42, "pages", {}]) assert.deepEqual(universeEntries(input), []);
});
test("sans catalogue, source et univers vides", async () => {
  assert.deepEqual(await getPagesSource().listPublished(), []);
  assert.deepEqual(await loadUniverse(), []);
});
test("loadUniverse filtre la source et ne lève jamais", async () => {
  assert.deepEqual(await loadUniverse({ listPublished: async () => [page("/"), page("metier")] }), [page("metier")]);
  for (const source of [null, {}, { listPublished() { throw new Error("Démo"); } }, { listPublished: async () => { throw new Error("Démo"); } }]) assert.deepEqual(await loadUniverse(source), []);
});
