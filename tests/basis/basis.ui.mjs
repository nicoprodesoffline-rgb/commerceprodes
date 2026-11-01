// RÈGLE : la vitrine n'affirme « HT » que pour un prix dont la génération DÉCLARE la base ; une base non déclarée n'est ni affirmée ni commentée (aucun suffixe, aucun jargon fiscal). Famille RÉELLEMENT mixte (une variante HT, deux sans base déclarée), navigateur Chromium sur `next start`
// en source fixture. Rien n'est écrit : seulement fiche et panier (aperçu serveur).
//   PLAYWRIGHT_DIR=<node_modules contenant playwright> CHROMIUM=<exécutable> npm run test:basis:ui   (prérequis : npm run c0:build && next build)
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { BASE, withServer } from "../nav/nav-server.mjs";
import { FAMILY_SLUG, FILE, FIXTURE, HT_ITEM, removeBasisFixture, writeBasisFixture } from "./basis-fixtures.mjs";

const require = createRequire(path.join(process.env.PLAYWRIGHT_DIR ?? "", "/"));
const { chromium } = require("playwright");
const UNQ_ITEM = "PI-000000358";
const NO_TAX_JARGON = /base fiscale|bases? (?:fiscales? )?différentes?|non précisée|inconnue|\bTTC\b|TVA/i;

let browser;
before(async () => {
  writeBasisFixture();
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM, headless: true });
});
after(async () => {
  await browser?.close();
  removeBasisFixture();
});

/** Aucun libellé fiscal inventé : un montant n'est suivi de « HT » que s'il vient d'une ligne HT ; jamais de jargon quand la base n'est pas déclarée. */
async function assertNoInventedBasis(page, label) {
  assert.equal(await page.getByTestId("basis-notice").count(), 0, `${label} : plus de bandeau fiscal`);
  const text = await page.locator("main").innerText();
  assert.doesNotMatch(text, NO_TAX_JARGON, `${label} : aucun jargon fiscal`);
}

describe("base fiscale — jamais affirmée sans la donnée, HT déclaré conservé (famille réellement mixte)", () => {
  test("fiche : la variante HT dit HT, la variante sans base déclarée n'en dit rien", async () => {
    await withServer(FIXTURE, async () => {
      const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "fr-FR" })).newPage();
      await page.goto(`${BASE}/famille/${FAMILY_SLUG}?article=${HT_ITEM}`);
      await page.getByTestId("qty-price").getByText(/^Pour 1 : /).waitFor();
      assert.match(await page.getByTestId("qty-price").innerText(), /13,00\s€\sHT l'unité, soit 13,00\s€\sHT pour la ligne/);
      assert.match(await page.locator("main table").first().innerText(), /13,00\s€\sHT/);
      assert.equal(await page.getByText("Variantes proposées").count(), 0, "plus de tableau des variantes : les sélecteurs suffisent");
      await page.goto(`${BASE}/famille/${FAMILY_SLUG}?article=${UNQ_ITEM}`);
      await page.getByTestId("qty-price").getByText(/^Pour 1 : /).waitFor();
      const qty = await page.getByTestId("qty-price").innerText();
      assert.match(qty, /12,00\s€/);
      assert.doesNotMatch(qty, /\bHT\b|TTC/, "base non déclarée : aucun HT ni TTC affirmé");
      assert.doesNotMatch(await page.locator("main table").first().innerText(), /\bHT\b/);
      await assertNoInventedBasis(page, "fiche sans base déclarée");
      await page.context().close();
    }, { now: "2026-10-20T07:00:00Z", file: FILE });
  });

  test("panier mixte : chaque ligne dit sa propre base seulement si elle est déclarée ; le total du panier n'affirme aucune base quand elles diffèrent", async () => {
    await withServer(FIXTURE, async () => {
      const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "fr-FR" })).newPage();
      for (const [key, qty] of [[UNQ_ITEM, 2], [HT_ITEM, 3]]) {
        await page.goto(`${BASE}/famille/${FAMILY_SLUG}?article=${key}`);
        await page.getByTestId("qty-price").getByText(/^Pour 1 : /).waitFor();
        await page.locator("input[type=text]").first().fill(String(qty));
        await page.getByTestId("qty-price").getByText(new RegExp(`^Pour ${qty} : .*pour la ligne`)).waitFor();
        await page.getByRole("button", { name: "Ajouter au panier" }).click();
        await page.getByRole("status").getByText(/Ajouté au panier/).waitFor();
      }
      await page.goto(`${BASE}/panier`);
      await page.getByTestId("cart-total").getByText(/€/).waitFor();
      const rows = await page.getByTestId("cart-line").allInnerTexts();
      assert.equal(rows.length, 2);
      const text = (t) => t.replace(/\s+/g, " ");
      assert.doesNotMatch(text(rows[0]), /\bHT\b|TTC/, "ligne sans base déclarée : aucun HT");
      assert.equal((text(rows[1]).match(/\bHT\b/g) ?? []).length, 2, "ligne HT : prix unitaire ET total de ligne portent HT");
      const total = (await page.getByTestId("cart-total").innerText()).replace(/\s+/g, " ");
      assert.doesNotMatch(total, /\bHT\b|TTC|différentes|non précisée/, "bases mêlées : le total n'affirme aucune base");
      assert.doesNotMatch(await page.getByTestId("totals-note").innerText(), NO_TAX_JARGON);
      await assertNoInventedBasis(page, "panier mixte");
      await page.context().close();
    }, { now: "2026-10-20T07:00:00Z", file: FILE });
  });

  test("total du panier : sans base déclarée → aucun suffixe ; HT + base inconnue → aucun HT (jamais un HT affirmé à tort)", async () => {
    await withServer(FIXTURE, async () => {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "fr-FR" });
      const page = await ctx.newPage();
      for (const key of [UNQ_ITEM, HT_ITEM]) {
        await page.goto(`${BASE}/famille/${FAMILY_SLUG}?article=${key}`);
        await page.getByTestId("qty-price").getByText(/^Pour 1 : /).waitFor();
        await page.getByRole("button", { name: "Ajouter au panier" }).click();
        await page.getByRole("status").getByText(/Ajouté au panier/).waitFor();
      }
      let rewrite = () => {};
      await page.route("**/api/site/cart/preview", async (route) => {
        const response = await route.fetch();
        const body = await response.json();
        rewrite(body);
        const { "content-length": _ignored, ...headers } = response.headers();
        await route.fulfill({ status: response.status(), headers, body: JSON.stringify(body) });
      });
      const total = async () => {
        await page.goto(`${BASE}/panier`);
        await page.getByTestId("cart-line").nth(1).getByText(/€/).first().waitFor();
        await page.getByTestId("cart-total").getByText(/€/).waitFor();
        return { total: (await page.getByTestId("cart-total").innerText()).replace(/\s+/g, " "), note: (await page.getByTestId("totals-note").innerText()).replace(/\s+/g, " ") };
      };
      rewrite = (body) => body.lines.forEach((l) => { if (l.selection) l.selection.tax_basis_or_status = null; });
      const none = await total();
      assert.doesNotMatch(none.total, /\bHT\b|TTC|non précisée|inconnue/, "aucune ligne ne porte de base : le total n'affirme rien");
      rewrite = (body) => { body.lines[0].selection.tax_basis_or_status = "HT"; body.lines[1].selection.tax_basis_or_status = null; };
      const mixed = await total();
      assert.doesNotMatch(mixed.total, /\bHT\b|TTC|non précisée|inconnue/, "HT + inconnue : jamais un HT affirmé pour tout le panier");
      assert.doesNotMatch(mixed.note, NO_TAX_JARGON);
      await ctx.close();
    }, { now: "2026-10-20T07:00:00Z", file: FILE });
  });
});

