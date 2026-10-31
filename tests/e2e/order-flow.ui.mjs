// Recette réelle PostgreSQL + Chromium. Ce fichier n'est pas exécuté par les tests nav.
// Prérequis et commande complète : evidence/s1a/ORDER_FLOW_AUDIT.md.
// La base LOCALE dédiée prodes_site_order_flow_test est remise à zéro à chaque test.
import { after, before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../..");
// Aucune valeur par défaut : l'adresse (et ses identifiants) vient de l'environnement ; sans elle, arrêt clair (jamais un identifiant écrit dans le dépôt public).
if (!process.env.SITE_TEST_DATABASE_URL) {
  console.error("SITE_TEST_DATABASE_URL est obligatoire : adresse d'une base PostgreSQL LOCALE jetable dédiée à ce test (elle est remise à zéro).");
  process.exit(2);
}
const dbUrl = new URL(process.env.SITE_TEST_DATABASE_URL);
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(dbUrl.hostname), "PostgreSQL doit être local");
assert.equal(dbUrl.pathname, "/prodes_site_order_flow_test", "base dédiée exigée : prodes_site_order_flow_test (schéma public effacé)");
process.env.SITE_TEST_DATABASE_URL = dbUrl.toString();
const PORT = Number(process.env.SITE_TEST_PORT ?? 3371);
assert.ok(Number.isInteger(PORT) && PORT >= 1024 && PORT <= 65535, "SITE_TEST_PORT invalide");
assert.ok(process.env.PLAYWRIGHT_DIR && path.isAbsolute(process.env.PLAYWRIGHT_DIR), "PLAYWRIGHT_DIR absolu contenant playwright requis");
assert.ok(process.env.CHROMIUM && existsSync(process.env.CHROMIUM), "CHROMIUM doit désigner un exécutable existant");
const require = createRequire(path.join(process.env.PLAYWRIGHT_DIR, "/"));
const { chromium } = require("playwright");
const { fullFlow, loadCase, newPool, resetDb } = await import("../bc2/helpers.mjs");
const BASE = `http://127.0.0.1:${PORT}`;
const NOTICE = "Commande de test : aucun paiement, aucune livraison, aucune facture, aucun e-mail.";
const CONTACT = { organisation_name: "STAGING_FIXTURE Organisation test", contact_name: "STAGING_FIXTURE Contact test", email: "test@example.invalid" };
let browser, server, pool, exited = false, fixture;
const contexts = new Set();
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function answers() {
  try { await fetch(`${BASE}/api/site/receipt`, { signal: AbortSignal.timeout(500) }); return true; }
  catch { return false; }
}
async function activate(caseId) {
  const c = loadCase(caseId);
  const flow = await fullFlow(pool, c);
  assert.equal(flow.activated.headers["x-c0-outcome"], "ACTIVATED", caseId);
  return c.doc;
}

before(async () => {
  assert.ok(existsSync(path.join(ROOT, ".next/BUILD_ID")), "build Next préalable requis");
  assert.equal(await answers(), false, `port ${PORT} occupé`);
  pool = newPool(2);
  server = spawn(process.execPath, [path.join(ROOT, "node_modules/next/dist/bin/next"), "start", "-H", "127.0.0.1", "-p", String(PORT)], {
    cwd: ROOT,
    env: { PATH: process.env.PATH, HOME: process.env.HOME, NEXT_TELEMETRY_DISABLED: "1", SITE_ENV: "staging", SITE_NOW_UTC: "2026-10-20T09:00:00Z", SITE_DATABASE_URL: dbUrl.toString(), SITE_CATALOG_SOURCE: "db", SITE_BUSINESS_PERSISTENCE: "postgresql" },
    stdio: "ignore",
  });
  server.on("exit", () => { exited = true; });
  let spawnError;
  server.on("error", (error) => { spawnError = error; });
  const deadline = Date.now() + 30_000;
  while (!(await answers())) {
    if (spawnError) throw spawnError;
    assert.ok(!exited && Date.now() < deadline, "serveur non démarré en 30 secondes");
    await pause(150);
  }
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM, headless: true });
});
beforeEach(async () => {
  for (const ctx of contexts) await ctx.close();
  contexts.clear();
  await resetDb();
  fixture = await activate("F_SELL_WINDOWS.activate");
});
after(async () => {
  await browser?.close();
  if (server?.pid && !exited) {
    const done = new Promise((resolve) => server.once("exit", resolve));
    server.kill("SIGTERM");
    const timer = setTimeout(() => { if (!exited) server.kill("SIGKILL"); }, 10_000);
    await done;
    clearTimeout(timer);
  }
  await pool?.end();
});

