// Recette navigateur BC3 (Playwright, Chromium) sur la génération ACTIVE réelle posée par le receiver BC2.
//   PLAYWRIGHT_DIR=<dossier node_modules contenant playwright> CHROMIUM=<exécutable> \
//   UI_OUT=evidence/W1/BC3/raw/ui/<sha> AXE=<axe.min.js> node --test --test-concurrency=1 tests/ui/storefront.ui.mjs
// Aucun téléchargement : Playwright et Chromium déjà présents localement sont réutilisés (chemins en paramètres).
// Serveur `next start` lancé/tué par CE script sur $SITE_TEST_PORT (défaut 3361), base prodes_site_rv_bc3_test.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import { activateOverHttp, dbUrl, resetSiteDb } from "./site-setup.mjs";

const ROOT = "/Users/nico/Desktop/prodes-w1/review-bc3";
const PORT = Number(process.env.SITE_TEST_PORT ?? 3361);
const BASE = `http://127.0.0.1:${PORT}`;
const DB = "prodes_site_rv_bc3_test";
const OUT = path.resolve(ROOT, process.env.UI_OUT ?? "evidence/W1/BC3/raw/ui/local");
const AXE = process.env.AXE;
mkdirSync(OUT, { recursive: true });
const require = createRequire(path.join(process.env.PLAYWRIGHT_DIR ?? "", "/"));
const { chromium } = require("playwright");

const VIEWPORTS = { desktop: { width: 1440, height: 900 }, laptop: { width: 1024, height: 768 }, mobile: { width: 390, height: 844 } };
const journal = [];
const note = (line) => {
  journal.push(line);
  console.log(`# ${line}`);
};

let server;
let browser;
const db = new pg.Pool({ connectionString: dbUrl(DB), max: 2 });
const consoleErrors = [];

async function portAnswers() {
  try {
    await fetch(BASE + "/api/site/receipt", { signal: AbortSignal.timeout(500) });
    return true;
  } catch {
    return false;
  }
}

async function startServer() {
  assert.equal(await portAnswers(), false, `port ${PORT} occupé`);
  const child = spawn(process.execPath, [path.join(ROOT, "node_modules/next/dist/bin/next"), "start", "-H", "127.0.0.1", "-p", String(PORT)], {
    cwd: ROOT,
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      NEXT_TELEMETRY_DISABLED: "1",
      SITE_ENV: "staging",
      SITE_KEYRING_PATH: path.join(ROOT, "c0/fixtures/keys/test_keyring.json"),
      SITE_ACK_KEY_ID: "c0-test-ack-01",
      SITE_WITHDRAWAL_HOLD_POLICY: JSON.stringify({ max_withdrawals_without_release: null, released_expected_withdrawals_digest: null }),
      SITE_DATABASE_URL: dbUrl(DB),
      SITE_CATALOG_SOURCE: "db",
      SITE_BUSINESS_PERSISTENCE: "postgresql",
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
  note(`serveur PID ${child.pid} port ${PORT} base ${DB}`);
  return { child, isExited: () => exited };
}

async function stopServer(s) {
  if (!s || s.isExited()) return;
  const done = new Promise((r) => s.child.once("exit", r));
  process.kill(s.child.pid, "SIGTERM"); // PID lancé par ce script uniquement
  await done;
  note(`serveur PID ${s.child.pid} arrêté`);
}

async function scene(...cases) {
  await resetSiteDb(DB);
  for (const c of cases) await activateOverHttp(BASE, c);
}

async function newPage(viewport = VIEWPORTS.desktop, opts = {}) {
  const ctx = await browser.newContext({ viewport, locale: "fr-FR", ...opts });
  const page = await ctx.newPage();
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(`${page.url()} : ${m.text()}`);
  });
  page.on("pageerror", (e) => consoleErrors.push(`${page.url()} : pageerror ${e.message}`));
  return page;
}

async function shot(page, name) {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  note(`capture ${path.relative(ROOT, file)} (${page.url().replace(BASE, "")}, ${page.viewportSize().width}×${page.viewportSize().height})`);
}

