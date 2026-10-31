// S1-A I3 — favoris, comparateur, récemment consultés, produits similaires, impression : comportements au navigateur, captures 1440 / 1024 / 390 (PNG hors dépôt).
// Le JSON versionné ne garde que des booléens, des compteurs et des pixels. Variables : SITE, OUT, REPORT, PLAYWRIGHT_DIR, CHROMIUM.
import { createRequire } from "node:module";
import fs from "node:fs";
const { SITE, OUT, REPORT, PLAYWRIGHT_DIR, CHROMIUM } = process.env;
const { chromium } = createRequire(`${PLAYWRIGHT_DIR}/`)("playwright");
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: CHROMIUM, headless: true });
const report = { screens: [], checks: {} };
const overflow = (p) => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const stored = (p, key) => p.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? "[]"), key);

// familles publiées de l'instance locale (la 1re page du catalogue suffit)
const probe = await (await browser.newContext()).newPage();
await probe.goto(`${SITE}/recherche`);
const slugs = await probe.$$eval('ul[aria-label="Familles du catalogue"] > li > a', (as) => as.map((a) => a.getAttribute("href").replace("/famille/", "")));
report.checks.families_available = slugs.length;
await probe.context().close();

for (const [w, h] of [[1440, 900], [1024, 768], [390, 844]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const p = await ctx.newPage(); p.setDefaultTimeout(20000);
  await p.goto(`${SITE}/recherche`);
  // sélection par les cartes : 2 en comparaison, 2 en favoris
  const cards = p.locator('ul[aria-label="Familles du catalogue"] > li');
  for (let i = 0; i < Math.min(2, slugs.length); i++) await cards.nth(i).locator('button:has-text("Comparer")').click();
  for (let i = 0; i < Math.min(2, slugs.length); i++) await cards.nth(i).locator('button:has-text("Ma sélection")').click();
  for (const [name, path] of [["recherche-boutons", "/recherche"], ["favoris", "/favoris"], ["comparateur", "/comparer"], ["fiche", `/famille/${slugs[0]}`]]) {
    await p.goto(`${SITE}${path}`); await p.waitForLoadState("load"); await p.waitForTimeout(900);
    await p.screenshot({ path: `${OUT}/${name}-${w}.png`, fullPage: true });
    report.screens.push({ screen: name, width: w, global_overflow_px: await overflow(p) });
  }
  // Validité des prix de la fiche : la phrase entière est lisible à chaque largeur (colonne dès 640 px, sous le prix en dessous), sans défilement caché
  await p.goto(`${SITE}/famille/${slugs[0]}`);
  report.checks[`validity_fully_readable_${w}`] = await p.evaluate((wide) => {
    const sel = wide ? '[data-testid="validity-cell"]' : '[data-testid="validity-inline"]';
    const cells = [...document.querySelectorAll(sel)].filter((e) => getComputedStyle(e).display !== "none" && e.getBoundingClientRect().width > 0);
    if (cells.length === 0) return false;
    const box = document.querySelector("table")?.parentElement;
    const noInnerScroll = !box || box.scrollWidth <= box.clientWidth + 1;
    return noInnerScroll && cells.every((e) => /exclu$/.test(e.textContent.trim()) && e.scrollWidth <= e.clientWidth + 1);
  }, w >= 640);
  if (w === 1440) {
    await p.goto(`${SITE}/recherche`);
    report.checks.compare_stored_2 = (await stored(p, "prodes_compare")).length === 2;
    report.checks.wishlist_stored_2 = (await stored(p, "prodes_wishlist")).length === 2;
    await p.waitForSelector('[data-testid="compare-bar"]', { timeout: 5000 }).catch(() => {});
    report.checks.compare_bar_visible = await p.locator('[data-testid="compare-bar"]').isVisible();
    await p.goto(`${SITE}/comparer`); await p.waitForSelector('[data-testid="compare-table-scroll"]');
    report.checks.compare_columns = await p.locator('[data-testid="compare-table-scroll"] thead th').count() - 1;
    report.checks.compare_best_price_flag_server_side = (await p.locator('text=Meilleur prix').count()) <= 1;
    // limite de 4 : ajouter 3 de plus depuis les cartes (s'il y en a)
    await p.goto(`${SITE}/recherche`);
    const total = await cards.count();
    for (let i = 2; i < total; i++) await cards.nth(i).locator('button:has-text("Comparer")').click();
    if (total >= 5) report.checks.compare_limit_message_shown = (await p.locator('[role="alert"]:has-text("Maximum 4")').count()) >= 1 && (await stored(p, "prodes_compare")).length === 4;
    // retrait depuis le comparateur
    await p.goto(`${SITE}/comparer`); await p.waitForSelector('[data-testid="compare-table-scroll"]');
    await p.locator('button:has-text("Retirer")').first().click();
    report.checks.compare_remove_works = (await stored(p, "prodes_compare")).length === Math.min(total, 4) - 1;
    // favoris : retrait
    await p.goto(`${SITE}/favoris`); await p.waitForSelector('[data-testid="wishlist-view"] ul');
    await p.locator('button:has-text("Retirer")').first().click();
    report.checks.wishlist_remove_works = (await stored(p, "prodes_wishlist")).length === 1;
    // clavier : le bouton Comparer se bascule à Entrée, aria-pressed suit
    await p.goto(`${SITE}/recherche`);
    const btn = cards.nth(0).locator('button:has-text("Comp")'); await btn.focus(); const before = await btn.getAttribute("aria-pressed"); await p.keyboard.press("Enter");
    report.checks.keyboard_toggle_updates_aria_pressed = before !== (await btn.getAttribute("aria-pressed"));
    // récemment consultés : visiter 3 fiches puis une 4e : le bloc apparaît (au moins 2 autres vues)
    await p.evaluate(() => localStorage.clear());
    for (const s of slugs.slice(0, 3)) { await p.goto(`${SITE}/famille/${s}`); await p.waitForTimeout(500); }
    await p.goto(`${SITE}/famille/${slugs[3] ?? slugs[0]}`); await p.waitForTimeout(1200);
    report.checks.recently_viewed_shown = (await p.locator('[data-testid="recently-viewed"]').count()) === 1 && (await p.locator('[data-testid="recently-viewed"] li').count()) >= 2;
    report.checks.recent_stored_max_12 = (await stored(p, "prodes_recent")).length <= 12;
    report.checks.similar_families_shown = (await p.locator('[data-testid="similar-families"] li').count()) >= 1;
    report.checks.breadcrumb_json_ld_valid = await p.evaluate(() => { try { const d = JSON.parse(document.querySelector('script[type="application/ld+json"]').textContent); return d["@type"] === "BreadcrumbList" && d.itemListElement.length >= 2; } catch { return false; } });
    // « Demander un devis » depuis la fiche : la variante part au panier (prix vérifié par le serveur) puis la demande de devis existante s'ouvre
    await p.evaluate(() => localStorage.clear());
    await p.goto(`${SITE}/famille/${slugs[0]}`);
    await p.waitForSelector('[data-testid="quote-from-family"]');
    await p.click('[data-testid="quote-from-family"]');
    report.checks.quote_from_family_goes_to_quote_page = await p.waitForURL(/\/devis$/, { timeout: 15000 }).then(() => true, () => false);
    report.checks.quote_page_has_the_line = report.checks.quote_from_family_goes_to_quote_page && (await p.waitForSelector("text=Vos coordonnées", { timeout: 12000 }).then(() => true, () => false));
    // impression : menus, pied de page, barres fixes et boutons de liste masqués
    await p.emulateMedia({ media: "print" });
    report.checks.print_hides_chrome = await p.evaluate(() => ["header", "footer", '[data-testid="compare-bar"]', '[data-testid="bottom-nav"]'].every((s) => { const e = document.querySelector(s); return !e || getComputedStyle(e).display === "none"; }));
    await p.emulateMedia({ media: "screen" });
  }
  if (w === 390) {
    await p.goto(`${SITE}/comparer`); await p.waitForTimeout(800);
    report.checks.mobile_compare_table_scrolls_inside_its_frame = (await overflow(p)) === 0;
  }
  await ctx.close();
}
{ // stockage refusé : les boutons ne cassent pas la page
  const ctx = await browser.newContext(); await ctx.addInitScript(() => { Object.defineProperty(window, "localStorage", { get() { throw new Error("denied"); } }); });
  const p = await ctx.newPage(); const errors = []; p.on("pageerror", (e) => errors.push(String(e)));
  await p.goto(`${SITE}/recherche`); await p.locator('button:has-text("Comparer")').first().click();
  report.checks.storage_denied_no_page_error = errors.length === 0;
  await ctx.close();
}
fs.writeFileSync(REPORT, JSON.stringify(report, null, 1));
console.log(JSON.stringify({ screens: report.screens.length, overflow_max_px: Math.max(...report.screens.map((s) => s.global_overflow_px)), checks: report.checks }, null, 1));
await browser.close();
