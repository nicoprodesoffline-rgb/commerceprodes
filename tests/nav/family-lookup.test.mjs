// S1-A I3 — lecture de Familles par adresse : slugs validés, dédoublonnés, bornés à 20 ; inconnus rendus à part ; « meilleur prix » posé par le serveur. Fonction pure.
import { test } from "node:test";
import assert from "node:assert/strict";
import { lookUp, parseSlugs, LOOKUP_MAX } from "../../lib/site-catalog/family-lookup.ts";

const fam = (slug, items = 1) => ({ slug, name: slug.toUpperCase(), description_short: "d", image_main_sha256: "", axes: [{ label: "Longueur" }], items: Array.from({ length: items }, (_, i) => ({ public_item_key: `PI-${slug}${i}` })) });
const DB = { a: fam("a"), b: fam("b", 2), c: fam("c") };
const prices = { a: "12.50", b: "7.00", c: "7.00" };
const run = (slugs) => lookUp(slugs, (s) => DB[s] ?? null, (f) => (prices[f.slug] ? { amount: prices[f.slug], basis: "HT" } : null), (p) => (p ? p.amount : "Sur devis"), () => "Cat");

test("les slugs invalides sont écartés, les doublons retirés, la liste bornée à 20", () => {
  assert.deepEqual(parseSlugs("a,b,a, c ,../x,UPPER,,bad slug"), ["a", "b", "c"]);
  assert.deepEqual(parseSlugs(null), []);
  assert.equal(parseSlugs(Array.from({ length: 50 }, (_, i) => `s${i}`).join(",")).length, LOOKUP_MAX);
  assert.deepEqual(parseSlugs("a".repeat(121)), []);
});

test("l'ordre demandé est gardé et un slug inconnu est rendu à part (jamais une erreur)", () => {
  const out = run(["c", "zzz", "a"]);
  assert.deepEqual(out.found.map((f) => f.slug), ["c", "a"]);
  assert.deepEqual(out.missing, ["zzz"]);
});

test("« meilleur prix » : posé par le serveur, seulement s'il y a au moins 2 prix, ex æquo tous marqués", () => {
  const out = run(["a", "b", "c"]);
  assert.deepEqual(out.found.map((f) => f.best), [false, true, true]);
  assert.equal(run(["a"]).found[0].best, false);
  assert.equal(run(["a", "zzz"]).found[0].best, false);
});

test("référence seulement pour une famille à une variante ; le nombre de variantes et les axes sont rendus", () => {
  const out = run(["a", "b"]);
  assert.equal(out.found[0].reference, "PI-a0");
  assert.equal(out.found[1].reference, null);
  assert.equal(out.found[1].variantCount, 2);
  assert.deepEqual(out.found[0].axes, ["Longueur"]);
});