/** Pas de défilement horizontal du document (DA UX-P21 : « pas de body horizontal à 390 px »). */
async function assertNoHScroll(page, label) {
  const { sw, cw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  assert.ok(sw <= cw + 1, `${label} : défilement horizontal (${sw} > ${cw})`);
}

/** Tab jusqu'à un élément ; renvoie la séquence de focus (nom accessible approché) pour la preuve clavier. */
async function tabTo(page, matcher, max = 80) {
  const seq = [];
  for (let i = 0; i < max; i++) {
    await page.keyboard.press("Tab");
    const info = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el) return null;
      const label = el.getAttribute("aria-label") || (el.labels && el.labels[0]?.textContent) || el.textContent || el.getAttribute("value") || "";
      const target = el.closest("label") ?? el;
      const cs = getComputedStyle(target);
      const r = target.getBoundingClientRect();
      return { tag: el.tagName.toLowerCase(), type: el.getAttribute("type"), label: label.trim().replace(/\s+/g, " ").slice(0, 60), testid: el.getAttribute("data-testid"), outline: cs.outlineStyle, outlineWidth: cs.outlineWidth, h: Math.round(r.height), w: Math.round(r.width) };
    });
    seq.push(info);
    if (info && matcher(info)) return seq;
  }
  throw new Error(`élément non atteint au clavier en ${max} Tab : ${JSON.stringify(seq.slice(-5))}`);
}

function assertFocusVisible(seq, label) {
  const last = seq[seq.length - 1];
  assert.ok(last.outline !== "none" && last.outlineWidth !== "0px", `${label} : focus non visible (${JSON.stringify(last)})`);
}

async function runAxe(page, name) {
  if (!AXE || !existsSync(AXE)) return null;
  await page.addScriptTag({ path: AXE });
  const res = await page.evaluate(async () => {
    // eslint-disable-next-line no-undef
    const r = await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] } });
    return { violations: r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.map((n) => n.target.join(" ")).slice(0, 5) })), passes: r.passes.length };
  });
  writeFileSync(path.join(OUT, `axe-${name}.json`), JSON.stringify(res, null, 2));
  note(`axe ${name} : ${res.violations.length} violation(s), ${res.passes} règles passées`);
  return res;
}

/** Cibles interactives visibles de moins de 24 px (WCAG 2.2 AA) et de moins de 34 px (DA-02). */
async function targetSizes(page) {
  return page.evaluate(() => {
    const out = { under24: [], under34: [] };
    for (const el of document.querySelectorAll("a[href], button, input:not([type=hidden]), select, textarea, summary")) {
      const t = el.matches("input.sr-only") ? el.closest("label") : el;
      if (!t || (t.matches(".sr-only") && document.activeElement !== t)) continue; // lien d'évitement : visible au focus
      const r = t.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || getComputedStyle(t).visibility === "hidden") continue;
      const name = (t.textContent || t.getAttribute("aria-label") || t.getAttribute("name") || t.tagName).trim().replace(/\s+/g, " ").slice(0, 40);
      const s = `${t.tagName.toLowerCase()} « ${name} » ${Math.round(r.width)}×${Math.round(r.height)}`;
      if (Math.min(r.width, r.height) < 24) out.under24.push(s);
      else if (r.height < 34) out.under34.push(s);
    }
    return out;
  });
}

