// S1-A I4 — tiroir du panier, commande rapide, FAQ, contact, mentions provisoires, gamme PRO-INTENS : comportements au navigateur et captures 1440 / 1024 / 390 (PNG hors dépôt).
// Le JSON versionné ne garde que des booléens, des compteurs et des pixels. Variables : SITE, OUT, REPORT, PLAYWRIGHT_DIR, CHROMIUM.
import { createRequire } from "node:module";
import fs from "node:fs";
const { SITE, OUT, REPORT, PLAYWRIGHT_DIR, CHROMIUM } = process.env;
const { chromium } = createRequire(`${PLAYWRIGHT_DIR}/`)("playwright");
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: CHROMIUM, headless: true });
const report = { screens: [], checks: {} };
const overflow = (p) => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

const probe = await (await browser.newContext()).newPage();
await probe.goto(`${SITE}/recherche`);
const slugs = await probe.$$eval('ul[aria-label="Familles du catalogue"] > li > a', (as) => as.map((a) => a.getAttribute("href").replace("/famille/", "")));
await probe.goto(`${SITE}/famille/${slugs[0]}`);
const ref = await probe.$$eval("[data-testid=item-ref]", (els) => els[0]?.textContent?.trim() ?? "");
await probe.context().close();
report.checks.families_available = slugs.length;

async function addFromFiche(p, slug) {
  await p.goto(`${SITE}/famille/${slug}`);
  await p.getByRole("button", { name: /^Ajouter au panier/ }).first().click();
}

