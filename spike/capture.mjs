#!/usr/bin/env node
// BC1-B — captures Chrome headless (aucune dépendance). Lance 2 instances :
// A (SPIKE_NOW_UTC défaut 2026-10-22T20:00Z) et B (2026-11-15T12:00Z).
// Pages statiques : CLI `--headless=new --screenshot` (commande du mandat).
// Panier (localStorage) et reçu de simulation : CDP via WebSocket natif Node 22.
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const OUT = join(root, "spike/screenshots");
const PA = 4720, PB = 4721, CDP_PORT = 9333;
const servers = [];
const log = [];

function start(port, now) {
  const c = spawn(join(root, "node_modules/.bin/next"), ["start", "-p", String(port)], {
    cwd: root, env: { ...process.env, SPIKE_NOW_UTC: now, NEXT_TELEMETRY_DISABLED: "1" }, stdio: "ignore",
  });
  servers.push(c);
}
async function ready(url) {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(url)).ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`indisponible ${url}`);
}

const SIZES = { d: "1440,900", t: "1024,768", m: "390,844" };

function cliShot(name, url, size) {
  const profile = mkdtempSync(join(tmpdir(), "bc1b-chrome-"));
  const file = join(OUT, `${name}.png`);
  const args = ["--headless=new", `--user-data-dir=${profile}`, "--hide-scrollbars", "--virtual-time-budget=4000", `--screenshot=${file}`, `--window-size=${size}`, url];
  execFileSync(CHROME, args, { stdio: "ignore", timeout: 60000 });
  rmSync(profile, { recursive: true, force: true });
  log.push({ name, url, size, mode: "cli" });
}

// ---- CDP minimal ----
class Cdp {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); this.events = [];
    ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && this.pending.has(d.id)) { this.pending.get(d.id)(d); this.pending.delete(d.id); } else this.events.push(d); }; }
  send(method, params = {}, sessionId) { const id = ++this.id; this.ws.send(JSON.stringify({ id, method, params, sessionId }));
    return new Promise((res, rej) => this.pending.set(id, (d) => d.error ? rej(new Error(`${method}: ${d.error.message}`)) : res(d.result))); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function cdpSession() {
  const profile = mkdtempSync(join(tmpdir(), "bc1b-cdp-"));
  const chrome = spawn(CHROME, ["--headless=new", `--user-data-dir=${profile}`, `--remote-debugging-port=${CDP_PORT}`, "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
  let ver;
  for (let i = 0; i < 50 && !ver; i++) { try { ver = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)).json(); } catch { await sleep(200); } }
  const ws = new WebSocket(ver.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  const cdp = new Cdp(ws);
  const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
  await cdp.send("Page.enable", {}, sessionId);
  await cdp.send("Runtime.enable", {}, sessionId);
  return { cdp, sessionId, close: () => { ws.close(); chrome.kill("SIGTERM"); setTimeout(() => rmSync(profile, { recursive: true, force: true }), 500); } };
}
async function nav(s, url) { await s.cdp.send("Page.navigate", { url }, s.sessionId); await sleep(2500); }
async function evalJs(s, expression) { const r = await s.cdp.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, s.sessionId); return r.result?.value; }
async function shot(s, name, size) {
  const [w, h] = size.split(",").map(Number);
  await s.cdp.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: w < 500 }, s.sessionId);
  await sleep(600);
  const { data } = await s.cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }, s.sessionId);
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(data, "base64"));
  log.push({ name, size, mode: "cdp" });
}

const SIMPLE_WINDOWS = [
  { currency: "EUR", layer: "BASE", offer_price_version_public: "opv-PI-SIMPLE001-base-v1", quantity_max: 9, quantity_min: 1, rate_id: "RATE-PI-SIMPLE001-BASE-1", tax_basis_or_status: "HT", unit_amount: "189.00", valid_from_utc: "2026-01-01T00:00:00Z", valid_until_utc: null },
  { currency: "EUR", layer: "BASE", offer_price_version_public: "opv-PI-SIMPLE001-base-v1", quantity_max: 19, quantity_min: 10, rate_id: "RATE-PI-SIMPLE001-BASE-2", tax_basis_or_status: "HT", unit_amount: "179.50", valid_from_utc: "2026-01-01T00:00:00Z", valid_until_utc: null },
  { currency: "EUR", layer: "BASE", offer_price_version_public: "opv-PI-SIMPLE001-base-v1", quantity_max: null, quantity_min: 20, rate_id: "RATE-PI-SIMPLE001-BASE-3", tax_basis_or_status: "HT", unit_amount: "169.90", valid_from_utc: "2026-01-01T00:00:00Z", valid_until_utc: null },
];

