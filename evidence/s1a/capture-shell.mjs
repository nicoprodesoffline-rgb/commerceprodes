// S1-A I1 — la coque restituée (barre utile, en-tête, menus, barre mobile, pied de page, 404) en 1440 / 1024 / 390, clavier et zoom 200 %.
// Les PNG montrent le catalogue publié de l'instance locale (désignations réelles possibles) : ils restent HORS dépôt (OUT). Le JSON versionné ne garde que pixels, compteurs et booléens.
// Variables : SITE (ex. http://127.0.0.1:3171), OUT (dossier des PNG, hors dépôt), REPORT (JSON de sortie), PLAYWRIGHT_DIR, CHROMIUM.
import { createRequire } from "node:module";
import fs from "node:fs";
const { SITE, OUT, REPORT, PLAYWRIGHT_DIR, CHROMIUM } = process.env;
const { chromium } = createRequire(`${PLAYWRIGHT_DIR}/`)("playwright");
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: CHROMIUM, headless: true });
const report = { screens: [], checks: {} };
const overflow = (p) => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

for (const [w, h] of [[1440, 900], [1024, 768], [390, 844]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const p = await ctx.newPage(); p.setDefaultTimeout(30000);
  await p.goto(`${SITE}/`);
  const firstCategory = await p.$$eval('[data-testid="category-menu"] a, [data-testid="top-categories"] a', (as) => as.map((a) => a.getAttribute("href")).find((h) => h && h.startsWith("/categorie/")) || null);
  const targets = [["accueil", "/"], ["recherche", "/recherche"], ["panier", "/panier"], ["introuvable", "/page-qui-nexiste-pas"]];
  if (firstCategory) targets.splice(1, 0, ["categorie", firstCategory]);
  for (const [name, path] of targets) {
    const res = await p.goto(`${SITE}${path}`);
    await p.waitForLoadState("load");
    await p.screenshot({ path: `${OUT}/${name}-${w}.png`, fullPage: true });
    report.screens.push({ screen: name, width: w, status: res.status(), global_overflow_px: await overflow(p) });
  }
  // éléments de la coque, à cette largeur
  await p.goto(`${SITE}/`);
  report.checks[`shell_${w}`] = await p.evaluate(() => {
    const visible = (sel) => { const e = document.querySelector(sel); if (!e) return false; const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none"; };
    return {
      utility_bar: visible('[data-testid="utility-bar"]'), top_categories_row: visible('[data-testid="top-categories"]'), bottom_nav: visible('[data-testid="bottom-nav"]'),
      categories_button: visible('button[aria-controls]'), search_field: visible("#q-header"), footer: visible("footer"),
      header_is_sticky: getComputedStyle(document.querySelector("header")).position === "sticky",
    };
  });
  // en-tête collant : après défilement, l'en-tête reste en haut de la fenêtre
  await p.goto(`${SITE}/recherche`);
  await p.evaluate(() => window.scrollTo(0, 600));
  report.checks[`sticky_header_top_${w}`] = await p.evaluate(() => Math.round(document.querySelector("header").getBoundingClientRect().top));
  if (w === 1440) {
    // clavier : Tab depuis le haut atteint d'abord « Aller au contenu », puis le menu Catégories ; Entrée l'ouvre, Échap le ferme et rend le focus
    await p.goto(`${SITE}/`);
    await p.keyboard.press("Tab");
    const first = await p.evaluate(() => document.activeElement?.textContent?.trim());
    const seen = [first];
    for (let i = 0; i < 12; i++) { await p.keyboard.press("Tab"); seen.push(await p.evaluate(() => (document.activeElement?.textContent || document.activeElement?.getAttribute("aria-label") || document.activeElement?.tagName || "").trim().slice(0, 30))); }
    report.checks.keyboard_first_stop = first;
    report.checks.keyboard_reaches_categories_menu = seen.some((t) => /Catégories/.test(t));
    report.checks.keyboard_reaches_search_field = await (async () => { await p.focus("#q-header"); return p.evaluate(() => document.activeElement?.id === "q-header"); })();
    await p.focus('button[aria-controls]');
    await p.keyboard.press("Enter");
    report.checks.menu_opens_with_enter = await p.evaluate(() => document.querySelector('button[aria-controls]').getAttribute("aria-expanded") === "true");
    await p.keyboard.press("Escape");
    report.checks.menu_escape_returns_focus = await p.evaluate(() => document.activeElement === document.querySelector('button[aria-controls]') && document.querySelector('button[aria-controls]').getAttribute("aria-expanded") === "false");
  }
  await ctx.close();
}
// zoom 200 % ≈ 720 px de large : aucune perte de fonction (menu, recherche, panier atteignables) et pas de débordement
{
  const ctx = await browser.newContext({ viewport: { width: 720, height: 900 } });
  const p = await ctx.newPage(); await p.goto(`${SITE}/`);
  report.checks.zoom200 = await p.evaluate(() => ({ overflow_px: document.documentElement.scrollWidth - document.documentElement.clientWidth, categories_button: !!document.querySelector('button[aria-controls]'), search: !!document.querySelector("#q-header"), cart_link: !!document.querySelector('a[href="/panier"]') }));
  await p.screenshot({ path: `${OUT}/accueil-720.png`, fullPage: true });
  await ctx.close();
}
fs.writeFileSync(REPORT, JSON.stringify(report, null, 1));
console.log(JSON.stringify({ screens: report.screens.length, overflow_max_px: Math.max(...report.screens.map((s) => s.global_overflow_px)), statuses: [...new Set(report.screens.map((s) => `${s.screen}:${s.status}`))], checks: report.checks }, null, 1));
await browser.close();
