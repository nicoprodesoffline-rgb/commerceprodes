// CA-5 (cercle A, Owner A.4-d1 et A.4-d2) — l'ordre des familles d'une rubrique, à l'affichage. Jeu fictif ; règle : docs/contracts/c0_site_v2.md §3.3.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { orderRubric, groupOf, GROUP_OWN, GROUP_PROMO, GROUP_NOVELTY, GROUP_REST } from "../../lib/site-catalog/rubric-order.ts";
import { novelFamilies } from "../../lib/site-catalog/merchandising.ts";

const NOW = "2026-06-10T10:00:00Z";
const promoWindow = { valid_from_utc: "2026-06-01T00:00:00Z", valid_until_utc: null, price_nature: "PROMOTION" };
const fam = (slug, name, extra = {}) => ({ public_family_key: `PF-${slug}`, slug, name, primary_category_key: "bancs", secondary_category_keys: [], items: [], ...extra });
const withPromo = (extra = {}) => ({ items: [{ windows: [promoWindow] }], ...extra });
const order = (families, noveltyDays = 60) => orderRubric(families, "bancs", NOW, new Set(novelFamilies(families, NOW, noveltyDays, 24).map((f) => f.slug))).map((f) => f.slug);

test("A.4-d1 : gamme propre, puis promotions, puis nouveautés, puis le reste", () => {
  const families = [
    fam("reste", "Banc zéro"),
    fam("nouveau", "Banc nouveau", { first_published_at_utc: "2026-06-05T00:00:00Z" }),
    fam("promo", "Banc promo", withPromo()),
    fam("propre", "Banc propre", { own_range: true }),
  ];
  assert.deepEqual(order(families), ["propre", "promo", "nouveau", "reste"]);
});

test("une famille est dans le premier groupe auquel elle appartient (propre et en promotion = propre ; promotion et nouveauté = promotion)", () => {
  const noveltySlugs = new Set(["a", "b"]);
  assert.equal(groupOf(fam("a", "A", withPromo({ own_range: true })), NOW, noveltySlugs), GROUP_OWN);
  assert.equal(groupOf(fam("b", "B", withPromo()), NOW, noveltySlugs), GROUP_PROMO);
  assert.equal(groupOf(fam("a", "A"), NOW, noveltySlugs), GROUP_NOVELTY);
  assert.equal(groupOf(fam("z", "Z"), NOW, noveltySlugs), GROUP_REST);
});

test("dans un groupe : le rangement à la main de CETTE rubrique d'abord, puis le nom en français sans accents ni majuscules", () => {
  const families = [
    fam("e", "Étagère"), fam("b", "banc"), fam("a", "Armoire"),
    fam("m1", "Zèbre", { category_positions: [{ category_key: "bancs", position: 2 }] }),
    fam("m2", "Yucca", { category_positions: [{ category_key: "bancs", position: 1 }] }),
    fam("ailleurs", "Aaa", { category_positions: [{ category_key: "tables", position: 1 }] }),
  ];
  assert.deepEqual(order(families), ["m2", "m1", "ailleurs", "a", "b", "e"]);
});

test("une nouveauté sans place : la plus récente d'abord ; une nouveauté placée à la main passe avant", () => {
  const families = [
    fam("vieille", "A", { first_published_at_utc: "2026-05-01T00:00:00Z" }),
    fam("recente", "Z", { first_published_at_utc: "2026-06-08T00:00:00Z" }),
    fam("placee", "M", { first_published_at_utc: "2026-05-20T00:00:00Z", category_positions: [{ category_key: "bancs", position: 1 }] }),
  ];
  assert.deepEqual(order(families), ["placee", "recente", "vieille"]);
});

test("A.4-d2 : une nouveauté qui expire quitte la tête et reprend sa place alphabétique dans le reste", () => {
  const families = [fam("zebre", "Zèbre"), fam("ancienne", "Armoire", { first_published_at_utc: "2026-06-05T00:00:00Z" }), fam("banc", "Banc")];
  assert.deepEqual(order(families, 60), ["ancienne", "banc", "zebre"], "encore nouveauté");
  assert.deepEqual(order(families, 2), ["ancienne", "banc", "zebre"], "plus nouveauté : première par son nom, pas reléguée en bas");
  assert.deepEqual(order([fam("zebre", "Zèbre"), fam("ancienne", "Cuve", { first_published_at_utc: "2026-06-05T00:00:00Z" }), fam("banc", "Banc")], 2), ["banc", "ancienne", "zebre"]);
});

test("une promotion qui n'a pas commencé ou qui est finie ne compte pas (instant servi)", () => {
  const future = { items: [{ windows: [{ valid_from_utc: "2026-07-01T00:00:00Z", valid_until_utc: null, price_nature: "PROMOTION" }] }] };
  const over = { items: [{ windows: [{ valid_from_utc: "2026-05-01T00:00:00Z", valid_until_utc: "2026-06-01T00:00:00Z", price_nature: "PROMOTION" }] }] };
  assert.deepEqual(order([fam("b", "B"), fam("futur", "Z", future), fam("fini", "Y", over)]), ["b", "fini", "futur"]);
});

test("catalogue v1 (aucune famille propre, aucune date) : l'ordre est alphabétique, sans erreur ; départage final par l'adresse", () => {
  assert.deepEqual(order([fam("c", "Banc"), fam("a", "Banc")]), ["a", "c"]);
});

test("le lecteur garde own_range tel quel (jamais inventé) et la page de rubrique range par orderRubric", () => {
  const reader = readFileSync(new URL("../../lib/site-catalog/catalog.ts", import.meta.url), "utf8");
  assert.match(reader, /typeof f\["own_range"\] === "boolean"\) out\.own_range = f\["own_range"\];/);
  const page = readFileSync(new URL("../../app/categorie/[key]/page.tsx", import.meta.url), "utf8");
  assert.match(page, /const allFamilies = orderRubric\(/);
});

test("sur le jeu C0 v2 commun écrit par la Factory, chaque famille porte own_range et le lecteur la garde", () => {
  const doc = JSON.parse(readFileSync(new URL("../../c0v2/fixtures/documents/V2_CATALOGUE/snapshot_v2_ready.json", import.meta.url), "utf8"));
  assert.ok(doc.families.length >= 2);
  for (const f of doc.families) assert.equal(typeof f.own_range, "boolean", f.public_family_key);
  assert.ok(doc.families.some((f) => f.own_range === true) && doc.families.some((f) => f.own_range === false), "le jeu porte les deux cas");
});