try {
  start(PA, "2026-10-22T20:00:00Z");
  start(PB, "2026-11-15T12:00:00Z");
  await ready(`http://127.0.0.1:${PA}/robots.txt`);
  await ready(`http://127.0.0.1:${PB}/robots.txt`);
  const A = `http://127.0.0.1:${PA}`, B = `http://127.0.0.1:${PB}`;

  // S01, S02, S03 (2 instants), S04 — CLI, 3 largeurs pour S02/S03.
  for (const [k, sz] of Object.entries(SIZES)) {
    cliShot(`S01-accueil-${k}`, `${A}/`, sz);
    cliShot(`S02-simple-${k}`, `${A}/product/etabli-atelier-simple`, sz);
    cliShot(`S03-gmce-rougeM-promo-future-${k}`, `${A}/product/gant-manutention-gmce?couleur=rouge&taille=M&image=1`, sz);
    cliShot(`S03-gmce-rougeM-promo-active-${k}`, `${B}/product/gant-manutention-gmce?couleur=rouge&taille=M&image=1`, sz);
  }
  cliShot("S03-gmce-rougeM-promo-future-long", `${A}/product/gant-manutention-gmce?couleur=rouge&taille=M&image=1`, "1440,1500");
  cliShot("S03-gmce-rougeM-promo-active-long", `${B}/product/gant-manutention-gmce?couleur=rouge&taille=M&image=1`, "1440,1500");
  cliShot("S01-catalogue-d", `${A}/search`, SIZES.d);
  cliShot("S03-gmce-bleuM-L-non-proposee-d", `${A}/product/gant-manutention-gmce?couleur=bleu&taille=M`, SIZES.d);
  cliShot("S03-gmce-url-bleuL-forcee-d", `${A}/product/gant-manutention-gmce?couleur=bleu&taille=L`, SIZES.d);
  cliShot("S04-esunny-acrylique300-d", `${A}/product/store-exterieur-esunny?toile=acrylique&largeur=300`, SIZES.d);
  cliShot("S04-esunny-url-acrylique400-forcee-d", `${A}/product/store-exterieur-esunny?toile=acrylique&largeur=400`, SIZES.d);
  cliShot("S04-esunny-acrylique300-m", `${A}/product/store-exterieur-esunny?toile=acrylique&largeur=300`, SIZES.m);

  // S05 panier — CDP : injection du brouillon panier puis rechargement.
  const s = await cdpSession();
  await nav(s, `${A}/cart`);
  for (const q of [1, 10, 20]) {
    const line = { public_item_key: "PI-SIMPLE001", public_family_key: "PF-SIMPLE01", family_slug: "etabli-atelier-simple", family_name: "Établi d'atelier SIMPLE (fixture)", variant_axes: {}, image_url: "/media/35121741c1a79f5009255975b0a0e4890e169b6e24a9c7ceca1fb2427ec984f1", quantity: q, windows: SIMPLE_WINDOWS };
    await evalJs(s, `localStorage.setItem("prodes_site_cart_v1", ${JSON.stringify(JSON.stringify([line]))}); true`);
    await nav(s, `${A}/cart`);
    for (const [k, sz] of Object.entries(SIZES)) await shot(s, `S05-panier-qty${q}-${k}`, sz);
  }
  // S05/S07 : soumission du devis simulé depuis l'UI (panier qty 20)
  await shot(s, "S07-avant-envoi-d", SIZES.d);
  await evalJs(s, `(() => { const set = (id, v) => { const el = document.getElementById(id); const proto = Object.getPrototypeOf(el); Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true })); }; set("sim-name", "Test BC1"); set("sim-email", "test@example.invalid"); return true; })()`);
  await sleep(300);
  await evalJs(s, `[...document.querySelectorAll("button")].find(b => b.textContent.includes("Simuler une demande de devis")).click(); true`);
  await sleep(2000);
  const receiptText = await evalJs(s, `document.querySelector('[role=status]')?.innerText ?? null`);
  await evalJs(s, `document.querySelector('[role=status]')?.scrollIntoView({block:"center"}); true`);
  await shot(s, "S07-recu-simulation-d", SIZES.d);
  // rejeu : même panier, même clé -> même reçu
  await evalJs(s, `[...document.querySelectorAll("button")].find(b => b.textContent.includes("Simuler une demande de devis")).click(); true`);
  await sleep(2000);
  const replayText = await evalJs(s, `document.querySelector('[role=status]')?.innerText ?? null`);
  log.push({ ui_receipt: receiptText, ui_replay: replayText });
  s.close();
} catch (e) {
  console.error("ERREUR", e);
  process.exitCode = 2;
} finally {
  for (const c of servers) c.kill("SIGTERM");
}
writeFileSync(join(root, "spike/logs/capture.json"), JSON.stringify(log, null, 2));
console.log(JSON.stringify(log, null, 2));
