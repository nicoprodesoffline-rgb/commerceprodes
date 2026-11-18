// S1-A I2 — accueil, catalogue, recherche, catégorie en 1440 / 1024 / 390 ; filtre de prix, tri, pages, recherche instantanée (clavier). Les PNG (catalogue publié local) restent HORS dépôt.
// Le JSON versionné ne garde que des booléens, des compteurs et des pixels (jamais un nom, une référence ni un montant).
// Variables : SITE, OUT, REPORT, PLAYWRIGHT_DIR, CHROMIUM.
import { createRequire } from "node:module";
import fs from "node:fs";
const { SITE, OUT, REPORT, PLAYWRIGHT_DIR, CHROMIUM } = process.env;
const { chromium } = createRequire(`${PLAYWRIGHT_DIR}/`)("playwright");
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: CHROMIUM, headless: true });
const report = { screens: [], checks: {} };
const overflow = (p) => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const amounts = (p) => p.$$eval('[data-testid="family-price"] .tabular', (els) => els.map((e) => Number(e.textContent.replace(/[^0-9,]/g, "").replace(",", "."))));

for (const [w, h] of [[1440, 900], [1024, 768], [390, 844]]) {
  const p = await (await browser.newContext({ viewport: { width: w, height: h } })).newPage(); p.setDefaultTimeout(30000);
  await p.goto(`${SITE}/`);
  const category = await p.$$eval('a[href^="/categorie/"]', (as) => as.map((a) => a.getAttribute("href"))[0] ?? null);
  const targets = [["accueil", "/"], ["catalogue", "/recherche"], ["recherche-tri-prix", "/recherche?tri=prix-croissant&prix_min=1"], ["recherche-vide", "/recherche?q=zzzzzzzz"]];
  if (category) targets.push(["categorie", category]);
  for (const [name, path] of targets) {
    const res = await p.goto(`${SITE}${path}`); await p.waitForLoadState("load");
    await p.screenshot({ path: `${OUT}/${name}-${w}.png`, fullPage: true });
    report.screens.push({ screen: name, width: w, status: res.status(), global_overflow_px: await overflow(p) });
  }
  if (w === 1440) {
    await p.goto(`${SITE}/recherche?tri=prix-croissant`);
    const asc = await amounts(p); report.checks.sort_ascending_ok = asc.length > 1 && asc.every((v, i) => i === 0 || v >= asc[i - 1]);
    await p.goto(`${SITE}/recherche?tri=prix-decroissant`);
    const desc = await amounts(p); report.checks.sort_descending_ok = desc.length > 1 && desc.every((v, i) => i === 0 || v <= desc[i - 1]);
    const middle = asc.length > 2 ? asc[1] : null;
    if (middle !== null) {
      await p.goto(`${SITE}/recherche?prix_min=${middle}&prix_max=${middle}`);
      const only = await amounts(p); report.checks.price_filter_keeps_only_the_range = only.length >= 1 && only.every((v) => v === middle);
    }
    await p.goto(`${SITE}/recherche?prix_min=abc`);
    report.checks.refused_price_is_said = (await p.locator('[role="note"]').count()) > 0;
    await p.goto(`${SITE}/recherche?prix_min=1&tri=prix-croissant`);
    report.checks.active_filter_chip_shown = (await p.locator('[data-testid="active-filters"] li').count()) === 1;
    await p.click('a:has-text("Effacer")');
    report.checks.clear_resets_filters = await p.waitForURL((u) => !u.href.includes("prix_min"), { timeout: 8000 }).then(() => true, () => false);
    // recherche instantanée
    await p.goto(`${SITE}/`); await p.waitForTimeout(800);
    await p.click("#q-header"); await p.keyboard.type("ch", { delay: 60 });
    await p.waitForSelector('[role="option"]', { timeout: 10000 });
    report.checks.live_options = await p.locator('[role="option"]').count();
    await p.keyboard.press("ArrowDown");
    report.checks.live_arrow_selects_one = (await p.locator('[role="option"][aria-selected="true"]').count()) === 1 && !!(await p.getAttribute("#q-header", "aria-activedescendant"));
    await p.keyboard.press("Escape");
    report.checks.live_escape_closes_keeps_text = (await p.locator('[data-testid="live-search-panel"]').isHidden()) && (await p.inputValue("#q-header")) === "ch";
    await p.click('button[aria-label="Effacer la recherche"]');
    report.checks.live_clear_empties = (await p.inputValue("#q-header")) === "";
    await p.keyboard.type("zzzzzz", { delay: 40 });
    await p.waitForFunction(() => document.querySelector('[data-testid="live-search-panel"] [role="status"]')?.textContent.includes("Aucun résultat"), null, { timeout: 10000 });
    await p.keyboard.press("Enter"); await p.waitForURL(/\/recherche\?q=zzzzzz/);
    report.checks.live_enter_goes_to_results_page = true;
  }
  if (w === 390) {
    await p.goto(`${SITE}/recherche`);
    report.checks.mobile_category_pills_visible = await p.locator('[data-testid="category-pills"]').isVisible();
    report.checks.mobile_sidebar_hidden = !(await p.locator('[data-testid="category-sidebar"]').isVisible());
  } else {
    await p.goto(`${SITE}/recherche`);
    report.checks[`sidebar_visible_${w}`] = await p.locator('[data-testid="category-sidebar"]').isVisible();
  }
  await p.context().close();
}
{ // sans script : le formulaire de filtres et la recherche fonctionnent par de simples envois GET
  const p = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, javaScriptEnabled: false })).newPage();
  await p.goto(`${SITE}/recherche`);
  await p.fill('input[name="prix_min"]', "1"); await p.selectOption('select[name="tri"]', "prix-decroissant");
  await Promise.all([p.waitForNavigation(), p.click('button:has-text("Appliquer")')]);
  report.checks.without_script_filters_apply = p.url().includes("prix_min=1") && p.url().includes("tri=prix-decroissant");
  await p.fill("#q-header", "ch"); await Promise.all([p.waitForNavigation(), p.keyboard.press("Enter")]);
  report.checks.without_script_search_goes_to_results = p.url().includes("/recherche?q=ch");
}
fs.writeFileSync(REPORT, JSON.stringify(report, null, 1));
console.log(JSON.stringify({ screens: report.screens.length, overflow_max_px: Math.max(...report.screens.map((s) => s.global_overflow_px)), statuses: [...new Set(report.screens.map((s) => s.status))], checks: report.checks }, null, 1));
await browser.close();
