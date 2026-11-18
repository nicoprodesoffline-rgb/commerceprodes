// S1-A — contrôles au navigateur des derniers lots : « ajouter tout au panier » des favoris, squelette de recherche, icône d'onglet, limite d'envois.
// Variables : SITE, REPORT, PLAYWRIGHT_DIR, CHROMIUM. Le JSON ne garde que des booléens et des statuts.
import { createRequire } from "node:module";
import fs from "node:fs";
const { SITE, REPORT, PLAYWRIGHT_DIR, CHROMIUM } = process.env;
const { chromium } = createRequire(`${PLAYWRIGHT_DIR}/`)("playwright");
const browser = await chromium.launch({ executablePath: CHROMIUM, headless: true });
const report = { checks: {} };
const probe = await (await browser.newContext()).newPage();
await probe.goto(`${SITE}/recherche`);
const slugs = await probe.$$eval('ul[aria-label="Familles du catalogue"] > li > a', (as) => as.map((a) => a.getAttribute("href").replace("/famille/", "")));
await probe.context().close();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage(); p.setDefaultTimeout(20000);
await p.goto(`${SITE}/`);
await p.evaluate((s) => localStorage.setItem("prodes_wishlist", JSON.stringify(s)), slugs.slice(0, 3));
await p.goto(`${SITE}/favoris`);
await p.getByRole("button", { name: /Ajouter tout au panier/ }).click();
await p.waitForSelector('[data-testid="cart-drawer"][open]');
await p.waitForFunction(() => document.querySelectorAll('[data-testid="drawer-line"]').length >= 2);
report.checks.wishlist_add_all_opens_the_drawer_with_lines = (await p.locator('[data-testid="drawer-line"]').count()) >= 2;
await p.keyboard.press("Escape");
// icône d'onglet
await p.goto(`${SITE}/`);
report.checks.tab_icon_declared = (await p.locator('link[rel~="icon"][href*="logo-prodes"]').count()) >= 1;
// squelette de recherche : la page répond 200 ; une catégorie inconnue reste un vrai 404
report.checks.search_status_200 = (await fetch(`${SITE}/recherche`)).status === 200;
report.checks.unknown_category_still_404 = (await fetch(`${SITE}/categorie/inconnue-xyz`)).status === 404;
report.checks.unknown_family_still_404 = (await fetch(`${SITE}/famille/inconnue-xyz`)).status === 404;
// limite d'envois : une rafale sur la recherche instantanée finit par répondre 429 avec un corps JSON échappé et un délai
let limited = null;
for (let i = 0; i < 140 && !limited; i++) {
  const r = await fetch(`${SITE}/api/site/search?q=chaise`, { headers: { "x-forwarded-for": "203.0.113.77" } });
  if (r.status === 429) limited = { status: r.status, retry_after: r.headers.get("retry-after"), json: (r.headers.get("content-type") ?? "").startsWith("application/json") };
}
report.checks.rate_limit_returns_429_with_retry_after = !!limited && Number(limited.retry_after) > 0 && limited.json;
report.checks.other_address_not_limited = (await fetch(`${SITE}/api/site/search?q=chaise`, { headers: { "x-forwarded-for": "203.0.113.78" } })).status === 200;
fs.writeFileSync(REPORT, JSON.stringify(report, null, 1));
console.log(JSON.stringify(report, null, 1));
await browser.close();