for (const [w, h] of [[1440, 900], [1024, 768], [390, 844]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const p = await ctx.newPage(); p.setDefaultTimeout(20000);
  for (const [name, path] of [["faq", "/faq"], ["contact", "/contact"], ["mentions", "/mentions-legales"], ["gamme", "/gamme-pro-intens"], ["panier-vide", "/panier"]]) {
    const res = await p.goto(`${SITE}${path}`); await p.waitForLoadState("load"); await p.waitForTimeout(500);
    await p.screenshot({ path: `${OUT}/${name}-${w}.png`, fullPage: true });
    report.screens.push({ screen: name, width: w, status: res.status(), global_overflow_px: await overflow(p) });
  }
  // tiroir : ouvert par l'ajout, deux familles
  await addFromFiche(p, slugs[1]);
  await p.waitForSelector('[data-testid="cart-drawer"][open]');
  await addFromFiche(p, slugs[0]);
  await p.waitForSelector('[data-testid="drawer-line"]');
  await p.waitForFunction(() => document.querySelectorAll('[data-testid="drawer-line"]').length === 2);
  await p.waitForTimeout(900);
  await p.screenshot({ path: `${OUT}/tiroir-${w}.png`, fullPage: false });
  report.screens.push({ screen: "tiroir", width: w, global_overflow_px: await overflow(p) });
  if (w === 1440) {
    report.checks.drawer_opens_on_add = true;
    const names = await p.$$eval('[data-testid="drawer-line"] a', (as) => as.map((a) => a.textContent.trim()));
    report.checks.drawer_lines_alphabetical = names.length === 2 && names[0].localeCompare(names[1], "fr", { sensitivity: "base" }) <= 0;
    await p.locator('[data-testid="drawer-line"]').first().getByRole("button", { name: "Augmenter la quantité" }).click();
    await p.waitForTimeout(500);
    report.checks.drawer_plus_changes_quantity = (await p.locator('[data-testid="drawer-line"] .tabular').first().innerText()).trim() === "2";
    report.checks.drawer_total_from_server = /€|Vérification|Selon devis/.test(await p.getByTestId("drawer-total").innerText());
    report.checks.drawer_has_next_step_and_full_cart = ((await p.getByTestId("drawer-order").count()) + (await p.getByTestId("drawer-quote").count())) === 1 && (await p.getByRole("link", { name: "Voir le panier complet" }).count()) === 1;
    await p.keyboard.press("Escape");
    report.checks.drawer_escape_closes = (await p.locator('[data-testid="cart-drawer"][open]').count()) === 0;
    await p.getByTestId("cart-button").click();
    await p.waitForSelector('[data-testid="cart-drawer"][open]');
    await p.keyboard.press("Escape");
    report.checks.drawer_focus_returns_to_cart_button = await p.evaluate(() => document.activeElement?.getAttribute("data-testid") === "cart-button");
    await p.getByTestId("cart-button").click();
    await p.waitForSelector('[data-testid="cart-drawer"][open]');
    await p.mouse.click(10, 300);
    report.checks.drawer_click_outside_closes = (await p.locator('[data-testid="cart-drawer"][open]').count()) === 0;
    await p.getByTestId("cart-button").click();
    await p.getByRole("button", { name: "Fermer le panier" }).click();
    report.checks.drawer_cross_closes = (await p.locator('[data-testid="cart-drawer"][open]').count()) === 0;
    await p.getByTestId("cart-button").click();
    await p.getByRole("button", { name: /^Retirer .* du panier$/ }).first().click();
    await p.getByRole("button", { name: /^Retirer .* du panier$/ }).first().click();
    report.checks.drawer_empty_state_after_removals = await p.getByTestId("drawer-empty").isVisible();
    await p.keyboard.press("Escape");
    // sans panier, l'ouverture ne demande aucun aperçu serveur
    // Échap sur un tiroir ouvert par « Ajouter au panier » : le focus revient à CE bouton
    await p.goto(`${SITE}/famille/${slugs[2]}`);
    await p.getByRole("button", { name: /^Ajouter au panier/ }).first().click();
    await p.waitForSelector('[data-testid="cart-drawer"][open]');
    await p.keyboard.press("Escape");
    await p.waitForTimeout(200);
    report.checks.drawer_focus_returns_to_add_button = await p.evaluate(() => /^Ajouter au panier/.test(document.activeElement?.textContent?.trim() ?? ""));
    // FAQ : accordéon exclusif
    await p.goto(`${SITE}/faq`);
    const details = p.locator("details[name=faq]");
    await details.nth(0).locator("summary").click(); await details.nth(1).locator("summary").click();
    report.checks.faq_one_open_at_a_time = (await p.locator("details[name=faq][open]").count()) === 1;
    // commande rapide
    await p.goto(`${SITE}/recherche`);
    await p.fill('[data-testid="quick-order"] input', "n'importe quoi"); await p.click('[data-testid="quick-order"] button');
    report.checks.quick_order_refuses_bad_reference = await p.locator('[data-testid="quick-order"] [role="alert"]').isVisible();
    if (ref) {
      await p.fill('[data-testid="quick-order"] input', ref.toLowerCase()); await p.click('[data-testid="quick-order"] button');
      report.checks.quick_order_opens_the_variant = await p.waitForURL(new RegExp(`/famille/.*article=${ref}`), { timeout: 15000 }).then(() => true, () => false);
    }
    // pages provisoires : dites telles quelles
    await p.goto(`${SITE}/mentions-legales`);
    report.checks.legal_page_is_provisional_and_noindex = (await p.getByTestId("legal-provisional").count()) === 1 && (await p.locator('meta[name="robots"][content*="noindex"]').count()) >= 1;
    await p.goto(`${SITE}/contact`);
    const contactText = await p.locator("main").innerText();
    report.checks.contact_has_no_hardcoded_phone_or_email = !/\b0\d(?:[ .]?\d{2}){4}\b/.test(contactText) && !/@/.test(contactText);
    await p.goto(`${SITE}/gamme-pro-intens`);
    const gamme = await p.locator("main").innerText();
    report.checks.gamme_no_warranty_claim = !/10 ans|garantie/i.test(gamme);
    report.checks.gamme_arguments_kept_C8 = /NF certifié/.test(gamme) && /Chorus Pro/.test(gamme);
    report.checks.gamme_empty_or_listed = (await p.getByTestId("gamme-empty").count()) + (await p.getByTestId("gamme-count").count()) === 1;
  }
  await ctx.close();
}
{ // sans script : « Panier » mène à la page panier
  const p = await (await browser.newContext({ javaScriptEnabled: false })).newPage();
  await p.goto(`${SITE}/`); await Promise.all([p.waitForNavigation(), p.click('[data-testid="cart-button"]')]);
  report.checks.without_script_cart_button_goes_to_cart_page = p.url().endsWith("/panier");
}
fs.writeFileSync(REPORT, JSON.stringify(report, null, 1));
console.log(JSON.stringify({ screens: report.screens.length, overflow_max_px: Math.max(...report.screens.map((s) => s.global_overflow_px)), checks: report.checks }, null, 1));
await browser.close();