describe("la base fiscale n'est affirmée que si la génération la déclare (S1-A I4)", () => {
  test("génération mixte : ni « Prix HT » ni « hors taxes » sur l'accueil, la fiche et le pied de page, et aucun jargon fiscal à la place", async () => {
    await withServer(FIXTURE, async () => {
      const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "fr-FR" })).newPage();
      for (const path of ["/", `/famille/${FAMILY_SLUG}?article=${HT_ITEM}`]) {
        await page.goto(`${BASE}${path}`);
        await page.locator("footer").waitFor();
        const chrome = [await page.locator("footer").innerText(), ...(path === "/" ? [await page.getByTestId("hero").innerText(), await page.getByTestId("trust-bar").innerText()] : [])].join("\n");
        assert.doesNotMatch(chrome, /Prix HT|hors taxes/i, `${path} : aucune base affirmée hors de la donnée`);
        assert.doesNotMatch(await page.locator("footer").innerText(), NO_TAX_JARGON, path);
      }
      await page.goto(`${BASE}/faq`);
      const faq = await page.locator("main").textContent(); // les réponses sont repliées : lire le texte, pas le rendu
      assert.doesNotMatch(faq, /hors taxes|Prix HT/i, "FAQ : aucune base affirmée hors de la donnée");
      assert.doesNotMatch(faq, /base fiscale/i, "FAQ : la question fiscale disparaît tant que la base n'est pas déclarée");
      await page.context().close();
    }, { now: "2026-10-20T07:00:00Z", file: FILE });
  });
});

describe("pastilles de couleur du sélecteur de variantes (S1-A)", () => {
  test("l'axe « Couleur » montre une pastille décorative devant chaque nom connu ; le texte reste ; l'axe « Taille » n'en a pas", async () => {
    await withServer(FIXTURE, async () => {
      const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "fr-FR" })).newPage();
      await page.goto(`${BASE}/famille/${FAMILY_SLUG}`);
      const color = page.locator("fieldset", { hasText: "Couleur" }).first();
      await color.waitFor();
      const swatches = color.locator('span[aria-hidden="true"][style*="background-color"]');
      assert.ok((await swatches.count()) >= 2, "une pastille par couleur connue (rouge, bleu)");
      assert.match(await color.innerText(), /Rouge/);
      assert.match(await color.innerText(), /Bleu/);
      const size = page.locator("fieldset", { hasText: "Taille" }).first();
      assert.equal(await size.locator('span[aria-hidden="true"][style*="background-color"]').count(), 0, "aucune pastille sur un axe qui n'est pas une couleur");
      await page.context().close();
    }, { now: "2026-10-20T07:00:00Z", file: FILE });
  });
});