describe("BC3 — recette navigateur (Chromium)", () => {
  before(async () => {
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM, headless: true });
    note(`Chromium ${browser.version()}`);
    server = await startServer();
  });
  after(async () => {
    await browser?.close();
    await stopServer(server);
    await db.end();
    writeFileSync(path.join(OUT, "journal.txt"), journal.join("\n") + "\n");
    writeFileSync(path.join(OUT, "console_errors.txt"), consoleErrors.join("\n") + "\n");
  });

  test("U1 — catalogue absent : page 503 rendue serveur (captures 1440/390)", async () => {
    await scene();
    for (const [vp, size] of [["desktop", VIEWPORTS.desktop], ["mobile", VIEWPORTS.mobile]]) {
      const page = await newPage(size);
      const res = await page.goto(BASE + "/");
      assert.equal(res.status(), 503);
      await page.getByRole("heading", { name: "Catalogue indisponible" }).waitFor();
      await assertNoHScroll(page, `503 ${vp}`);
      await shot(page, `U1-indisponible-503-${vp}`);
      await page.context().close();
    }
  });

  test("U2 — F_GMCE_VARIANTS : accueil, catégorie, fiche à variantes (1440/1024/390), sélection clavier, ajout au panier", async () => {
    await scene("F_GMCE_VARIANTS.activate");
    for (const [vp, size] of Object.entries(VIEWPORTS)) {
      const page = await newPage(size);
      await page.goto(BASE + "/");
      await assertNoHScroll(page, `accueil ${vp}`);
      await shot(page, `U2-accueil-${vp}`);
      await page.goto(BASE + "/categorie/signaletique");
      await assertNoHScroll(page, `catégorie ${vp}`);
      await shot(page, `U2-categorie-${vp}`);
      await page.goto(BASE + "/famille/gmce-demo");
      await page.getByTestId("qty-price").getByText(/^Pour 1 : /).waitFor();
      await assertNoHScroll(page, `fiche ${vp}`);
      await shot(page, `U2-fiche-gmce-${vp}`);
      await page.context().close();
    }

    const page = await newPage();
    await page.goto(BASE + "/famille/gmce-demo");
    await page.getByTestId("qty-price").getByText(/^Pour 1 : /).waitFor();
    // Famille-first : la première image de la galerie est l'image principale de la Famille.
    assert.equal(await page.getByTestId("family-image").getAttribute("src"), "/media/bdc052e346fa8f7813cf76228e472d5e0e91ac3901ddc71069214f1d99cdaec5");
    // Clavier : de « Aller au contenu » jusqu'au groupe « Taille », puis flèche → M.
    const seq = await tabTo(page, (i) => i.tag === "input" && i.type === "radio" && /^S$/.test(i.label));
    assertFocusVisible(seq, "radio taille");
    writeFileSync(path.join(OUT, "U2-ordre-tab-fiche.json"), JSON.stringify(seq, null, 1));
    note(`fiche : ${seq.length} Tab jusqu'au radio « Taille S » ; focus visible (${seq.at(-1).outline} ${seq.at(-1).outlineWidth})`);
    await page.keyboard.press("ArrowRight");
    await page.getByTestId("item-ref").getByText("PI-000000363").waitFor();
    assert.match(page.url(), /\?article=PI-000000363$/, "adresse de la variante mise à jour");
    // Bleu + M n'existe pas : « Bleu » est désactivé et expliqué.
    assert.equal(await page.locator('input[type=radio][value="bleu"]').isDisabled(), true);
    await page.getByText(/Non proposé avec Taille « M » : Bleu/).waitFor();
    await shot(page, "U2-fiche-gmce-rouge-M-bleu-desactive");
    // Quantité au clavier puis Entrée sur « Ajouter au panier ».
    await page.getByLabel("Quantité", { exact: true }).fill("3");
    await page.getByTestId("qty-price").getByText(/^Pour 3 : /).waitFor();
    await page.getByRole("button", { name: "Ajouter au panier" }).focus();
    await page.keyboard.press("Enter");
    await page.getByRole("status").getByText(/Ajouté au panier : 3 × Couleur : Rouge · Taille : M/).waitFor();
    // Même variante ajoutée de nouveau : incrément de la ligne, pas de seconde ligne (C0 R-01).
    await page.getByLabel("Quantité", { exact: true }).fill("2");
    await page.getByTestId("qty-price").getByText(/^Pour 2 : /).waitFor();
    await page.getByRole("button", { name: "Ajouter au panier" }).click();
    await page.getByRole("status").getByText(/Ajouté au panier : 2 ×/).waitFor();
    await page.goto(BASE + "/panier");
    await page.getByTestId("cart-total").getByText(/65,00/).waitFor(); // 5 × 13,00 (sélection serveur R-GMCE-102)
    assert.equal(await page.getByTestId("cart-line").count(), 1);
    await page.getByText("Base fiscale non précisée par la publication").waitFor();
    for (const [vp, size] of Object.entries(VIEWPORTS)) {
      await page.setViewportSize(size);
      await assertNoHScroll(page, `panier ${vp}`);
      await shot(page, `U2-panier-${vp}`);
    }
    await page.context().close();
  });

  test("U3 — parcours devis complet au clavier sur la génération ACTIVE → « Demande de devis reçue », ligne en base, reçu consultable", async () => {
    const page = await newPage();
    await page.goto(BASE + "/famille/gmce-demo?article=PI-00000037S");
    await page.getByTestId("qty-price").getByText(/^Pour 1 : /).waitFor();
    await page.getByRole("button", { name: "Ajouter au panier" }).click();
    await page.getByRole("status").getByText(/Ajouté au panier/).waitFor();
    await page.goto(BASE + "/panier");
    await page.getByTestId("go-order").waitFor();
    await page.getByTestId("go-quote").click();
    await page.waitForURL(/\/devis$/);
    await page.getByRole("heading", { name: "Récapitulatif" }).waitFor();
    // Envoi à vide : résumé des erreurs focalisé, erreurs sous les champs.
    await page.getByTestId("submit").click();
    await page.getByTestId("error-summary").waitFor();
    assert.equal(await page.evaluate(() => document.activeElement?.id), "error-summary");
    await shot(page, "U3-devis-erreurs");
    // Saisie au clavier : Tab depuis le résumé jusqu'aux champs.
    await page.locator("#f-organisation_name").focus();
    await page.keyboard.type("STAGING_FIXTURE Mairie de Test");
    await page.keyboard.press("Tab");
    await page.keyboard.type("STAGING_FIXTURE Contact");
    await page.keyboard.press("Tab");
    await page.keyboard.type("achats@example.invalid");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await page.keyboard.type("Délai souhaité : fin novembre.");
    const seq = await tabTo(page, (i) => i.testid === "submit", 10);
    assertFocusVisible(seq, "bouton d'envoi");
    await page.keyboard.press("Enter");
    await page.getByTestId("result-received").waitFor();
    const ref = await page.getByTestId("receipt-ref").textContent();
    assert.match(ref, /^QR-[0-9a-f]{32}$/);
    const link = await page.getByTestId("receipt-link").textContent();
    assert.match(link, /\/recu#ref=QR-[0-9a-f]{32}&code=/);
    assert.equal(await page.evaluate(() => document.activeElement?.id), "res-h", "focus sur le titre du résultat");
    await shot(page, "U3-devis-recu");
    const row = (await db.query("SELECT status, (SELECT count(*)::int FROM site_quote_line l WHERE l.quote_id = q.id) AS n, message FROM site_quote_request q WHERE quote_ref = $1", [ref])).rows[0];
    assert.deepEqual(row, { status: "RECEIVED", n: 1, message: "Délai souhaité : fin novembre." });
    note(`devis ${ref} persisté (1 ligne, message conservé)`);
    // Panier vidé après réception ; le jeton n'est stocké nulle part dans le navigateur.
    const storage = await page.evaluate(() => JSON.stringify(window.localStorage));
    assert.ok(!storage.includes(link.split("code=")[1]), "jeton absent du stockage local");
    // Consultation par le lien (fragment, jamais envoyé au serveur dans l'adresse de la page).
    const requested = [];
    page.on("request", (r) => requested.push(r.url()));
    await page.goto(link);
    await page.getByTestId("receipt-found").waitFor();
    assert.ok(requested.some((u) => u.includes("/recu") && !u.includes("code=")), "page /recu demandée sans le code");
    await shot(page, "U3-recu-consulte");
    await page.goto(BASE + "/recu#ref=" + ref + "&code=faux");
    await page.getByTestId("receipt-refused").getByText(/code NOT_FOUND/).waitFor();
    await page.context().close();
  });

  test("U4 — F_SIMPLE_READY : commande avec confirmation explicite → « Commande reçue », ligne en base (390 px)", async () => {
    await scene("F_SIMPLE_READY.activate_first");
    const page = await newPage(VIEWPORTS.mobile);
    await page.goto(BASE + "/famille/chaise-demo");
    await page.getByTestId("qty-price").getByText(/^Pour 1 : /).waitFor();
    await page.getByRole("button", { name: "Augmenter la quantité" }).click();
    await page.getByTestId("qty-price").getByText(/Pour 2 : 38,50 € HT l’unité|Pour 2 : 38,50\s€ HT/).waitFor();
    await page.getByRole("button", { name: "Ajouter au panier" }).click();
    await page.getByRole("status").getByText(/Ajouté au panier/).waitFor();
    await page.goto(BASE + "/commande");
    await page.getByTestId("order-confirm").waitFor();
    await page.locator("#f-organisation_name").fill("STAGING_FIXTURE Collège Exemple");
    await page.locator("#f-contact_name").fill("STAGING_FIXTURE Gestionnaire");
    await page.locator("#f-email").fill("intendance@example.invalid");
    await page.locator("#f-phone").fill("04 00 00 00 00");
    assert.equal(await page.getByTestId("submit").isDisabled(), true, "envoi désactivé sans confirmation explicite");
    await assertNoHScroll(page, "commande 390");
    await shot(page, "U4-commande-avant-confirmation-mobile");
    await page.getByTestId("order-confirm").check();
    await page.getByTestId("submit").click();
    await page.getByTestId("result-received").getByText("Commande reçue — en attente de traitement").waitFor();
    const ref = await page.getByTestId("receipt-ref").textContent();
    const row = (await db.query("SELECT status, total_amount FROM site_order WHERE order_ref = $1", [ref])).rows[0];
    assert.deepEqual(row, { status: "RECEIVED", total_amount: "77.00" });
    note(`commande ${ref} persistée (77.00, RECEIVED)`);
    await shot(page, "U4-commande-recue-mobile");
    await page.context().close();
  });

  test("U5 — CART_STALE réel : panier sur la génération 1, BC2 active la génération 2 → refus serveur CART_STALE traduit, bannière et blocage, reconfirmation", async () => {
    await scene("F_IDENTITY.activate_gen_a");
    const page = await newPage();
    await page.goto(BASE + "/famille/chaise-pliante?article=PI-000000JVF");
    await page.getByTestId("qty-price").getByText(/^Pour 1 : /).waitFor();
    await page.getByRole("button", { name: "Ajouter au panier" }).click();
    await page.getByRole("status").getByText(/Ajouté au panier/).waitFor();
    await page.goto(BASE + "/commande");
    await page.getByTestId("order-confirm").waitFor();
    await page.locator("#f-organisation_name").fill("STAGING_FIXTURE Mairie");
    await page.locator("#f-contact_name").fill("STAGING_FIXTURE Contact");
    await page.locator("#f-email").fill("achats@example.invalid");
    await page.getByTestId("order-confirm").check();
    // Nouvelle génération activée par BC2 PENDANT que la page affiche les prix de la génération 1.
    await activateOverHttp(BASE, "F_IDENTITY.activate_gen_b_same_keys");
    const before = Number((await db.query("SELECT count(*) FROM site_order")).rows[0].count);
    await page.getByTestId("submit").click();
    await page.getByTestId("result-refused").waitFor();
    await page.getByTestId("refusal-codes").getByText(/code CART_STALE/).waitFor();
    await page.getByTestId("cart-generation-changed").waitFor();
    assert.equal(await page.getByTestId("submit").isDisabled(), true, "envoi bloqué tant que les nouveaux prix ne sont pas vérifiés");
    assert.equal(Number((await db.query("SELECT count(*) FROM site_order")).rows[0].count), before, "aucune commande écrite");
    await shot(page, "U5-cart-stale-refus-banniere");
    await page.goto(BASE + "/panier");
    await page.getByTestId("cart-generation-changed").waitFor();
    assert.equal(await page.getByTestId("go-order").count(), 0, "« Passer commande » absent tant que non vérifié");
    await shot(page, "U5-panier-catalogue-mis-a-jour");
    await page.getByRole("button", { name: "J'ai vérifié les nouveaux prix" }).click();
    await page.getByTestId("go-order").click();
    await page.locator("#f-organisation_name").fill("STAGING_FIXTURE Mairie");
    await page.locator("#f-contact_name").fill("STAGING_FIXTURE Contact");
    await page.locator("#f-email").fill("achats@example.invalid");
    await page.getByTestId("order-confirm").check();
    await page.getByTestId("submit").click();
    await page.getByTestId("result-received").waitFor();
    const ref = await page.getByTestId("receipt-ref").textContent();
    assert.equal((await db.query("SELECT catalogue_sequence::int AS s FROM site_order WHERE order_ref = $1", [ref])).rows[0].s, 2);
    note(`CART_STALE affiché puis commande ${ref} reçue sur la génération 2`);
    await page.context().close();
  });

  test("U6 — Item retiré/supplanté dans le panier, média manquant, aperçu 503 sur /panier (catalogue devenu UNSAFE)", async () => {
    const page = await newPage();
    await page.goto(BASE + "/famille/chaise-pliante?article=PI-000000JW3");
    await page.getByTestId("qty-price").getByText(/^Pour 1 : /).waitFor();
    await page.getByRole("button", { name: "Ajouter au panier" }).click();
    await page.getByRole("status").getByText(/Ajouté au panier/).waitFor();
    await activateOverHttp(BASE, "F_IDENTITY.activate_gen_c_tombstones");
    await page.goto(BASE + "/panier");
    await page.getByTestId("line-problem").getByText(/code ITEM_SUPERSEDED/).waitFor();
    await page.getByRole("link", { name: /Voir la nouvelle référence PI-000000JVF/ }).waitFor();
    await shot(page, "U6-panier-article-supplante");
    // Média altéré : remplacement neutre « Image indisponible ».
    const sha = "ac403e49";
    await db.query("UPDATE site_media SET bytes = set_byte(bytes, 29, get_byte(bytes, 29) # 255) WHERE sha256 LIKE $1", [`${sha}%`]);
    // Contexte neuf : le navigateur a gardé en cache (immutable, adressage par contenu) les octets vérifiés plus tôt.
    const fresh = await newPage();
    await fresh.goto(BASE + "/famille/chaise-pliante");
    await fresh.getByTestId("media-missing").first().waitFor();
    await shot(fresh, "U6-fiche-media-manquant");
    await fresh.context().close();
    // Catalogue devenu UNSAFE après chargement du panier : l'aperçu répond 503, la page ne casse pas.
    await page.goto(BASE + "/panier");
    await page.getByTestId("cart-line").first().waitFor();
    await db.query("UPDATE site_active_pointer SET payload_sha256 = $1 WHERE singleton = 1", ["0".repeat(64)]);
    await page.getByLabel(/Quantité pour/).first().fill("2");
    await page.getByTestId("preview-problem").getByText(/Prix momentanément indisponibles/).waitFor();
    await shot(page, "U6-panier-apercu-503");
    const reload = await page.goto(BASE + "/panier");
    assert.equal(reload.status(), 503, "/panier rendu en 503 côté serveur");
    await page.context().close();
  });

  test("U7 — menu Catégories au clavier (Entrée, Échap, retour du focus), zoom 200 % (reflow 720 px), axe-core sur 4 pages, tailles de cible", async () => {
    await scene("F_GMCE_VARIANTS.activate");
    const page = await newPage();
    await page.goto(BASE + "/");
    const seq = await tabTo(page, (i) => i.tag === "button" && /Catégories/.test(i.label), 10);
    assertFocusVisible(seq, "menu Catégories");
    await page.keyboard.press("Enter");
    await page.getByRole("link", { name: "STAGING_FIXTURE Signalétique" }).first().waitFor({ state: "visible" });
    assert.equal(await page.getByRole("button", { name: /Catégories/ }).getAttribute("aria-expanded"), "true");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Escape");
    assert.equal(await page.getByRole("button", { name: /Catégories/ }).getAttribute("aria-expanded"), "false");
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("aria-expanded")), "false", "focus rendu au bouton");
    note(`menu : Entrée ouvre, Échap ferme, focus rendu au bouton (${seq.length} Tab depuis le haut)`);

    // Zoom 200 % : fenêtre 1440 px à 200 % = 720 px CSS (reflow WCAG 1.4.10) ; aucun défilement horizontal.
    const zoom = await newPage({ width: 720, height: 450 }, { deviceScaleFactor: 2 });
    for (const p of ["/", "/famille/gmce-demo", "/panier", "/devis", "/recherche?q=demo"]) {
      await zoom.goto(BASE + p);
      await zoom.waitForLoadState("networkidle");
      await assertNoHScroll(zoom, `zoom 200 % ${p}`);
    }
    await zoom.goto(BASE + "/famille/gmce-demo");
    await zoom.getByTestId("qty-price").getByText(/^Pour 1 : /).waitFor();
    await shot(zoom, "U7-zoom200-fiche");
    await zoom.context().close();

    // axe-core (CSP contournée POUR L'INJECTION du script d'audit seulement).
    const audit = await newPage(VIEWPORTS.desktop, { bypassCSP: true });
    const results = {};
    const sizes = {};
    await audit.goto(BASE + "/");
    results.accueil = await runAxe(audit, "accueil");
    sizes.accueil = await targetSizes(audit);
    await audit.goto(BASE + "/famille/gmce-demo");
    await audit.getByTestId("qty-price").getByText(/^Pour 1 : /).waitFor();
    results.fiche = await runAxe(audit, "fiche");
    sizes.fiche = await targetSizes(audit);
    await audit.getByRole("button", { name: "Ajouter au panier" }).click();
    await audit.getByRole("status").getByText(/Ajouté au panier/).waitFor();
    await audit.goto(BASE + "/panier");
    await audit.getByTestId("cart-total").getByText(/12,00/).waitFor();
    results.panier = await runAxe(audit, "panier");
    sizes.panier = await targetSizes(audit);
    await audit.goto(BASE + "/devis");
    await audit.getByRole("heading", { name: "Récapitulatif" }).waitFor();
    await audit.getByTestId("submit").click();
    await audit.getByTestId("error-summary").waitFor();
    results.devis = await runAxe(audit, "devis-erreurs");
    sizes.devis = await targetSizes(audit);
    writeFileSync(path.join(OUT, "target-sizes.json"), JSON.stringify(sizes, null, 2));
    await audit.context().close();
    for (const [k, s] of Object.entries(sizes)) note(`cibles ${k} : ${s.under24.length} < 24 px, ${s.under34.length} entre 24 et 34 px`);
    if (AXE) {
      const serious = Object.entries(results).flatMap(([k, r]) => (r?.violations ?? []).filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${k}:${v.id}`));
      assert.deepEqual(serious, [], "aucune violation axe serious/critical");
    } else note("axe-core NOT_RUN (AXE absent)");
    for (const s of Object.values(sizes)) assert.deepEqual(s.under24, [], "aucune cible < 24 px");
  });

  test("U8 — aucune erreur console (dont violations CSP) sur l'ensemble du parcours", async () => {
    const filtered = consoleErrors.filter((e) => !/status of 503|status of 404|Failed to load resource/.test(e));
    writeFileSync(path.join(OUT, "console_errors_filtered.txt"), filtered.join("\n") + "\n");
    note(`console : ${consoleErrors.length} erreur(s) brute(s), ${filtered.length} hors ressources 404/503 attendues`);
    assert.deepEqual(filtered, []);
  });
});
