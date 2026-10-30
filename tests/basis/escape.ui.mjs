// Revue f1 — les textes de famille (nom, description courte, description longue) sont TOUJOURS affichés en texte, jamais interprétés comme du HTML : l'écran « Compléter en masse »
// de la Factory enregistre ce qui est saisi (`Courte <b><img src=x onerror=…>`), donc le site ne doit jamais l'exécuter ni l'injecter. Navigateur Chromium, source fixture.
//   PLAYWRIGHT_DIR=<node_modules contenant playwright> CHROMIUM=<exécutable> npm run test:basis:ui   (prérequis : npm run c0:build && next build)
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { BASE, withServer } from "../nav/nav-server.mjs";
import { ESCAPE_FILE, ESCAPE_FIXTURE, HOSTILE, removeEscapeFixture, writeEscapeFixture } from "./basis-fixtures.mjs";

const require = createRequire(path.join(process.env.PLAYWRIGHT_DIR ?? "", "/"));
const { chromium } = require("playwright");
let browser;
before(async () => {
  writeEscapeFixture();
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM, headless: true });
});
after(async () => {
  await browser?.close();
  removeEscapeFixture();
});

/** Rien n'a été exécuté ni injecté : ni drapeau posé par un gestionnaire, ni <img src=x>, ni <script>/<svg>/<h1>/<b> venus du texte, ni lien javascript:. */
async function assertNothingInjected(page, label) {
  assert.equal(await page.evaluate(() => window.__pwned), undefined, `${label} : un gestionnaire du texte hostile s'est exécuté`);
  const injected = await page.evaluate(() => ({
    img: document.querySelectorAll("img[src='x'], img[onerror]").length,
    // Le texte hostile figure légitimement DANS les données de rendu de Next (`self.__next_f.push([...])`, une chaîne JSON dont les « < » sont échappés en \u003c) : ce n'est pas du code.
    // Est « injecté » tout autre <script> qui porte le texte, ou tout script de données où un « < » n'est pas échappé.
    script: [...document.querySelectorAll("script")].filter((s) => s.textContent.includes("__pwned") && (!s.textContent.startsWith("self.__next_f") || /<script|<img|<svg/i.test(s.textContent))).length,
    svg: document.querySelectorAll("svg[onload]").length,
    inlineHandlers: [...document.querySelectorAll("*")].filter((e) => [...e.attributes].some((a) => /^on/i.test(a.name) && String(a.value).includes("__pwned"))).length,
    jsLinks: [...document.querySelectorAll("a[href]")].filter((a) => a.getAttribute("href").trim().toLowerCase().startsWith("javascript:")).length,
    bold: document.querySelectorAll("main b").length,
    injectedH1: [...document.querySelectorAll("h1")].filter((h) => h.textContent.includes("titre injecté")).length,
  }));
  assert.deepEqual(injected, { img: 0, script: 0, svg: 0, inlineHandlers: 0, jsLinks: 0, bold: 0, injectedH1: 0 }, `${label} : du HTML issu d'un texte de famille a été injecté`);
}

async function assertShownAsText(page, snippets, label) {
  const text = await page.locator("body").innerText();
  for (const snippet of snippets) assert.ok(text.includes(snippet), `${label} : « ${snippet} » doit apparaître littéralement, en texte`);
}

describe("textes de famille hostiles — affichés en texte sur toutes les pages qui les portent", () => {
  test("fiche famille, accueil, rubrique, recherche, panier, commande : rien n'est injecté, tout est lisible tel quel", async () => {
    await withServer(ESCAPE_FIXTURE, async () => {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "fr-FR" });
      const page = await ctx.newPage();
      page.on("dialog", async (d) => { await d.dismiss(); throw new Error(`boîte de dialogue ouverte par un texte de famille : ${d.message()}`); });
      await page.goto(`${BASE}/famille/gmce-demo`);
      await page.getByTestId("qty-price").getByText(/^Pour 1 : /).waitFor();
      await assertNothingInjected(page, "fiche");
      await assertShownAsText(page, ['Chaise <b>gras</b> & "guillemets" <img src=x', "Courte <b><img src=x", "</p><h1>titre injecté</h1><script>", 'javascript:window.__pwned=\'lien\'', "<svg onload="], "fiche");
      assert.ok((await page.title()).includes("<b>gras</b>"), "le titre de l'onglet porte le nom en texte");
      assert.equal((await page.evaluate(() => document.querySelector("h1").innerHTML)).includes("<img"), false, "h1 : pas de balise <img> dans le DOM (le texte est échappé)");
      await page.getByRole("button", { name: "Ajouter au panier" }).click();
      await page.getByRole("status").getByText(/Ajouté au panier/).waitFor();
      for (const [url, label] of [["/", "accueil"], ["/categorie/signaletique", "rubrique"], ["/recherche?q=Chaise", "recherche"], ["/panier", "panier"], ["/commande", "commande"]]) {
        await page.goto(BASE + url);
        await page.waitForLoadState("networkidle");
        await assertNothingInjected(page, label);
      }
      await assertShownAsText(page, ['Chaise <b>gras</b> & "guillemets"'], "commande (récapitulatif)");
      // La requête de recherche aussi : réfléchie en texte, jamais exécutée.
      await page.goto(`${BASE}/recherche?q=${encodeURIComponent("<img src=x onerror=window.__pwned=1>")}`);
      await assertNothingInjected(page, "recherche réfléchie");
      await ctx.close();
    }, { now: "2026-10-20T07:00:00Z", file: ESCAPE_FILE });
  });
});
