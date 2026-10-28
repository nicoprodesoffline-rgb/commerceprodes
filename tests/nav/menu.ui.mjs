// CAT-07 — recette navigateur (Playwright + Chromium déjà présents localement, aucun téléchargement) du menu
// catégories, du fil d'Ariane et des pages catégorie sur des documents C0 à 2, 3 et 4+ niveaux.
//   npm run c0:build && npx next build   (une fois)
//   PLAYWRIGHT_DIR=<dossier node_modules contenant playwright> [CHROMIUM=<exécutable>] [NAV_OUT=<dossier captures>] \
//     node --test --test-concurrency=1 tests/nav/menu.ui.mjs
// Un `next start` par scénario sur $NAV_PORT (défaut 3120), lancé et tué (son PID seulement) par ce script.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { removeNavFixtures, writeNavFixtures } from "./nav-fixtures.mjs";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const PORT = Number(process.env.NAV_PORT ?? 3120);
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = process.env.NAV_OUT ? path.resolve(process.env.NAV_OUT) : null;
if (OUT) mkdirSync(OUT, { recursive: true });
const require = createRequire(path.join(process.env.PLAYWRIGHT_DIR ?? "", "/"));
const { chromium } = require("playwright");
const VIEWPORTS = { "375": { width: 375, height: 800 }, "768": { width: 768, height: 900 }, "1280": { width: 1280, height: 900 } };

let browser;
before(async () => {
  writeNavFixtures();
  browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
});
after(async () => {
  await browser?.close();
  removeNavFixtures();
});

async function portAnswers() {
  try {
    await fetch(BASE + "/", { signal: AbortSignal.timeout(500) });
    return true;
  } catch {
    return false;
  }
}

async function withServer(fixture, fn) {
  assert.equal(await portAnswers(), false, `port ${PORT} occupé`);
  const child = spawn(process.execPath, [path.join(ROOT, "node_modules/next/dist/bin/next"), "start", "-H", "127.0.0.1", "-p", String(PORT)], {
    cwd: ROOT,
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      NEXT_TELEMETRY_DISABLED: "1",
      SITE_ENV: "staging",
      SITE_NOW_UTC: "2026-10-19T06:00:00Z",
      SITE_CATALOG_SOURCE: "fixture",
      SITE_CATALOG_FIXTURE: `${fixture}/snapshot_nav.json`,
    },
    stdio: ["ignore", "ignore", "pipe"],
  });
  let exited = false;
  child.on("exit", () => (exited = true));
  const deadline = Date.now() + 30_000;
  while (!(await portAnswers())) {
    if (exited || Date.now() > deadline) throw new Error("serveur non démarré");
    await new Promise((r) => setTimeout(r, 150));
  }
  try {
    await fn();
  } finally {
    if (!exited) {
      const done = new Promise((r) => child.once("exit", r));
      process.kill(child.pid, "SIGTERM"); // PID lancé par ce script uniquement
      await done;
    }
  }
}

const get = async (p) => {
  const r = await fetch(BASE + p);
  return { status: r.status, text: await r.text() };
};

