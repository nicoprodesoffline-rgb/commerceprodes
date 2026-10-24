#!/usr/bin/env node
// Captures E7 via Chrome headless local + Chrome DevTools Protocol (WebSocket
// natif Node 22, aucune dépendance). Usage :
//   BASE_URL=http://127.0.0.1:3311 TAG=default node spike/screenshots.mjs
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3311";
const TAG = process.env.TAG ?? "default";
const OUT = path.resolve("spike/screenshots");
const PORT = 9333 + Math.floor(Math.random() * 500);
mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [[1440, 900], [1024, 768], [390, 844]];
const PAGES = TAG === "promo"
  ? [["S03-gmce-promo-active", "/famille/gant-manutention-gmce"]]
  : [
      ["S01-accueil", "/"],
      ["S02-simple", "/famille/etabli-atelier-simple"],
      ["S03-gmce-promo-future", "/famille/gant-manutention-gmce"],
      ["S04-esunny", "/famille/store-exterieur-esunny"],
      ["S05-panier", "/panier", "cart"],
    ];

const CART = [
  { public_item_key: "PI-SIMPLE001", variant_axes: {}, quantity: 10, family_name: "Établi d'atelier SIMPLE (fixture)" },
  { public_item_key: "PI-GMCE0001", variant_axes: { couleur: "rouge", taille: "M" }, quantity: 2, family_name: "Gant de manutention GMCE (fixture)" },
  { public_item_key: "PI-ESUNNY03", variant_axes: { largeur: "400", toile: "polyester" }, quantity: 1, family_name: "Store extérieur ESUNNY (fixture)" },
];

const profile = mkdtempSync(path.join(tmpdir(), "bc1d-chrome-"));
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "--no-first-run", "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let wsUrl;
for (let i = 0; i < 50 && !wsUrl; i++) {
  await sleep(200);
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    wsUrl = list.find((t) => t.type === "page")?.webSocketDebuggerUrl;
  } catch {}
}
if (!wsUrl) { console.error("NOT_TESTED_BROWSER: Chrome CDP injoignable"); chrome.kill(); process.exit(2); }

const ws = new WebSocket(wsUrl);
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let seq = 0;
const pending = new Map();
const waiters = [];
ws.addEventListener("message", (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  else if (m.method) for (const w of waiters.splice(0)) w(m);
});
const send = (method, params = {}) => new Promise((res) => { const id = ++seq; pending.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
const evaluate = async (expression) => (await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;
async function goto(url) {
  await send("Page.navigate", { url });
  for (let i = 0; i < 100; i++) { await sleep(100); if ((await evaluate("document.readyState")) === "complete") break; }
  await sleep(600);
}
async function shot(file) {
  const sw = await evaluate("JSON.stringify({scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth, wide: [...document.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().right > window.innerWidth + 1 && !e.closest('.overflow-x-auto')).slice(0,5).map(e => e.tagName + '.' + (e.className||'').toString().slice(0,40))})");
  console.log("mesure", path.basename(file), sw);
  const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, fromSurface: true });
  writeFileSync(file, Buffer.from(r.result.data, "base64"));
  console.log("capture", path.relative(process.cwd(), file));
}
async function fullHeight(w, h) {
  const height = Math.max(h, await evaluate("document.documentElement.scrollHeight"));
  await send("Emulation.setDeviceMetricsOverride", { width: w, height, deviceScaleFactor: 1, mobile: w < 500 });
}

await send("Page.enable");
await send("Runtime.enable");
for (const [w, h] of VIEWPORTS) {
  await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: w < 500 });
  for (const [name, p, mode] of PAGES) {
    if (mode === "cart") {
      await goto(BASE + "/");
      await evaluate(`localStorage.setItem("prodes_bc1d_cart_draft_v1", ${JSON.stringify(JSON.stringify(CART))}); true`);
      await goto(BASE + p);
      await sleep(800);
      await fullHeight(w, h);
      await shot(path.join(OUT, `${name}-${w}.png`));
      // Remplit le contact et simule une commande → reçu SIMULATION à l'écran
      await evaluate(`(() => {
        const set = (el, v) => { const d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value"); d.set.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true })); };
        const inputs = [...document.querySelectorAll('section[aria-labelledby="sim-heading"] input')];
        set(inputs[0], "Test BC1-D"); set(inputs[1], "test@example.invalid");
        return inputs.length; })()`);
      await sleep(300);
      await evaluate(`[...document.querySelectorAll("button")].find(b => b.textContent.includes("Simuler une commande")).click(); true`);
      await sleep(1200);
      await fullHeight(w, h);
      await shot(path.join(OUT, `${name}-recu-simulation-${w}.png`));
      await evaluate(`localStorage.clear(); true`);
      await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: w < 500 });
    } else {
      await goto(BASE + p);
      await fullHeight(w, h);
      await shot(path.join(OUT, `${name}-${w}.png`));
      await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: w < 500 });
    }
  }
}
// Vérification DOM de S04 : acrylique×400 jamais sélectionnable
if (TAG !== "promo") {
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await goto(BASE + "/famille/store-exterieur-esunny");
  const report = await evaluate(`(async () => {
    const out = [];
    const click = (t) => [...document.querySelectorAll('[role=group] button')].find(b => b.textContent.trim() === t).click();
    const state = () => document.querySelector('#item-heading').textContent + ' | ' + document.querySelector('#item-heading + p').textContent;
    out.push('initial: ' + state());
    click('400'); await new Promise(r => setTimeout(r, 200)); out.push('clic 400: ' + state());
    click('Acrylique'); await new Promise(r => setTimeout(r, 200)); out.push('clic Acrylique: ' + state());
    out.push('note: ' + document.querySelector('[data-testid=unavailable-combinations]').textContent);
    return out.join('\\n'); })()`);
  writeFileSync("spike/logs/s04-dom-check.log", report + "\n");
  console.log(report);
}
ws.close();
chrome.kill();
