// Cercle 3, paquet B (M01–M07, N01–N06, C01/C02, D01/D03) — promotions, nouveautés, caractéristiques cherchées, liens PDF. Fonctions pures, jeu fictif F1…F4.
import { test } from "node:test";
import assert from "node:assert/strict";
import { characteristicsText, documentLinks, economy, isPromoNow, mirrorSections, novelFamilies, promoFamilies } from "../../lib/site-catalog/merchandising.ts";
import { buildNavigation } from "../../lib/site-catalog/navigation.ts";
import { parseShop } from "../../lib/site-shop/settings.ts";

const NOW = "2026-11-17T10:00:00Z";
const window = (nature, extra = {}) => ({ rate_id: "r", valid_from_utc: "2026-11-01T00:00:00Z", valid_until_utc: null, quantity_min: 1, quantity_max: null, unit_amount: "10.00", currency: "EUR", tax_basis_or_status: "HT", offer_price_version_public: "v", price_nature: nature, reference_unit_amount: null, ...extra });
const family = (slug, primary, windows, extra = {}) => ({ public_family_key: `PF-${slug}`, slug, name: slug, primary_category_key: primary, secondary_category_keys: [], items: [{ public_item_key: `PI-${slug}`, windows, variant_axes: {} }], ...extra });
const F1 = family("f1", "bancs", [window("PROMOTION")], { characteristics: [{ label: "Matière", value: "acier galvanisé" }, { label: "Places", value: "6" }], documents: [{ label: "Fiche technique", kind: "TECHNICAL_SHEET", sha256: "a".repeat(64), mime: "application/pdf", size: 2000000 }], first_published_at_utc: "2026-11-16T10:00:00Z" });
const F2 = family("f2", "bancs", [window(null)], { first_published_at_utc: "2025-11-16T10:00:00Z" });
const F3 = family("f3", "bancs", [window(null)]);
const F4 = family("f4", "tables", [window("BASE", { unit_amount: "30.00", reference_unit_amount: "40.00", valid_until_utc: "2026-12-31T00:00:00Z" })], { first_published_at_utc: "2026-10-01T10:00:00Z" });
const ALL = [F1, F2, F3, F4];

test("M01/M06 : F1 en promotion ; une promotion terminée ou à venir n'en est plus une", () => {
  assert.equal(isPromoNow(F1, NOW), true);
  assert.equal(isPromoNow(F2, NOW), false);
  assert.equal(isPromoNow(family("x", "bancs", [window("PROMOTION", { valid_until_utc: "2026-11-10T00:00:00Z" })]), NOW), false);
  assert.equal(isPromoNow(family("y", "bancs", [window("PROMOTION", { valid_from_utc: "2026-12-01T00:00:00Z" })]), NOW), false);
  assert.deepEqual(promoFamilies(ALL, NOW).map((f) => f.slug), ["f1", "f4"]);
});

test("M02 : l'économie est la différence entre le prix barré fourni et le prix du lot ; jamais un prix barré inventé", () => {
  assert.equal(economy("40.00", "30.00"), "10.00");
  assert.equal(economy("30.00", "30.00"), null);
  assert.equal(economy("29.99", "30.00"), null);
});

test("M04 : l'univers Promotions reflète les rubriques ; une rubrique sans promotion n'y figure pas", () => {
  const nav = buildNavigation(
    [{ category_key: "bancs", name: "Bancs", parent_category_key: null }, { category_key: "tables", name: "Tables", parent_category_key: null }, { category_key: "corbeilles", name: "Corbeilles", parent_category_key: null }],
    ALL,
  );
  const sections = mirrorSections(nav.menu, promoFamilies(ALL, NOW), (key) => nav.anchor(key));
  assert.deepEqual(sections.map((s) => [s.key, s.families.map((f) => f.slug)]), [["bancs", ["f1"]], ["tables", ["f4"]]]);
});

test("M07 : aucune promotion en cours, aucune famille retenue (l'entrée de menu disparaît)", () => {
  assert.deepEqual(promoFamilies([F2, F3], NOW), []);
});

test("N01/N02 : seule compte la première arrivée sur le SITE ; une famille sans date n'est pas une nouveauté", () => {
  const slugs = novelFamilies(ALL, NOW, 60, 24).map((f) => f.slug);
  assert.deepEqual(slugs, ["f1", "f4"], "F2 date d'il y a un an, F3 sans date");
  assert.deepEqual(novelFamilies([F2], "2026-11-17T10:00:00Z", 400, 24).map((f) => f.slug), ["f2"], "dans une période assez longue, F2 compte");
});

test("N04/N05 : au plus N familles, les plus récemment arrivées, toutes dans la période", () => {
  const three = [F1, F4, family("f6", "bancs", [window(null)], { first_published_at_utc: "2026-11-05T10:00:00Z" })];
  assert.deepEqual(novelFamilies(three, NOW, 60, 2).map((f) => f.slug), ["f1", "f6"]);
  assert.deepEqual(novelFamilies(three, NOW, 30, 24).map((f) => f.slug), ["f1", "f6"], "F4 a plus de 30 jours");
});

test("N06 : aucune famille dans la période : liste vide", () => {
  assert.deepEqual(novelFamilies([F2, F3], NOW, 60, 24), []);
});

test("C02 : les caractéristiques se cherchent (texte de recherche), la valeur « galvanisé » ne figure ni dans le nom ni dans la description", () => {
  assert.match(characteristicsText(F1).toLowerCase(), /galvanis/);
  assert.equal(characteristicsText(F2), "");
});

test("D01/D03 : le PDF rattaché donne un lien de téléchargement ; sans document, aucun lien", () => {
  assert.deepEqual(documentLinks(F1), [{ label: "Fiche technique", href: `/media/${"a".repeat(64)}` }]);
  assert.deepEqual(documentLinks(F2), []);
});

test("N04 : les réglages de la boutique portent la durée et le nombre, 60 et 24 à défaut ou si invalides", () => {
  assert.deepEqual([parseShop(null).noveltyDays, parseShop(null).noveltyCount], [60, 24]);
  const set = parseShop({ shop: { novelty_days: 30, novelty_count: 2 } });
  assert.deepEqual([set.noveltyDays, set.noveltyCount], [30, 2]);
  const bad = parseShop({ shop: { novelty_days: 0, novelty_count: "x" } });
  assert.deepEqual([bad.noveltyDays, bad.noveltyCount], [60, 24]);
});

test("M02 : un prix barré fourni fait une promotion même sur une fenêtre BASE (contrat v2 du paquet A) ; sans prix barré ni nature PROMOTION, non", () => {
  assert.equal(isPromoNow(F4, NOW), true, "F4 : BASE + prix barré 40.00");
  assert.equal(isPromoNow(family("z", "bancs", [window("BASE")]), NOW), false);
});

test("C01/C02 : une caractéristique peut contenir < ou & : elle ne sert qu'à la recherche, jamais rendue (ni en HTML brut, ni en extrait)", async () => {
  const { readFileSync } = await import("node:fs");
  const f = family("h", "bancs", [window(null)], { characteristics: [{ label: "A<b>", value: "x & <script>alert(1)</script> galvanisé" }] });
  assert.match(characteristicsText(f), /galvanis/);
  for (const file of ["app/api/site/search/route.ts", "app/recherche/page.tsx", "lib/site-catalog/suggest.ts", "app/famille/[slug]/page.tsx"]) {
    assert.doesNotMatch(readFileSync(new URL(`../../${file}`, import.meta.url), "utf8"), /characteristicsText|\.characteristics/, `${file} n'affiche aucune caractéristique`);
  }
});
