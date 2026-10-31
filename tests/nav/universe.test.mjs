// Interface de lecture des pages publiées : données fictives, aucune base ni aucun serveur.
import { test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { universeEntries, SLUG_RE, UNIVERSE_MAX } from "../../lib/site-content/pages.ts";

// Node exige l'extension ; Next et TypeScript résolvent l'import relatif du module source.
const sourceUrl = new URL("../../lib/site-content/source.ts", import.meta.url).href;
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    return nextResolve(specifier === "./pages" && context.parentURL === sourceUrl ? "./pages.ts" : specifier, context);
  },
});
const { getPagesSource, loadUniverse } = await import(sourceUrl);
hooks.deregister();

const page = (slug, title = "Page de test", order = 0, kind = "business") => ({ slug, title, order, kind });

test("l'accueil est exclu ; les pages métier et saisonnières sont retenues", () => {
  assert.deepEqual(universeEntries([page("accueil", "Accueil", 0, "home"), page("metier"), page("saison", "Saison", 1, "seasonal")]).map((p) => p.slug), ["metier", "saison"]);
});

test("les slugs invalides sont écartés ; la limite est de 80 caractères", () => {
  const invalid = ["../x", "A", "", "a".repeat(81)];
  assert.deepEqual(universeEntries(invalid.map((slug) => page(slug))), []);
  assert.equal(SLUG_RE.source, "^[a-z0-9][a-z0-9-]{0,79}$");
  assert.equal(universeEntries([page("a".repeat(80))]).length, 1);
});

test("les titres vides ou trop longs sont écartés ; les titres retenus sont nettoyés", () => {
  assert.deepEqual(universeEntries([page("vide", ""), page("espaces", " \t "), page("long", "a".repeat(61))]), []);
  assert.equal(universeEntries([page("borne", "a".repeat(60))]).length, 1);
  assert.equal(universeEntries([page("nettoye", "  Page de test  ")])[0].title, "Page de test");
});

test("la première occurrence valide d'un slug gagne avant le tri", () => {
  const first = page("commun", "Première", 10);
  assert.deepEqual(universeEntries([first, page("commun", "Autre", -1, "seasonal")]), [first]);
  assert.deepEqual(universeEntries([page("commun", "", -1), first]), [first]);
});

test("le tri suit l'ordre puis le titre français, sans modifier la liste reçue", () => {
  const pages = Object.freeze([page("z", "Zèbre", 2), page("e", "École", 2), page("a", "Atelier", 2), page("premiere", "Zèbre", 1)]);
  assert.deepEqual(universeEntries(pages).map((p) => p.slug), ["premiere", "a", "e", "z"]);
  assert.deepEqual(pages.map((p) => p.slug), ["z", "e", "a", "premiere"]);
});

test("le plafond est de huit entrées, appliqué après le tri", () => {
  const pages = Array.from({ length: 12 }, (_, i) => page(`page-${i}`, `Page ${i}`, 11 - i));
  assert.equal(UNIVERSE_MAX, 8);
  assert.deepEqual(universeEntries(pages).map((p) => p.order), [0, 1, 2, 3, 4, 5, 6, 7]);
});

test("les entrées de mauvais type sont écartées sans exception", () => {
  const malformed = [null, undefined, 42, "page", [], {}, { slug: "sans-titre", kind: "business", order: 0 },
    page(42), page("titre", 42), page("ordre", "Page", "1"), page("nan", "Page", NaN),
    page("infini", "Page", Infinity), page("genre", "Page", 0, "unknown")];
  assert.deepEqual(universeEntries([...malformed, page("valide")]), [page("valide")]);
});

test("une liste vide ou de mauvais type donne une liste vide", () => {
  for (const input of [[], null, undefined, 42, "pages", {}]) assert.deepEqual(universeEntries(input), []);
});

test("la source par défaut ne publie aucune page", async () => {
  assert.deepEqual(await getPagesSource().listPublished(), []);
  assert.deepEqual(await loadUniverse(getPagesSource()), []);
});

test("loadUniverse filtre les pages de la source", async () => {
  assert.deepEqual(await loadUniverse({ listPublished: async () => [page("accueil", "Accueil", 0, "home"), page("metier")] }), [page("metier")]);
});

test("une source qui lève une erreur donne une liste vide", async () => {
  assert.deepEqual(await loadUniverse({ listPublished() { throw new Error("Source indisponible"); } }), []);
  assert.deepEqual(await loadUniverse({ listPublished: async () => { throw new Error("Source indisponible"); } }), []);
});
