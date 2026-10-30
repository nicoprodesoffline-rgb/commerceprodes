// Friction 14 — REGLE : un montant n'apparaît jamais sans sa base fiscale. Famille RÉELLEMENT mixte (une variante HT, deux « non précisée »), navigateur Chromium sur `next start`
// en source fixture. Rien n'est écrit : seulement fiche et panier (aperçu serveur).
//   PLAYWRIGHT_DIR=<node_modules contenant playwright> CHROMIUM=<exécutable> npm run test:basis:ui   (prérequis : npm run c0:build && next build)
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { BASE, withServer } from "../nav/nav-server.mjs";
import { FILE, FIXTURE, HT_ITEM, removeBasisFixture, writeBasisFixture } from "./basis-fixtures.mjs";

const require = createRequire(path.join(process.env.PLAYWRIGHT_DIR ?? "", "/"));
const { chromium } = require("playwright");
const UNQ_ITEM = "PI-000000358";
const UNQ = /\(base fiscale non précisée\)/;

let browser;
before(async () => {
  writeBasisFixture();
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM, headless: true });
});
after(async () => {
  await browser?.close();
  removeBasisFixture();
});

/** Toute ligne de tableau ou phrase qui porte un montant en € porte aussi sa base (aucun bandeau d'écran quand les bases diffèrent). */
async function assertEveryAmountHasItsBasis(page, label) {
  assert.equal(await page.getByTestId("basis-notice").count(), 0, `${label} : pas de bandeau unique quand les bases diffèrent`);
  const carriers = await page.locator("main table tbody tr, [data-testid=qty-price], [data-testid=cart-total]").evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, " ").trim()));
  const withAmount = carriers.filter((t) => /€/.test(t));
  assert.ok(withAmount.length >= 2, `${label} : des montants sont affichés`);
  for (const text of withAmount) {
    // une ligne peut porter deux montants (unitaire et total de ligne) : CHACUN doit être suivi de sa base.
    const amounts = text.match(/\d[\d\s  ]*,\d{2}\s€/g) ?? [];
    const withBasis = text.match(/\d[\d\s  ]*,\d{2}\s€\s(?:HT|\(base fiscale non précisée\)|\(bases fiscales différentes[^)]*\)|\(base inconnue\))/g) ?? [];
    assert.equal(withBasis.length, amounts.length, `${label} : un montant sans base dans « ${text.slice(0, 200)} »`);
  }
}

describe("friction 14 — un montant n'apparaît jamais sans sa base fiscale (famille réellement mixte)", () => {
  test("fiche : variante HT puis variante « non précisée » — chaque prix, chaque palier et le total de ligne portent leur base", async () => {
    await withServer(FIXTURE, async () => {
      const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "fr-FR" })).newPage();
      await page.goto(`${BASE}/famille/gmce-demo?article=${HT_ITEM}`);
      await page.getByTestId("qty-price").getByText(/^Pour 1 : /).waitFor();
      assert.match(await page.getByTestId("qty-price").innerText(), /13,00\s€\sHT l'unité, soit 13,00\s€\sHT pour la ligne/);
      assert.match(await page.locator("main table").first().innerText(), /13,00\s€\sHT/);
      assert.doesNotMatch(await page.locator("main table").first().innerText(), UNQ, "les paliers de la variante HT ne portent pas la base d'une autre variante");
      const variants = await page.locator("details", { hasText: "Variantes proposées" }).innerText();
      assert.match(variants, /12,00\s€\s\(base fiscale non précisée\)/, "la variante « non précisée » garde sa mention dans la liste");
      assert.match(variants, /13,00\s€\sHT/, "la variante HT garde son HT dans la liste");
      await assertEveryAmountHasItsBasis(page, "fiche HT");
      await page.goto(`${BASE}/famille/gmce-demo?article=${UNQ_ITEM}`);
      await page.getByTestId("qty-price").getByText(/^Pour 1 : /).waitFor();
      assert.match(await page.getByTestId("qty-price").innerText(), /12,00\s€\s\(base fiscale non précisée\) l'unité, soit 12,00\s€\s\(base fiscale non précisée\) pour la ligne/);
      assert.doesNotMatch(await page.locator("main table").first().innerText(), /\bHT\b/);
      await assertEveryAmountHasItsBasis(page, "fiche non précisée");
      await page.context().close();
    }, { now: "2026-10-20T07:00:00Z", file: FILE });
  });

  test("panier mixte : le total de CHAQUE ligne porte la base de sa ligne, le total du panier dit que les bases diffèrent", async () => {
    await withServer(FIXTURE, async () => {
      const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "fr-FR" })).newPage();
      for (const [key, qty] of [[UNQ_ITEM, 2], [HT_ITEM, 3]]) {
        await page.goto(`${BASE}/famille/gmce-demo?article=${key}`);
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
      assert.equal((text(rows[0]).match(new RegExp(UNQ.source, "g")) ?? []).length, 2, "ligne « non précisée » : prix unitaire ET total de ligne portent la mention");
      assert.equal((text(rows[1]).match(/\bHT\b/g) ?? []).length, 2, "ligne HT : prix unitaire ET total de ligne portent HT");
      assert.match(await page.getByTestId("cart-total").innerText(), /\(bases fiscales différentes : HT et non précisée\)/, "le total nomme les deux bases présentes");
      assert.match(await page.getByTestId("totals-note").innerText(), /bases fiscales différentes.*HT et non précisée/);
      await assertEveryAmountHasItsBasis(page, "panier mixte");
      await page.context().close();
    }, { now: "2026-10-20T07:00:00Z", file: FILE });
  });

  test("total du panier : aucune ligne ne porte de base → « non précisée » ; HT + inconnue → les deux bases nommées (jamais « HT et non précisée » à tort, jamais un total nu)", async () => {
    await withServer(FIXTURE, async () => {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "fr-FR" });
      const page = await ctx.newPage();
      for (const key of [UNQ_ITEM, HT_ITEM]) {
        await page.goto(`${BASE}/famille/gmce-demo?article=${key}`);
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
      assert.match(none.total, /\(base fiscale non précisée\)$/, "aucune ligne ne porte de base : le total dit « non précisée »");
      assert.doesNotMatch(none.total, /inconnue/);
      rewrite = (body) => { body.lines[0].selection.tax_basis_or_status = "HT"; body.lines[1].selection.tax_basis_or_status = null; };
      const mixed = await total();
      assert.match(mixed.total, /\(bases fiscales différentes : HT et inconnue\)$/, "HT + inconnue : les deux bases nommées");
      assert.doesNotMatch(mixed.total, /non précisée/, "le libellé n'invente pas « non précisée »");
      assert.match(mixed.note, /HT et inconnue/);
      await ctx.close();
    }, { now: "2026-10-20T07:00:00Z", file: FILE });
  });
});
