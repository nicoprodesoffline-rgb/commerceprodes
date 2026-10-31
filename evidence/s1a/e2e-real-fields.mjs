// S1-A — bout en bout RÉEL des champs optionnels de site_content.v1 : nav.order, nav.show_in_bar, hero.link_label, text_image.image_alt.
// Trois pages sont créées et exportées par l'éditeur de la Factory, lues par le site, puis dépubliées. Aucune écriture directe dans le dossier d'export (lecture de liste seulement).
// Variables : FACTORY, SITE, OUTBOX (lecture seule), PASSWORD_FILE, OUT (PNG hors dépôt), REPORT, PLAYWRIGHT_DIR, CHROMIUM.
import { createRequire } from "node:module";
import fs from "node:fs";
const { FACTORY, SITE, OUTBOX, PASSWORD_FILE, OUT, REPORT, PLAYWRIGHT_DIR, CHROMIUM } = process.env;
const { chromium } = createRequire(`${PLAYWRIGHT_DIR}/`)("playwright");
fs.mkdirSync(OUT, { recursive: true });
const TAG = Date.now().toString(36);
const A = `demo-a-${TAG}`, B = `demo-b-${TAG}`, C = `demo-c-${TAG}`;
const ALT = "Texte alternatif de démonstration";
const report = { steps: {} };
const listing = () => { try { return fs.readdirSync(OUTBOX).sort(); } catch { return []; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(check, ms = 25000) { const t = Date.now(); while (Date.now() - t < ms) { if (await check()) return true; await sleep(1000); } return false; }
const status = async (slug) => (await fetch(`${SITE}/p/${slug}`)).status;

const browser = await chromium.launch({ executablePath: CHROMIUM, headless: true });
const op = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage(); op.setDefaultTimeout(30000);
await op.goto(`${FACTORY}/operator/login/`);
await op.fill('input[name="username"]', "operatrice-demo");
await op.fill('input[name="password"]', fs.readFileSync(PASSWORD_FILE, "utf8").trim());
await Promise.all([op.waitForNavigation(), op.click('button[type="submit"], input[type="submit"]')]);

const firstOption = async (sel) => op.$eval(sel, (s) => [...s.options].map((o) => o.value).find((v) => v !== "") ?? null);
async function createAndExport({ slug, title, order, show, heroLabel, withImage }) {
  await op.goto(`${FACTORY}/operator/site/contenus/creer/`);
  await op.fill("#id_slug", `/${slug}`); await op.fill("#id_title", title);
  await op.fill("#id_nav_order", String(order));
  if (show) await op.check("#id_nav_show_in_bar"); else await op.uncheck("#id_nav_show_in_bar");
  await op.selectOption("#id_sections-0-kind", "hero");
  await op.fill("#id_sections-0-title", `Bandeau ${title}`); await op.fill("#id_sections-0-text", "Texte de démonstration");
  await op.fill("#id_sections-0-link", "/recherche"); if (heroLabel) await op.fill("#id_sections-0-link_label", heroLabel);
  await op.fill("#id_sections-0-ORDER", "1");
  const media = withImage ? await firstOption("#id_sections-1-media_sha") : null;
  if (media) {
    await op.selectOption("#id_sections-1-kind", "text_image");
    await op.fill("#id_sections-1-text", "Texte à côté de l'image"); await op.selectOption("#id_sections-1-media_sha", media); await op.fill("#id_sections-1-image_alt", ALT);
  } else {
    await op.selectOption("#id_sections-1-kind", "category_grid");
    await op.selectOption("#id_sections-1-categories", await firstOption("#id_sections-1-categories"));
  }
  await op.fill("#id_sections-1-ORDER", "2");
  await op.click('button:has-text("Enregistrer la page")'); await op.waitForLoadState("load").catch(() => {}); await sleep(1200);
  const saved = /\/site\/contenus\/[0-9a-f-]{36}\/$/.test(op.url());
  const editUrl = op.url();
  const n = listing().length;
  await op.click('button:has-text("Exporter la version enregistrée")'); await op.waitForLoadState("load").catch(() => {});
  const exported = await until(() => listing().length >= n + 2);
  return { saved, exported, editUrl, media: !!media };
}

const pages = {};
pages.A = await createAndExport({ slug: A, title: "Démo A", order: 20, show: true, heroLabel: "Voir la sélection", withImage: true });
pages.B = await createAndExport({ slug: B, title: "Démo B", order: 10, show: true, heroLabel: "", withImage: false });
pages.C = await createAndExport({ slug: C, title: "Démo C", order: 1, show: false, heroLabel: "", withImage: false });
report.steps.created_and_exported = Object.fromEntries(Object.entries(pages).map(([k, v]) => [k, { saved: v.saved, exported: v.exported, with_image: v.media }]));
report.steps.pairs_complete = (() => { const l = listing(); return l.filter((x) => x.endsWith(".ready.json")).length === l.filter((x) => !x.endsWith(".ready.json")).length; })();

report.steps.site_serves_all_three = await until(async () => (await status(A)) === 200 && (await status(B)) === 200 && (await status(C)) === 200);
for (const [w, h] of [[1440, 900], [390, 844]]) {
  const p = await (await browser.newContext({ viewport: { width: w, height: h } })).newPage(); p.setDefaultTimeout(20000);
  await p.goto(`${SITE}/p/${A}`);
  const bar = await p.$$eval('[data-testid="universe-bar"] a', (as) => as.map((a) => a.getAttribute("href")));
  const ours = [A, B, C].map((s) => bar.indexOf(`/p/${s}`));
  const heroButton = (await p.locator('[data-testid="section-hero"] a').first().innerText()).trim();
  const img = p.locator('[data-testid="section-text-image"] img').first();
  await p.screenshot({ path: `${OUT}/champs-${w}.png`, fullPage: true });
  const pageB = await p.context().newPage(); await pageB.goto(`${SITE}/p/${B}`);
  report.steps[`fields_${w}`] = {
    bar_order_B_before_A: ours[1] >= 0 && ours[0] >= 0 && ours[1] < ours[0],
    bar_excludes_C_hidden_from_bar: ours[2] === -1,
    hero_label_custom_on_A: heroButton === "Voir la sélection",
    hero_label_default_on_B: (await pageB.locator('[data-testid="section-hero"] a').first().innerText()).trim() === "Découvrir",
    image_alt_on_A: pages.A.media ? (await img.getAttribute("alt")) === ALT : "no_media_in_catalogue",
    global_overflow_px: await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
  };
  await p.context().close();
}
report.steps.C_hidden_from_bar_but_served = (await status(C)) === 200;

// retrait des trois pages
for (const key of ["A", "B", "C"]) {
  const n = listing().length;
  await op.goto(pages[key].editUrl);
  await op.click('button:has-text("Dépublier dans le prochain export")'); await op.waitForLoadState("load").catch(() => {});
  await until(() => listing().length >= n + 2);
}
report.steps.all_three_return_404 = await until(async () => (await status(A)) === 404 && (await status(B)) === 404 && (await status(C)) === 404);
fs.writeFileSync(REPORT, JSON.stringify(report, null, 1));
console.log(JSON.stringify(report, null, 1));
await browser.close();
