// CAT-07 — câblage pages / fil d'Ariane / fiche, SANS navigateur (HTTP sur `next start`), sur les documents F_NAV_* :
//   npm run test:nav        (construit C0 et l'application, puis lance les cas unitaires et ce fichier)
// Ce fichier protège ce que la fonction pure ne voit pas : les pages qui l'utilisent.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { removeNavFixtures, writeNavFixtures } from "./nav-fixtures.mjs";
import { get, withServer } from "./nav-server.mjs";

before(() => writeNavFixtures());
after(() => removeNavFixtures());

const crumbs = (html) => {
  const nav = /<nav aria-label="Fil d(?:&#x27;|')Ariane"[^>]*>([\s\S]*?)<\/nav>/.exec(html);
  assert.ok(nav, "fil d'Ariane présent");
  return [...nav[1].matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map((m) => m[1].replace(/<[^>]+>/g, "").replace(/^\//, "").trim());
};
const hrefs = (html) => new Set([...html.matchAll(/href="(\/categorie\/[^"]+)"/g)].map((m) => m[1]));

describe("4 niveaux et plus", () => {
  test("fil d'Ariane de 3 maillons, 404 niveau 4+, « Également dans » sans niveau 4+", async () => {
    await withServer("F_NAV_L4", async () => {
      // famille-full-2 est classée au niveau 4 : le fil s'arrête à l'ancêtre de niveau 3
      const fiche = await get("/famille/famille-full-2");
      assert.equal(fiche.status, 200);
      assert.deepEqual(crumbs(fiche.text).slice(0, -1), ["Accueil", "Mobilier", "Chaises", "Chaises de bureau"]);
      assert.ok(!fiche.text.includes("Quatrième niveau") && !fiche.text.includes("roulettes"), "aucune trace d'un niveau 4+");
      for (const key of ["mobilier-chaises-bureau-roulettes", "mobilier-chaises-bureau-roulettes-xl"]) {
        assert.equal((await get(`/categorie/${key}`)).status, 404, key);
      }
      // famille-full-4 : principale « Mobilier », secondaire au niveau 5 -> « Également dans » vise le niveau 3
      const autre = await get("/famille/famille-full-4");
      assert.ok(!autre.text.includes("roulettes"));
      assert.match(autre.text, /data-testid="secondary-categories"[\s\S]*?href="\/categorie\/mobilier-chaises-bureau"/);
      // la page du niveau 3 porte les familles rattachées
      const page = await get("/categorie/mobilier-chaises-bureau");
      assert.equal(page.status, 200);
      assert.deepEqual(crumbs(page.text), ["Accueil", "Mobilier", "Chaises", "Chaises de bureau"]);
      for (const slug of ["famille-full-1", "famille-full-2", "famille-full-4"]) assert.ok(page.text.includes(`href="/famille/${slug}"`), slug);
      // ni le menu ni l'accueil ne proposent un niveau 4+
      for (const p of ["/", "/categorie/mobilier"]) assert.ok(![...hrefs((await get(p)).text)].some((h) => h.includes("roulettes")), p);
    });
  });
});

describe("rubrique vide", () => {
  test("masquée du menu, de l'accueil et du parent, mais servie en 200 avec noindex", async () => {
    await withServer("F_NAV_L2", async () => {
      for (const p of ["/", "/categorie/mobilier", "/categorie/signaletique"]) {
        assert.ok(!hrefs((await get(p)).text).has("/categorie/vide"), `${p} ne propose pas la rubrique vide`);
      }
      const vide = await get("/categorie/vide");
      assert.equal(vide.status, 200);
      assert.match(vide.text, /Aucune famille/);
      // Tout le site est « noindex, nofollow » aujourd'hui : seule la rubrique vide porte sa propre directive (« noindex, follow »),
      // qui survivra à l'ouverture de l'indexation du reste.
      assert.match(vide.text, /<meta name="robots" content="noindex, follow"/, "une rubrique vide n'est jamais indexable");
      assert.match((await get("/categorie/mobilier")).text, /<meta name="robots" content="noindex, nofollow"/, "témoin : le reste du site garde la directive globale");
      assert.deepEqual(crumbs(vide.text), ["Accueil", "Rubrique vide"]);
      const chaises = await get("/categorie/mobilier-chaises");
      assert.deepEqual(crumbs(chaises.text), ["Accueil", "Mobilier", "Chaises"]);
    });
    await withServer("F_NAV_L3", async () => {
      assert.ok(!hrefs((await get("/categorie/mobilier-chaises")).text).has("/categorie/mobilier-chaises-vide"), "sous-catégorie vide masquée");
      assert.equal((await get("/categorie/mobilier-chaises-vide")).status, 200);
    });
  });
});

describe("3 niveaux", () => {
  test("le niveau 3 est un maillon et la page du niveau 3 liste ses familles", async () => {
    await withServer("F_NAV_L3", async () => {
      const page = await get("/categorie/mobilier-chaises-bureau");
      assert.deepEqual(crumbs(page.text), ["Accueil", "Mobilier", "Chaises", "Chaises de bureau"]);
      const fiche = await get("/famille/famille-full-1");
      assert.deepEqual(crumbs(fiche.text).slice(0, -1), ["Accueil", "Mobilier", "Chaises", "Chaises de bureau"]);
    });
  });
});
