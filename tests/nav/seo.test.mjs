// Cercle 3, ligne 3.19 (S09–S12) : plan du site, robots, canonique et données structurées. Fonctions pures, données fictives.
import { test } from "node:test";
import assert from "node:assert/strict";
import { familyByOldAddress, homeJsonLd, jsonLdText, productJsonLd, publicOrigin, robotsDirective, robotsFile, sitemapUrls } from "../../lib/seo/seo.ts";

const ORIGIN = "https://recette.exemple.invalid";
const categories = [
  { category_key: "bancs", parent_category_key: null },
  { category_key: "tables", parent_category_key: null, hidden: true },
  { category_key: "corbeilles", parent_category_key: null },
];
const families = [
  { slug: "banc-essai-un", primary_category_key: "bancs", secondary_category_keys: [] },
  { slug: "table-essai-quatre", primary_category_key: "tables", secondary_category_keys: [] },
];

test("S10 : fermé par défaut, ouvert seulement par le réglage exact, sans changement de code", () => {
  for (const value of [undefined, "", "closed", "OPEN", "yes"]) {
    assert.deepEqual(robotsDirective({ SITE_SEARCH_ENGINES: value }), { index: false, follow: false });
    assert.deepEqual(robotsFile({ SITE_SEARCH_ENGINES: value, SITE_PUBLIC_ORIGIN: ORIGIN }), { rules: { userAgent: "*", disallow: "/" } });
  }
  assert.deepEqual(robotsDirective({ SITE_SEARCH_ENGINES: "open" }), { index: true, follow: true });
  const open = robotsFile({ SITE_SEARCH_ENGINES: "open", SITE_PUBLIC_ORIGIN: ORIGIN });
  assert.equal(open.sitemap, `${ORIGIN}/sitemap.xml`);
  assert.ok(open.rules.disallow.includes("/panier"));
});

test("S09 : l'accueil, les rubriques non vides et non masquées, les familles et les pages ; ni R-C vide, ni le panier", () => {
  const urls = sitemapUrls(ORIGIN, categories, families, [{ slug: "/" }, { slug: "/faq" }]);
  assert.deepEqual(urls, [`${ORIGIN}/`, `${ORIGIN}/categorie/bancs`, `${ORIGIN}/famille/banc-essai-un`, `${ORIGIN}/famille/table-essai-quatre`, `${ORIGIN}/p/faq`]);
  assert.ok(!urls.some((url) => url.includes("corbeilles")), "R-C vide");
  assert.ok(!urls.some((url) => url.includes("/categorie/tables")), "B04 : rubrique masquée absente du plan ; ses familles restent servies");
  assert.deepEqual(sitemapUrls(null, categories, families, []), [], "sans origine publique, aucune adresse inventée");
});

test("une origine invalide ne donne jamais d'adresse canonique", () => {
  for (const value of [undefined, "", "invalid", "ftp://x.invalid", "https://x.invalid/path", "https://u:p@x.invalid", " https://x.invalid"]) assert.equal(publicOrigin(value), null);
  assert.equal(publicOrigin("https://x.invalid/"), "https://x.invalid");
});

test("S11 : Produit avec nom, image, prix HT de la première tranche et devise ; fil d'Ariane", () => {
  const [product, crumbs] = productJsonLd({ origin: ORIGIN, name: "Banc Essai Un", slug: "banc-essai-un", description: "Banc d'essai.", imageSha256: "ab".repeat(32), price: "120.00", taxBasis: "HT",
    crumbs: [{ label: "Accueil", href: "/" }, { label: "Bancs", href: "/categorie/bancs" }, { label: "Banc Essai Un" }] });
  assert.equal(product["@type"], "Product");
  assert.equal(product.image, `${ORIGIN}/media/${"ab".repeat(32)}`);
  assert.deepEqual([product.offers.price, product.offers.priceCurrency, product.offers.priceSpecification.valueAddedTaxIncluded], ["120.00", "EUR", false]);
  assert.equal(crumbs["@type"], "BreadcrumbList");
  assert.deepEqual(crumbs.itemListElement.map((entry) => entry.position), [1, 2, 3]);
  assert.equal(crumbs.itemListElement[1].item, `${ORIGIN}/categorie/bancs`);
});

test("S12 : Organisation tirée des réglages de la boutique et Recherche du site", () => {
  const [organization, website] = homeJsonLd(ORIGIN, { phone: "+33 1 00 00 00 00", email: "contact@exemple.invalid", address: null });
  assert.deepEqual([organization.telephone, organization.email, organization.address], ["+33 1 00 00 00 00", "contact@exemple.invalid", undefined]);
  assert.equal(website.potentialAction.target, `${ORIGIN}/recherche?q={search_term_string}`);
});

test("E03 : un texte des réglages ne ferme jamais la balise de script", () => {
  const text = jsonLdText({ name: "</script><script>alert(1)</script>" });
  assert.ok(!text.includes("<") && !text.includes(">"));
  assert.deepEqual(JSON.parse(text), { name: "</script><script>alert(1)</script>" });
});

test("une base de taxe non qualifiée n'est jamais déclarée hors taxes", () => {
  const [product] = productJsonLd({ origin: null, name: "Banc", slug: "banc", description: "Banc.", imageSha256: null, price: "10.00", taxBasis: "UNQUALIFIED", crumbs: [] });
  assert.equal(product.offers.priceSpecification, undefined);
  assert.equal(product.url, undefined, "sans origine publique, aucune adresse absolue");
});

test("S06, S07 : une ancienne adresse désigne sa famille ; une adresse inconnue, aucune", () => {
  const list = [{ slug: "banc-c", slug_aliases: ["banc-a", "banc-b"] }, { slug: "table-x" }];
  assert.equal(familyByOldAddress(list, "banc-a").slug, "banc-c");
  assert.equal(familyByOldAddress(list, "banc-b").slug, "banc-c", "deux changements : un seul saut vers la dernière");
  assert.equal(familyByOldAddress(list, "inconnue"), null);
});
