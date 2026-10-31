// S1-A I2 — listes du catalogue : montants lus en centimes entiers, filtre de prix, tri, pages, requête d'adresse. Fonctions pures, aucune base.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cents, centsFromInput, listFamilies, parseListingQuery, PAGE_SIZE } from "../../lib/site-catalog/listing.ts";

const fam = (slug, name) => ({ slug, name, items: [] });
const priced = { a: "12.50", b: "7.00", c: "1234.05", d: null };
const priceOf = (f) => (priced[f.slug] ? { amount: priced[f.slug], basis: "HT" } : null);
const FAMILIES = [fam("a", "Banc"), fam("b", "Armoire"), fam("c", "Table"), fam("d", "Chaise")];
const q = (sp) => parseListingQuery(sp);

test("les montants sont lus en centimes entiers, sans flottant", () => {
  assert.equal(cents("12.50"), 1250n);
  assert.equal(cents("1234.05"), 123405n);
  assert.equal(cents("12.5"), null);
  assert.equal(centsFromInput("12"), 1200n);
  assert.equal(centsFromInput("12,5"), 1250n);
  assert.equal(centsFromInput("12.05"), 1205n);
  assert.equal(centsFromInput("douze"), null);
  assert.equal(centsFromInput("1,234"), null);
});

test("une saisie de prix refusée est dite, jamais corrigée en silence", () => {
  const query = q({ prix_min: "abc", prix_max: "20" });
  assert.equal(query.min, null);
  assert.equal(query.max, 2000n);
  assert.equal(query.ignored.length, 1);
});

test("le filtre de prix retire les familles hors fourchette ET celles sans prix", () => {
  const out = listFamilies(FAMILIES, q({ prix_min: "10", prix_max: "20" }), priceOf);
  assert.deepEqual(out.rows.map((r) => r.family.slug), ["a"]);
  assert.equal(out.filtered, true);
  assert.equal(out.total, 1);
});

test("le tri par prix met les familles sans prix en dernier, dans les deux sens", () => {
  assert.deepEqual(listFamilies(FAMILIES, q({ tri: "prix-croissant" }), priceOf).rows.map((r) => r.family.slug), ["b", "a", "c", "d"]);
  assert.deepEqual(listFamilies(FAMILIES, q({ tri: "prix-decroissant" }), priceOf).rows.map((r) => r.family.slug), ["c", "a", "b", "d"]);
});

test("le tri par nom suit l'ordre français, la pertinence garde l'ordre reçu, un tri inconnu retombe sur la pertinence", () => {
  assert.deepEqual(listFamilies(FAMILIES, q({ tri: "nom" }), priceOf).rows.map((r) => r.family.slug), ["b", "a", "d", "c"]);
  assert.deepEqual(listFamilies(FAMILIES, q({}), priceOf).rows.map((r) => r.family.slug), ["a", "b", "c", "d"]);
  assert.equal(q({ tri: "n-importe-quoi" }).sort, "pertinence");
});

test("les pages : taille fixe, page hors bornes ramenée à la dernière, prix lu seulement pour la page affichée sans filtre ni tri de prix", () => {
  const many = Array.from({ length: PAGE_SIZE * 2 + 3 }, (_, i) => fam(`f${i}`, `Famille ${i}`));
  let reads = 0;
  const counting = () => { reads += 1; return null; };
  const first = listFamilies(many, q({}), counting);
  assert.equal(first.pages, 3);
  assert.equal(first.rows.length, PAGE_SIZE);
  assert.equal(reads, PAGE_SIZE);
  const last = listFamilies(many, q({ page: "99" }), () => null);
  assert.equal(last.page, 3);
  assert.equal(last.rows.length, 3);
});