async function page390() {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "fr-FR" });
  contexts.add(ctx);
  return ctx.newPage();
}
async function fits(page, label) {
  const sizes = await page.evaluate(() => ({ viewport: innerWidth, html: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
  assert.ok(sizes.html <= sizes.viewport && sizes.body <= sizes.viewport, `${label} : débordement global ${JSON.stringify(sizes)}`);
}
// Toutes les interactions utilisent Tab/Entrée/Espace/saisie clavier. Aucun click/focus programmatique.
async function tabTo(page, locator) {
  await locator.waitFor({ state: "visible" });
  for (let i = 0; i < 160; i++) {
    if (await locator.evaluate((el) => el === document.activeElement)) return;
    await page.keyboard.press("Tab");
  }
  assert.fail(`cible inaccessible au clavier : ${await locator.getAttribute("id")}`);
}
async function activateKey(page, locator, key = "Enter") {
  await tabTo(page, locator);
  await page.keyboard.press(key);
}
async function typeKey(page, locator, text) {
  await tabTo(page, locator);
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.insertText(text);
}
async function add(page, family, quantity = 1, item = family.items[0]) {
  await page.goto(`${BASE}/famille/${family.slug}?article=${item.public_item_key}`);
  await page.getByTestId("qty-price").waitFor();
  await fits(page, "fiche");
  await typeKey(page, page.getByRole("textbox", { name: "Quantité", exact: true }), String(quantity));
  const button = page.getByRole("button", { name: /^Ajouter au panier/ });
  await activateKey(page, button);
  await page.getByTestId("cart-drawer").waitFor({ state: "visible" });
  await fits(page, "tiroir");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector("dialog[open]"));
  await page.waitForFunction(() => document.activeElement?.textContent?.startsWith("Ajouter au panier"));
  assert.equal(await button.evaluate((el) => el === document.activeElement), true, "focus rendu à l'ajout");
}
async function cart(page) {
  await activateKey(page, page.getByTestId("cart-button"));
  await page.getByTestId("cart-drawer").waitFor({ state: "visible" });
  await activateKey(page, page.getByTestId("cart-drawer").getByRole("link", { name: "Voir le panier complet" }));
  await page.getByTestId("go-quote").waitFor();
  await fits(page, "panier");
}
async function contact(page) {
  for (const [field, value] of Object.entries(CONTACT)) await typeKey(page, page.locator(`#f-${field}`), value);
}
async function confirm(page) {
  await activateKey(page, page.getByTestId("order-confirm"), "Space");
}
async function send(page, mode) {
  const response = page.waitForResponse((r) => r.url() === `${BASE}/api/site/${mode}` && r.request().method() === "POST");
  await activateKey(page, page.getByTestId("submit"));
  const r = await response;
  assert.equal(r.status(), 200);
  const json = await r.json();
  await page.getByTestId("result-received").waitFor();
  await page.waitForFunction(() => document.activeElement?.id === "res-h");
  await fits(page, `${mode} résultat`);
  await checkStored(page, json.receipt);
  return json;
}
const amount = (value) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(Number(value)).replace(/\s/g, " ");
async function checkStored(page, receipt) {
  const details = page.getByTestId("receipt-details");
  await details.waitFor();
  assert.equal(await details.getByTestId("receipt-line").count(), receipt.lines.length);
  const date = details.locator("time");
  assert.equal(await date.getAttribute("datetime"), receipt.created_at_utc);
  assert.ok((await date.innerText()).length > 0);
  for (const [i, line] of receipt.lines.entries()) {
    const row = details.getByTestId("receipt-line").nth(i);
    const text = (await row.innerText()).replace(/\s/g, " ");
    assert.ok(text.includes(line.public_item_key));
    assert.equal(await row.locator("td").nth(2).innerText(), String(line.quantity));
    for (const value of Object.values(line.variant_axes)) assert.ok(text.toLowerCase().includes(value.toLowerCase()));
    if (line.unit_amount) {
      assert.ok(text.includes(amount(line.unit_amount)), "prix enregistré");
      if (line.tax_basis_or_status === "HT") assert.match(text, /€ HT/, "base HT enregistrée");
      if (line.tax_basis_or_status === "UNQUALIFIED") assert.match(await details.innerText(), /[Bb]ase fiscale non précisée/, "base non précisée enregistrée");
    }
    else assert.match(text, /sans prix/);
    if (line.line_total) assert.ok(text.includes(amount(line.line_total)), "total de ligne enregistré");
  }
  if (receipt.total_amount) assert.ok((await details.getByTestId("receipt-total").innerText()).replace(/\s/g, " ").includes(amount(receipt.total_amount)));
  else assert.match(await details.innerText(), /Aucun total enregistré/);
}
async function lookup(page, created) {
  await activateKey(page, page.locator("main").getByRole("link", { name: "Consulter un reçu", exact: true }));
  await page.getByRole("heading", { name: "Consulter un reçu", exact: true }).waitFor();
  await fits(page, "consultation vide");
  // Validation reliée aux deux champs + focus du message.
  await activateKey(page, page.getByRole("button", { name: "Consulter", exact: true }));
  await page.getByTestId("receipt-refused").waitFor();
  await page.waitForFunction(() => document.activeElement?.id === "receipt-error");
  assert.equal(await page.locator("#r-ref").getAttribute("aria-invalid"), "true");
  assert.equal(await page.locator("#r-code").getAttribute("aria-describedby"), "receipt-error");
  await typeKey(page, page.locator("#r-ref"), created.receipt_ref);
  await typeKey(page, page.locator("#r-code"), "code-factice-errone");
  await activateKey(page, page.getByRole("button", { name: "Consulter", exact: true }));
  await page.getByTestId("receipt-refused").waitFor();
  await typeKey(page, page.locator("#r-code"), created.access_token);
  const response = page.waitForResponse((r) => r.url().includes("/api/site/receipt?") && r.status() === 200);
  await activateKey(page, page.getByRole("button", { name: "Consulter", exact: true }));
  assert.deepEqual((await (await response).json()).receipt, created.receipt, "reçu serveur identique");
  await page.getByTestId("receipt-found").waitFor();
  await page.waitForFunction(() => document.activeElement?.id === "rc-h");
  assert.equal(await page.locator("#r-code").inputValue(), "", "code effacé après consultation");
  assert.equal(new URL(page.url()).hash, "", "aucun code dans l’adresse");
  await checkStored(page, created.receipt);
  await fits(page, "reçu consulté");
}
async function count(table) {
  assert.ok(["site_order", "site_quote_request"].includes(table));
  return Number((await pool.query(`SELECT count(*) AS n FROM ${table}`)).rows[0].n);
}

describe("panier → devis → commande de test, 390 px et clavier seul", { concurrency: false }, () => {
  test("deux variantes, quantités/retrait, erreurs de contact, devis enregistré et consultable", async () => {
    const page = await page390();
    await add(page, fixture.families[0]);
    await add(page, fixture.families[1]);
    await cart(page);
    assert.equal(await page.getByTestId("cart-line").count(), 2);
    assert.equal(await page.getByTestId("cart-total").getAttribute("aria-live"), "polite");
    await typeKey(page, page.locator("#cart-qty-0"), "2");
    await page.getByTestId("go-quote").waitFor();
    await activateKey(page, page.getByTestId("go-quote"));
    await page.getByTestId("submit").waitFor();
    await fits(page, "devis");
    await activateKey(page, page.getByTestId("submit"));
    await page.getByTestId("error-summary").waitFor();
    assert.equal(await page.getByTestId("error-summary").evaluate((el) => el === document.activeElement), true);
    await fits(page, "erreurs de coordonnées");
    for (const field of Object.keys(CONTACT)) {
      assert.equal(await page.locator(`#f-${field}`).getAttribute("aria-invalid"), "true");
      assert.ok((await page.locator(`#f-${field}`).getAttribute("aria-describedby")).includes(`f-${field}-err`));
    }
    await contact(page);
    await typeKey(page, page.locator("#f-message"), "STAGING_FIXTURE Demande de test.");
    const created = await send(page, "quote");
    assert.equal(created.receipt.lines.length, 2);
    assert.equal(created.receipt.lines[0].quantity, 2);
    assert.equal(await page.getByTestId("receipt-code").innerText(), created.access_token);
    assert.equal(await count("site_quote_request"), 1);
    await lookup(page, created);
    await cart(page);
    await activateKey(page, page.getByRole("button", { name: /^Retirer/ }).first());
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="cart-line"]').length === 1);
    await page.getByTestId("go-quote").waitFor();
    await fits(page, "panier après retrait");
  });

  test("commande de test : double activation, reçu réel, panier vidé et aucun doublon au rechargement", async () => {
    const page = await page390();
    await add(page, fixture.families[0]);
    await cart(page);
    await activateKey(page, page.getByTestId("go-order"));
    await page.getByTestId("submit").waitFor();
    assert.ok((await page.locator("main").innerText()).includes(NOTICE));
    assert.equal(await page.getByTestId("submit").isDisabled(), true);
    await fits(page, "commande");
    await contact(page);
    await confirm(page);
    let requests = 0, release;
    const gate = new Promise((resolve) => { release = resolve; });
    await page.route("**/api/site/order", async (route) => { requests++; await gate; await route.continue(); });
    const pending = send(page, "order");
    await page.waitForFunction(() => document.querySelector('[data-testid="submit"]')?.disabled);
    assert.equal(await page.getByTestId("submit-status").innerText(), "Envoi en cours…");
    await page.keyboard.press("Enter");
    release();
    const created = await pending;
    assert.equal(requests, 1);
    assert.equal(await count("site_order"), 1);
    assert.ok((await page.getByTestId("result-received").innerText()).includes(NOTICE));
    await lookup(page, created);
    assert.ok((await page.getByTestId("receipt-found").innerText()).includes(NOTICE));
    await page.goto(`${BASE}/commande`);
    await page.getByTestId("cart-empty").waitFor();
    await page.reload();
    await page.getByTestId("cart-empty").waitFor();
    assert.equal(await count("site_order"), 1);
    await fits(page, "commande vide rechargée");
  });

  test("réponse perdue après persistance, rechargement puis même envoi = même reçu, sans doublon", async () => {
    const page = await page390();
    await add(page, fixture.families[0]);
    await cart(page);
    await activateKey(page, page.getByTestId("go-order"));
    await page.getByTestId("submit").waitFor();
    await contact(page);
    await confirm(page);
    let first, originalBody;
    await page.route("**/api/site/order", async (route) => {
      originalBody = route.request().postDataJSON();
      first = await (await route.fetch()).json(); // le vrai serveur a COMMIT
      await route.abort("failed"); // seule la réponse au navigateur est perdue
    }, { times: 1 });
    await activateKey(page, page.getByTestId("submit"));
    await page.getByTestId("result-refused").waitFor();
    assert.equal(await count("site_order"), 1);
    const stored = await page.evaluate(() => JSON.stringify({ ...sessionStorage }));
    assert.ok(!stored.includes(CONTACT.email) && !stored.includes(CONTACT.contact_name) && !stored.includes(first.access_token), "aucune coordonnée ni code en sessionStorage");
    await page.reload();
    await page.getByTestId("submit").waitFor();
    await contact(page);
    await confirm(page);
    const replay = await send(page, "order");
    assert.equal(replay.outcome, "REPLAY_SAME_RECEIPT");
    assert.equal(replay.receipt_ref, first.receipt_ref);
    assert.deepEqual(replay.receipt, first.receipt);
    assert.equal(replay.access_token, undefined, "contrat : code non réémis");
    assert.equal(await count("site_order"), 1);
    const savedKey = (await pool.query("SELECT idempotency_key FROM site_order")).rows[0].idempotency_key;
    assert.equal(savedKey, originalBody.idempotency_key);
    assert.match(await page.getByTestId("result-received").innerText(), /code.*premier envoi/is);
  });

  test("ligne sans prix : commande bloquée, devis réellement enregistré sans total inventé", async () => {
    const page = await page390();
    await add(page, fixture.families[1], 5); // fenêtre absente à l'instant figé
    await cart(page);
    assert.equal(await page.getByTestId("go-order").count(), 0);
    await page.goto(`${BASE}/commande`);
    await page.getByTestId("flow-blocked").waitFor();
    assert.equal(await page.getByTestId("submit").isDisabled(), true);
    await fits(page, "commande sans prix");
    await cart(page);
    await activateKey(page, page.getByTestId("go-quote"));
    await page.getByTestId("submit").waitFor();
    await contact(page);
    const created = await send(page, "quote");
    assert.equal(created.receipt.lines[0].priced, false);
    assert.equal(await count("site_order"), 0);
    await lookup(page, created);
  });

  for (const mode of ["order", "quote"]) test(`catalogue changé avant l'envoi ${mode} : refus réel et vérification obligatoire`, async () => {
    await resetDb();
    const identity = await activate("F_IDENTITY.activate_gen_a");
    const page = await page390();
    await add(page, identity.families[0]);
    await cart(page);
    await activateKey(page, page.getByTestId(mode === "order" ? "go-order" : "go-quote"));
    await page.getByTestId("submit").waitFor();
    await contact(page);
    if (mode === "order") await confirm(page);
    await activate("F_IDENTITY.activate_gen_b_same_keys");
    const response = page.waitForResponse((r) => r.url() === `${BASE}/api/site/${mode}` && r.request().method() === "POST");
    await activateKey(page, page.getByTestId("submit"));
    const refusal = await (await response).json();
    assert.ok(refusal.error_codes.some((c) => ["CART_STALE", "CATALOG_CHANGED"].includes(c)));
    await page.getByTestId("cart-generation-changed").waitFor();
    assert.equal(await page.getByTestId("submit").isDisabled(), true);
    assert.match(await page.locator("main").innerText(), /vérifiez|Vérifiez/);
    assert.equal(await count("site_order"), 0);
    assert.equal(await count("site_quote_request"), 0);
    await fits(page, "catalogue changé");
    await activateKey(page, page.getByRole("button", { name: "J'ai vérifié les nouveaux prix" }));
    if (mode === "order") { assert.equal(await page.getByTestId("order-confirm").isChecked(), false); await confirm(page); }
    await send(page, mode);
  });

  test("prix refusé à génération identique : le devis attend une vérification explicite", async () => {
    const page = await page390();
    await add(page, fixture.families[0]);
    await cart(page);
    await activateKey(page, page.getByTestId("go-quote"));
    await page.getByTestId("submit").waitFor();
    await contact(page);
    // Faute ciblée du transport pour cette branche ; aucun succès ni reçu simulé.
    await page.route("**/api/site/quote", (route) => route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ accepted: false, error_codes: ["PRICE_CHANGED"] }) }), { times: 1 });
    await activateKey(page, page.getByTestId("submit"));
    await page.getByTestId("cart-generation-changed").waitFor();
    assert.equal(await page.getByTestId("submit").isDisabled(), true);
    await activateKey(page, page.getByRole("button", { name: "J'ai vérifié les nouveaux prix" }));
    await send(page, "quote");
  });

  test("aperçu 503 et réseau coupé : prix masqués, panier conservé, réessai possible", async () => {
    const page = await page390();
    await add(page, fixture.families[0]);
    await page.route("**/api/site/cart/preview", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ site_status: "CATALOG_UNAVAILABLE" }) }));
    await page.goto(`${BASE}/panier`);
    await page.getByTestId("preview-problem").waitFor();
    assert.equal(await page.getByTestId("go-order").count(), 0);
    assert.equal(await page.getByTestId("cart-total").innerText(), "…");
    await fits(page, "503");
    await page.unroute("**/api/site/cart/preview");
    await page.route("**/api/site/cart/preview", (route) => route.abort("internetdisconnected"));
    await activateKey(page, page.getByRole("button", { name: "Réessayer", exact: true }));
    await page.getByText("Serveur injoignable", { exact: true }).waitFor();
    assert.equal(await page.getByTestId("cart-line").count(), 1);
    await fits(page, "réseau coupé");
    await page.unroute("**/api/site/cart/preview");
    await activateKey(page, page.getByRole("button", { name: "Réessayer", exact: true }));
    await page.getByTestId("go-order").waitFor();
  });
});
