// Cercle 3, ligne 3.19 (S09–S11) sur `next start` (sans navigateur) : robots.txt, plan du site, canonique, données Produit.
//   npm run test:nav   (construit l'application ; ce fichier est lancé avec les autres recettes HTTP de navigation)
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { removeNavFixtures, writeNavFixtures } from "./nav-fixtures.mjs";
import { get, withServer } from "./nav-server.mjs";

before(() => writeNavFixtures());
after(() => removeNavFixtures());

const ORIGIN = "https://recette.exemple.invalid";
const jsonLd = (html) => [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].flatMap((m) => [JSON.parse(m[1])].flat());

describe("3.19 référencement", () => {
  test("S10 : fermé par défaut — robots.txt interdit tout, chaque page dit noindex", async () => {
    await withServer("F_NAV_L4", async () => {
      const robots = await get("/robots.txt");
      assert.equal(robots.status, 200);
      assert.match(robots.text, /Disallow: \/\s*$/m);
      assert.doesNotMatch(robots.text, /Sitemap:/);
      assert.match((await get("/famille/famille-full-1")).text, /<meta name="robots" content="noindex, nofollow"/);
    }, { env: { SITE_PUBLIC_ORIGIN: ORIGIN } });
  });

  test("S09, S10 : ouvert par le réglage, sans changement de code — plan du site sans panier ni adresse privée", async () => {
    await withServer("F_NAV_L4", async () => {
      const robots = await get("/robots.txt");
      assert.match(robots.text, new RegExp(`Sitemap: ${ORIGIN}/sitemap.xml`));
      assert.match(robots.text, /Disallow: \/panier/);
      const sitemap = await get("/sitemap.xml");
      assert.equal(sitemap.status, 200);
      const urls = [...sitemap.text.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
      assert.ok(urls.includes(`${ORIGIN}/`), "l'accueil");
      assert.ok(urls.includes(`${ORIGIN}/famille/famille-full-1`), "une famille publiée");
      assert.ok(!urls.some((url) => /panier|commande|favoris|comparer/.test(url)), "aucune adresse privée");
      assert.doesNotMatch((await get("/famille/famille-full-1")).text, /<meta name="robots" content="noindex/);
    }, { env: { SITE_PUBLIC_ORIGIN: ORIGIN, SITE_SEARCH_ENGINES: "open" } });
  });

  test("S11 : la fiche porte sa canonique et ses données Produit et Fil d'Ariane ; l'accueil porte Organisation et Recherche", async () => {
    await withServer("F_NAV_L4", async () => {
      const fiche = (await get("/famille/famille-full-1")).text;
      assert.match(fiche, new RegExp(`<link rel="canonical" href="${ORIGIN}/famille/famille-full-1"`));
      const types = jsonLd(fiche).map((entry) => entry["@type"]);
      for (const type of ["Product", "BreadcrumbList", "Organization", "WebSite"]) assert.ok(types.includes(type), type);
      const product = jsonLd(fiche).find((entry) => entry["@type"] === "Product");
      assert.equal(product.url, `${ORIGIN}/famille/famille-full-1`);
      assert.match((await get("/")).text, new RegExp(`<link rel="canonical" href="${ORIGIN}/"`));
    }, { env: { SITE_PUBLIC_ORIGIN: ORIGIN } });
  });
});
