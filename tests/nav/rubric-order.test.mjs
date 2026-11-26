// CA-5 (cercle A, Owner A.4-d1 et A.4-d2) — l'ordre des familles d'une rubrique, à l'affichage. Jeu fictif ; règle : docs/contracts/c0_site_v2.md §3.3.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { novelFamilies } from "../../lib/site-catalog/merchandising.ts";

// La règle est celle du contrat (c0v2/ts/src/rubric.ts, jumeau du Python, jeux d'essai V2_RUBRIC) : ces tests prouvent le SITE, qui dit au contrat ce qui est
// en promotion et nouveau à l'instant servi et rend ses familles dans l'ordre du contrat.
import { orderRubric } from "./rubric-order-loader.mjs";

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

test("dans un groupe : le rangement à la main de CETTE rubrique d'abord, puis le nom en français sans accents ni majuscules", () => {
  const families = [
    fam("e", "Étagère"), fam("b", "banc"), fam("a", "Armoire"),
    fam("m1", "Zèbre", { category_positions: [{ category_key: "bancs", position: 2 }] }),
    fam("m2", "Yucca", { category_positions: [{ category_key: "bancs", position: 1 }] }),
    fam("ailleurs", "Aaa", { category_positions: [{ category_key: "tables", position: 1 }] }),
  ];
  assert.deepEqual(order(families), ["m2", "m1", "ailleurs", "a", "b", "e"]);
});

test("réponse de l'Owner du 27/11 : une famille rangée à la main dans CETTE rubrique passe avant tout, même devant la gamme propre et les promotions", () => {
  const at = (position) => ({ category_positions: [{ category_key: "bancs", position }] });
  const families = [
    fam("propre", "Banc propre", { own_range: true }),
    fam("promo", "Banc promo", withPromo()),
    fam("nouveau", "Banc nouveau", { first_published_at_utc: "2026-06-05T00:00:00Z" }),
    fam("reste-2", "Zèbre", at(2)),
    fam("reste-1", "Yucca", at(1)),
    fam("promo-3", "Banc promo placé", withPromo(at(3))),
    fam("propre-4", "Banc propre placé", { own_range: true, ...at(4) }),
  ];
  assert.deepEqual(order(families), ["reste-1", "reste-2", "promo-3", "propre-4", "propre", "promo", "nouveau"]);
});

test("une place dans une AUTRE rubrique ne compte pas : la famille reste dans son groupe", () => {
  const families = [fam("reste", "Aaa"), fam("promo", "Zzz", withPromo({ category_positions: [{ category_key: "tables", position: 1 }] }))];
  assert.deepEqual(order(families), ["promo", "reste"]);
});

test("une nouveauté placée à la main qui expire garde sa place : la règle ne la range pas", () => {
  const families = [fam("a", "Armoire"), fam("n", "Zèbre", { first_published_at_utc: "2026-01-01T00:00:00Z", category_positions: [{ category_key: "bancs", position: 1 }] })];
  assert.deepEqual(order(families), ["n", "a"]);
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

test("catalogue v1 (aucune famille propre, aucune date) : l'ordre est alphabétique, sans erreur ; départage final par la clé publique, jamais par l'adresse", () => {
  assert.deepEqual(order([fam("a", "Banc", { public_family_key: "PF-2" }), fam("c", "Banc", { public_family_key: "PF-1" })]), ["c", "a"]);
  assert.deepEqual(order([fam("b", "Banc 10"), fam("a", "Banc 2")]), ["b", "a"], "ordre des lettres, sans ordre numérique : le contrat n'en dit pas");
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

test("own_range absent (Factory pas encore à jour) : le jeu commun l'accepte, la famille est rangée comme non gamme propre, jamais refusée ni inventée", () => {
  const doc = JSON.parse(readFileSync(new URL("../../c0v2/fixtures/documents/V2_CATALOGUE/snapshot_v2_own_range_absent.json", import.meta.url), "utf8"));
  const absent = doc.families.filter((f) => !("own_range" in f));
  assert.ok(absent.length >= 1, "le jeu porte une famille sans own_range");
  for (const f of absent) assert.equal(orderRubric([fam(f.slug, f.name, { public_family_key: f.public_family_key }), fam("propre", "Zzz", { own_range: true })], "bancs", NOW, new Set())[1].slug, f.slug, "sans own_range, la famille passe après la gamme propre : rangée comme non gamme propre");
  const reader = readFileSync(new URL("../../lib/site-catalog/catalog.ts", import.meta.url), "utf8");
  assert.doesNotMatch(reader, /out\.own_range = (?!f\["own_range"\])/, "aucune valeur par défaut posée par le lecteur");
});

test("le site n'écrit aucune règle d'ordre : il appelle celle du contrat (pas de comparaison de noms ni de groupes dans la fonction du site)", () => {
  const source = readFileSync(new URL("../../lib/site-catalog/rubric-order.ts", import.meta.url), "utf8");
  assert.match(source, /from "\.\.\/\.\.\/c0v2\/ts\/src\/rubric"/);
  assert.doesNotMatch(source, /Collator|localeCompare|\.sort\(/);
});

test("promotions et nouveautés sont passées au contrat par leur clé publique, à l'instant servi (une promotion finie ne compte plus)", () => {
  const families = [fam("a", "Armoire"), fam("p", "Zèbre", withPromo()), fam("fin", "Yucca", { items: [{ windows: [{ ...promoWindow, valid_until_utc: "2026-06-05T00:00:00Z" }] }] })];
  assert.deepEqual(order(families), ["p", "a", "fin"]);
  assert.deepEqual(orderRubric(families, "bancs", "2026-06-04T00:00:00Z", new Set()).map((f) => f.slug), ["fin", "p", "a"]);
});