async function page(vp) {
  const ctx = await browser.newContext({ viewport: VIEWPORTS[vp] });
  const p = await ctx.newPage();
  return { p, close: () => ctx.close() };
}
const shot = async (p, name) => {
  if (OUT) await p.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: false });
};
const crumbs = (p) => p.$$eval('nav[aria-label="Fil d\'Ariane"] li', (lis) => lis.map((li) => li.textContent.replace(/^\//, "").trim()));
const openMenu = async (p) => {
  await p.click('button[aria-controls]:has-text("Catégories")');
  await p.waitForSelector('[data-testid="category-menu"] ul[data-level="1"]', { state: "visible" });
};
const menuKeys = (p) => p.$$eval('[data-testid="category-menu"] a', (as) => as.map((a) => a.getAttribute("href").replace("/categorie/", "")));
const menuLevels = (p) => p.$$eval('[data-testid="category-menu"] ul[data-level]', (us) => [...new Set(us.map((u) => u.getAttribute("data-level")))].sort());

describe("2 niveaux", () => {
  test("menu, rubrique vide masquée mais servie, fil d'Ariane, responsive", async () => {
    await withServer("F_NAV_L2", async () => {
      for (const vp of Object.keys(VIEWPORTS)) {
        const { p, close } = await page(vp);
        try {
          await p.goto(BASE + "/");
          await openMenu(p);
          assert.deepEqual(await menuKeys(p), ["mobilier", "mobilier-chaises", "signaletique"], `${vp}px : « vide » (aucune famille) est absente du menu`);
          assert.deepEqual(await menuLevels(p), ["1", "2"], `${vp}px : 2 niveaux`);
          const box = await p.locator('[data-testid="category-menu"] ul[data-level="1"]').first().boundingBox();
          assert.ok(box.x >= 0 && box.x + box.width <= VIEWPORTS[vp].width, `${vp}px : le panneau tient dans la fenêtre`);
          assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${vp}px : pas de défilement horizontal`);
          await shot(p, `l2-menu-${vp}`);
          await p.goto(BASE + "/categorie/mobilier-chaises");
          assert.deepEqual(await crumbs(p), ["Accueil", "Mobilier", "Chaises"], `${vp}px : fil d'Ariane`);
          assert.equal(await p.getAttribute('nav[aria-label="Fil d\'Ariane"] [aria-current="page"]', "aria-current"), "page");
        } finally {
          await close();
        }
      }
      const vide = await get("/categorie/vide");
      assert.equal(vide.status, 200, "une rubrique vide répond (lien externe non cassé)");
      assert.match(vide.text, /Aucune famille/);
    });
  });
});

describe("3 niveaux", () => {
  test("menu à 3 niveaux, enfant vide masqué, fil d'Ariane à 3 maillons, clavier", async () => {
    await withServer("F_NAV_L3", async () => {
      for (const vp of Object.keys(VIEWPORTS)) {
        const { p, close } = await page(vp);
        try {
          await p.goto(BASE + "/");
          await openMenu(p);
          assert.deepEqual(await menuLevels(p), ["1", "2", "3"], `${vp}px : 3 niveaux`);
          const keys = await menuKeys(p);
          assert.ok(keys.includes("mobilier-chaises-bureau") && !keys.includes("mobilier-chaises-vide"), `${vp}px : niveau 3 présent, niveau 3 vide masqué`);
          assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${vp}px : pas de défilement horizontal`);
          await shot(p, `l3-menu-${vp}`);
          await p.goto(BASE + "/categorie/mobilier-chaises-bureau");
          assert.deepEqual(await crumbs(p), ["Accueil", "Mobilier", "Chaises", "Chaises de bureau"], `${vp}px : fil d'Ariane`);
          await shot(p, `l3-page-${vp}`);
        } finally {
          await close();
        }
      }
      const { p, close } = await page("1280");
      try {
        // Clavier : Entrée ouvre, Tab entre dans le panneau, Échap ferme et rend le focus au bouton, Tab hors du menu ferme.
        await p.goto(BASE + "/");
        const button = p.locator('button[aria-controls]:has-text("Catégories")');
        await button.focus();
        assert.equal(await button.getAttribute("aria-expanded"), "false");
        await p.keyboard.press("Enter");
        assert.equal(await button.getAttribute("aria-expanded"), "true");
        await p.keyboard.press("Tab");
        assert.equal(await p.evaluate(() => document.activeElement?.getAttribute("href")), "/categorie/mobilier", "premier Tab : première rubrique");
        await p.keyboard.press("Tab");
        assert.equal(await p.evaluate(() => document.activeElement?.getAttribute("href")), "/categorie/mobilier-chaises", "ordre de lecture = ordre visuel");
        await p.keyboard.press("Escape");
        assert.equal(await button.getAttribute("aria-expanded"), "false");
        assert.equal(await p.evaluate(() => document.activeElement?.getAttribute("aria-controls") !== null), true, "focus rendu au bouton");
        await p.keyboard.press("Space");
        assert.equal(await button.getAttribute("aria-expanded"), "true", "Espace ouvre");
        const n = await p.locator('[data-testid="category-menu"] a').count();
        for (let i = 0; i < n + 1; i++) await p.keyboard.press("Tab");
        assert.equal(await button.getAttribute("aria-expanded"), "false", "le focus quitte le menu : il se ferme");
        await shot(p, "l3-clavier");
      } finally {
        await close();
      }
    });
  });
});

describe("4 niveaux et plus", () => {
  test("niveau 4+ ni menu, ni page, ni maillon ; familles rattachées au niveau 3", async () => {
    await withServer("F_NAV_L4", async () => {
      for (const vp of Object.keys(VIEWPORTS)) {
        const { p, close } = await page(vp);
        try {
          await p.goto(BASE + "/");
          await openMenu(p);
          assert.deepEqual(await menuLevels(p), ["1", "2", "3"], `${vp}px : jamais plus de 3 niveaux`);
          const keys = await menuKeys(p);
          assert.ok(!keys.some((k) => k.includes("roulettes")), `${vp}px : aucune rubrique de niveau 4+ dans le menu`);
          await shot(p, `l4-menu-${vp}`);
          // famille-full-2 est classée au niveau 4 : son fil d'Ariane s'arrête au niveau 3.
          await p.goto(BASE + "/famille/famille-full-2");
          assert.deepEqual((await crumbs(p)).slice(0, -1), ["Accueil", "Mobilier", "Chaises", "Chaises de bureau"], `${vp}px : fil d'Ariane de la famille`);
          await p.goto(BASE + "/categorie/mobilier-chaises-bureau");
          const cards = await p.$$eval('a[href^="/famille/"]', (as) => [...new Set(as.map((a) => a.getAttribute("href")))]);
          assert.ok(cards.includes("/famille/famille-full-1") && cards.includes("/famille/famille-full-2"), `${vp}px : la famille du niveau 4 est rattachée au niveau 3`);
        } finally {
          await close();
        }
      }
      for (const k of ["mobilier-chaises-bureau-roulettes", "mobilier-chaises-bureau-roulettes-xl"]) assert.equal((await get(`/categorie/${k}`)).status, 404, `${k} : pas de page`);
      assert.equal((await get("/categorie/mobilier-chaises-bureau")).status, 200);
      // famille-full-4 : secondaire au niveau 5 -> « Également dans » pointe le niveau 3, jamais le niveau 5.
      const fiche = await get("/famille/famille-full-4");
      assert.ok(!fiche.text.includes("roulettes"), "aucun lien vers un niveau 4+");
      assert.match(fiche.text, /href="\/categorie\/mobilier-chaises-bureau"/);
    });
  });
});

describe("aucune fuite, aucune rubrique non validée", () => {
  test("le HTML ne porte ni champ DTO interne ni rubrique hors DTO", async () => {
    await withServer("F_NAV_L3", async () => {
      for (const p of ["/", "/categorie/mobilier", "/categorie/mobilier-chaises-bureau", "/famille/famille-full-1"]) {
        const { status, text } = await get(p);
        assert.equal(status, 200, p);
        for (const forbidden of ["parent_category_key", "secondary_category_keys", "primary_category_key", "rubrique-non-validee", "price_public", "buy_price"]) {
          assert.ok(!text.includes(forbidden), `${p} ne contient pas « ${forbidden} »`);
        }
      }
      assert.equal((await get("/categorie/rubrique-non-validee")).status, 404);
    });
  });
});
