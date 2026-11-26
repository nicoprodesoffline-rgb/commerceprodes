// CA-6 a (cercle A, Owner A.9 ; EC, 26/11) — l'image d'une rubrique : celle choisie dans la Factory, sinon l'image principale de la première famille dans
// l'ordre de la rubrique (CA-5) qui en a une. La même règle pour la page de la rubrique et pour l'accueil. Jeu fictif.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { rubricImage } from "../../lib/site-catalog/rubric-image.ts";
import { orderRubric } from "./rubric-order-loader.mjs";

const NOW = "2026-06-10T10:00:00Z";
const fam = (slug, name, extra = {}) => ({ public_family_key: `PF-${slug}`, slug, name, primary_category_key: "bancs", secondary_category_keys: [], items: [], ...extra });
const ordered = (families) => orderRubric(families, "bancs", NOW, new Set());

test("l'image choisie à la main gagne (Q1 tranchée : le choix à la main l'emporte)", () => {
  const families = ordered([fam("a", "Armoire", { image_main_sha256: "a".repeat(64) })]);
  assert.deepEqual(rubricImage("c".repeat(64), families), { sha256: "c".repeat(64), source: "chosen" });
});

test("sinon : l'image de la PREMIÈRE famille dans l'ordre de la rubrique, pas dans l'ordre du catalogue", () => {
  const families = [
    fam("armoire", "Armoire", { image_main_sha256: "a".repeat(64) }),            // première dans le catalogue et par le nom
    fam("propre", "Zèbre", { own_range: true, image_main_sha256: "b".repeat(64) }), // gamme propre : première dans la rubrique
  ];
  assert.deepEqual(rubricImage(null, ordered(families)), { sha256: "b".repeat(64), source: "automatic" });
});

test("une famille sans image est passée : la suivante dans l'ordre donne la sienne", () => {
  const families = ordered([fam("propre", "Zèbre", { own_range: true }), fam("banc", "Banc", { image_main_sha256: "d".repeat(64) })]);
  assert.deepEqual(rubricImage(undefined, families), { sha256: "d".repeat(64), source: "automatic" });
});

test("aucune image choisie et aucune famille illustrée : pas d'image", () => {
  assert.equal(rubricImage(null, ordered([fam("banc", "Banc")])), null);
  assert.equal(rubricImage(null, []), null);
});

test("la page de la rubrique et l'accueil prennent l'image par la même fonction, sur les familles rangées par orderRubric", () => {
  for (const file of ["app/categorie/[key]/page.tsx", "app/page.tsx"]) {
    const source = readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
    assert.match(source, /rubricImage\(/, `${file} appelle rubricImage`);
    assert.match(source, /orderRubric\(/, `${file} range les familles dans l'ordre de la rubrique`);
  }
  const home = readFileSync(new URL("../../app/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(home, /catalog\.families\.find\(\(f\) => familySlugs\.has\(f\.slug\) && f\.image_main_sha256\)/, "plus de première famille du catalogue");
});
