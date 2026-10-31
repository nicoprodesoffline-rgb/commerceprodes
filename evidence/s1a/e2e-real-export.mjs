// S1-A — bout en bout RÉEL du contenu éditorial : page créée et exportée dans l'éditeur de la Factory, lue par le site, puis dépubliée.
// Le script n'ÉCRIT dans le dossier d'export de la Factory que par les boutons de l'éditeur (jamais directement) ; il y fait une lecture de liste.
// Variables : FACTORY (adresse de la Factory), SITE (adresse du site qui lit le dossier), OUTBOX (dossier d'export, lecture seule), PASSWORD_FILE, OUT (PNG, hors dépôt), REPORT, PLAYWRIGHT_DIR, CHROMIUM.
import { createRequire } from "node:module";
import fs from "node:fs";
const { FACTORY, SITE, OUTBOX, PASSWORD_FILE, OUT, REPORT, PLAYWRIGHT_DIR, CHROMIUM } = process.env;
const { chromium } = createRequire(`${PLAYWRIGHT_DIR}/`)("playwright");
fs.mkdirSync(OUT, { recursive: true });
const SLUG = `demo-bout-en-bout-${Date.now().toString(36)}`;
const report = { steps: {}, screens: [] };
const listing = () => { try { return fs.readdirSync(OUTBOX).sort(); } catch { return []; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(check, ms = 20000) { const t = Date.now(); while (Date.now() - t < ms) { if (await check()) return true; await sleep(1000); } return false; }

const browser = await chromium.launch({ executablePath: CHROMIUM, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const op = await ctx.newPage(); op.setDefaultTimeout(30000);
await op.goto(`${FACTORY}/operator/login/`);
await op.fill('input[name="username"]', "operatrice-demo");
await op.fill('input[name="password"]', fs.readFileSync(PASSWORD_FILE, "utf8").trim());
await Promise.all([op.waitForNavigation(), op.click('button[type="submit"], input[type="submit"]')]);

// 1. création de la page (hero + grille de catégories + carrousel de familles)
const before = listing();
await op.goto(`${FACTORY}/operator/site/contenus/creer/`);
await op.fill("#id_slug", "/" + SLUG);
await op.fill("#id_title", "Page de démonstration bout en bout");
const firstOption = async (sel) => op.$eval(sel, (s) => [...s.options].map((o) => o.value).find((v) => v !== "") ?? null);
await op.selectOption("#id_sections-0-kind", "hero");
await op.fill("#id_sections-0-title", "Collectivités en démonstration");
await op.fill("#id_sections-0-text", "Texte de démonstration\nsur deux lignes <b>échappé</b>");
await op.fill("#id_sections-0-link", "/recherche");
await op.fill("#id_sections-0-ORDER", "1");
// le formulaire propose déjà 2 sections ; un seul ajout donne les 3 voulues (aucune section vide en trop)
await op.selectOption("#id_sections-1-kind", "category_grid");
const cat = await firstOption("#id_sections-1-categories"); report.steps.category_available = !!cat;
if (cat) await op.selectOption("#id_sections-1-categories", cat);
await op.fill("#id_sections-1-ORDER", "2");
await op.click("#site-add-section");
await op.selectOption("#id_sections-2-kind", "product_carousel");
const fam = await firstOption("#id_sections-2-families"); report.steps.family_available = !!fam;
if (fam) await op.selectOption("#id_sections-2-families", fam);
await op.fill("#id_sections-2-ORDER", "3");
await op.click('button:has-text("Enregistrer la page")');
await op.waitForLoadState("load").catch(() => {});
await sleep(1500);
report.steps.save_diagnostic = { saved_on_edit_page: /\/site\/contenus\/[0-9a-f-]{36}\/$/.test(op.url()), invalid_fields: await op.$$eval(":invalid", (els) => els.map((e) => e.id || e.name)), errors: await op.$$eval(".notice.error, .errorlist, [role=alert]", (els) => els.map((e) => (e.closest("div,fieldset,p")?.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 200))), total_forms: await op.inputValue("#id_sections-TOTAL_FORMS") };
console.log("SAVE", JSON.stringify(report.steps.save_diagnostic)); await op.screenshot({ path: `${OUT}/enregistrement.png`, fullPage: true });
report.steps.page_saved = /\/site\/contenus\/[0-9a-f-]{36}\/$/.test(op.url());
const editUrl = op.url();

// 2. export manuel
await op.click('button:has-text("Exporter la version enregistrée")');
await op.waitForLoadState("load").catch(() => {}); await sleep(1500);
report.steps.export_diagnostic = { errors: await op.$$eval(".notice.error, .errorlist, [role=alert]", (els) => els.map((e) => e.textContent.trim().slice(0, 200))), notice: await op.$$eval(".notice", (els) => els.map((e) => e.textContent.trim().slice(0, 140))) };
report.steps.export_files_appeared = await until(() => listing().length >= before.length + 2);
const afterPublish = listing();
report.steps.document_and_receipt_pair = afterPublish.filter((n) => n.endsWith(".ready.json")).length === afterPublish.filter((n) => !n.endsWith(".ready.json")).length && afterPublish.length > before.length;

// 3. lecture par le site
const siteVisible = await until(async () => (await fetch(`${SITE}/p/${SLUG}`)).status === 200, 25000);
report.steps.site_serves_the_page = siteVisible;
for (const [w, h] of [[1440, 900], [390, 844]]) {
  const p = await (await browser.newContext({ viewport: { width: w, height: h } })).newPage(); p.setDefaultTimeout(20000);
  const res = await p.goto(`${SITE}/p/${SLUG}`);
  const body = await p.locator("main").innerText();
  report.steps[`page_${w}`] = {
    status: res.status(),
    hero: (await p.getByTestId("section-hero").count()) === 1,
    category_grid: (await p.getByTestId("section-category-grid").count()) === 1,
    product_carousel: (await p.getByTestId("section-product-carousel").count()) === 1,
    text_escaped: body.includes("<b>échappé</b>") && (await p.locator("main b").count()) === 0,
    universe_bar_lists_it: (await p.locator(`[data-testid="universe-bar"] a[href="/p/${SLUG}"]`).count()) === 1,
    global_overflow_px: await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
  };
  await p.screenshot({ path: `${OUT}/page-publiee-${w}.png`, fullPage: true });
  await p.context().close();
}

// 4. retrait
await op.goto(editUrl);
await op.click('button:has-text("Dépublier dans le prochain export")');
await op.waitForLoadState("load").catch(() => {}); await sleep(1500);
report.steps.second_generation_written = await until(() => listing().length >= afterPublish.length + 2);
report.steps.site_returns_404_after_unpublish = await until(async () => (await fetch(`${SITE}/p/${SLUG}`)).status === 404, 25000);
for (const [w, h] of [[1440, 900], [390, 844]]) {
  const p = await (await browser.newContext({ viewport: { width: w, height: h } })).newPage();
  const res = await p.goto(`${SITE}/p/${SLUG}`);
  report.steps[`retired_${w}`] = { status: res.status(), universe_bar_no_longer_lists_it: (await p.locator(`[data-testid="universe-bar"] a[href="/p/${SLUG}"]`).count()) === 0, global_overflow_px: await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth) };
  await p.screenshot({ path: `${OUT}/page-retiree-${w}.png`, fullPage: true });
  await p.context().close();
}
fs.writeFileSync(REPORT, JSON.stringify(report, null, 1));
console.log(JSON.stringify(report, null, 1));
await browser.close();
