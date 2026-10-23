// Recette navigateur complémentaire du reviewer BC3 (Chromium local, Playwright 1.61.1 en cache npx, axe-core 4.10.3 local).
// Serveur déjà lancé par le reviewer sur 127.0.0.1:3364 (base prodes_site_rv_bc3, génération F_GMCE_VARIANTS ACTIVE).
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
const require = createRequire("/Users/nico/.npm/_npx/e41f203b7505f1fb/node_modules/");
const { chromium } = require("playwright");
const B = "http://127.0.0.1:3364";
const OUT = "/Users/nico/Desktop/prodes-w1/review-bc3/evidence/W1/BC3/review/raw/ui/rv-extra";
const AXE = "/Users/nico/Developer/curated-media/frontend/node_modules/axe-core/axe.min.js";
const log = (...a) => console.log(...a);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM, headless: true });
log("Chromium", browser.version());
const consoleErr = [];
async function ctx(viewport = { width: 1440, height: 900 }, opts = {}) {
  const c = await browser.newContext({ viewport, locale: "fr-FR", ...opts });
  const p = await c.newPage();
  p.on("console", (m) => m.type() === "error" && consoleErr.push(`${p.url()} : ${m.text()}`));
  p.on("pageerror", (e) => consoleErr.push(`${p.url()} : pageerror ${e.message}`));
  p.on("dialog", async (d) => { consoleErr.push(`DIALOG ${d.type()} ${d.message()}`); await d.dismiss(); });
  return p;
}
async function axe(p, name) {
  await p.addScriptTag({ path: AXE });
  const r = await p.evaluate(async () => { const r = await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] } }); return { violations: r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.map((n) => n.target.join(" ")).slice(0, 6) })), incomplete: r.incomplete.map((v) => v.id), passes: r.passes.length }; });
  writeFileSync(`${OUT}/axe-${name}.json`, JSON.stringify(r, null, 2));
  log(`axe ${name} : ${r.violations.length} violation(s) ${r.violations.map((v) => `${v.id}/${v.impact}`).join(",")} ; incomplets: ${r.incomplete.join(",")} ; ${r.passes} passées`);
  return r;
}
async function targets(p, name) {
  const r = await p.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll("a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button]")) {
      const t = el.matches("input.sr-only") ? el.closest("label") : el;
      if (!t || t.closest(".sr-only") && document.activeElement !== t) continue;
      const r = t.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || getComputedStyle(t).visibility === "hidden") continue;
      const lab = el.closest("label"); const lr = lab ? lab.getBoundingClientRect() : null;
      const name = (t.textContent || t.getAttribute("aria-label") || t.getAttribute("name") || t.id || t.tagName).trim().replace(/\s+/g, " ").slice(0, 40);
      if (Math.min(r.width, r.height) < 34) out.push(`${t.tagName.toLowerCase()}${t.type ? "[" + t.type + "]" : ""} « ${name} » ${Math.round(r.width)}×${Math.round(r.height)}${lr ? ` (label englobant ${Math.round(lr.width)}×${Math.round(lr.height)})` : ""}`);
    }
    return out;
  });
  log(`cibles < 34 px (largeur OU hauteur) ${name} : ${r.length}${r.length ? " → " + r.join(" | ") : ""}`);
  return r;
}
async function hscroll(p, label) {
  const { sw, cw } = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  log(`défilement horizontal ${label} : ${sw > cw + 1 ? `OUI (${sw} > ${cw})` : "non"}`);
}
async function focusAudit(p, name, max = 60) {
  // Tous les arrêts de tabulation de la page : focus visible (outline ou box-shadow) ?
  await p.evaluate(() => document.activeElement?.blur());
  const bad = []; let n = 0; const seen = new Set();
  for (let i = 0; i < max; i++) {
    await p.keyboard.press("Tab");
    const info = await p.evaluate(() => {
      const el = document.activeElement; if (!el || el === document.body) return null;
      const t = el.matches("input.sr-only") ? el.closest("label") ?? el : el;
      const cs = getComputedStyle(t);
      const key = el.outerHTML.slice(0, 120);
      return { key, tag: el.tagName.toLowerCase(), name: (el.getAttribute("aria-label") || el.textContent || el.id || "").trim().replace(/\s+/g, " ").slice(0, 40), outline: cs.outlineStyle !== "none" && cs.outlineWidth !== "0px", shadow: cs.boxShadow !== "none" };
    });
    if (!info) break; if (seen.has(info.key)) break; seen.add(info.key); n++;
    if (!info.outline && !info.shadow) bad.push(`${info.tag} « ${info.name} »`);
  }
  log(`focus ${name} : ${n} arrêts, sans indicateur visible : ${bad.length}${bad.length ? " → " + bad.join(" | ") : ""}`);
}
const shot = async (p, n) => { await p.screenshot({ path: `${OUT}/${n}.png`, fullPage: true }); log(`capture ${n}.png (${p.url().replace(B, "")}, ${p.viewportSize().width}px)`); };

// ── K1 : parcours clavier complet menu → catégorie → fiche → variante → quantité → panier → devis → confirmation
log("\n## K1 parcours clavier complet (aucun clic)");
const p = await ctx();
await p.goto(B + "/");
const tabUntil = async (pred, max = 80) => { for (let i = 0; i < max; i++) { await p.keyboard.press("Tab"); const ok = await p.evaluate(pred); if (ok) return i + 1; } throw new Error("non atteint : " + pred); };
let t = await tabUntil(() => /Catégories/.test(document.activeElement?.textContent ?? ""));
await p.keyboard.press("Enter"); log(`menu Catégories atteint en ${t} Tab, ouvert (Entrée) : ${await p.evaluate(() => document.activeElement?.getAttribute("aria-expanded"))}`);
t = await tabUntil(() => /Signalétique/.test(document.activeElement?.textContent ?? "") && document.activeElement?.tagName === "A");
await p.keyboard.press("Enter"); await p.waitForURL(/categorie/); log(`catégorie : ${p.url().replace(B, "")} (${t} Tab)`);
t = await tabUntil(() => /famille\/gmce-demo/.test(document.activeElement?.getAttribute("href") ?? ""));
await p.keyboard.press("Enter"); await p.waitForURL(/famille/); log(`fiche : ${p.url().replace(B, "")} (${t} Tab)`);
await p.getByTestId("qty-price").getByText(/^Pour 1 : /).waitFor();
t = await tabUntil(() => document.activeElement?.getAttribute("type") === "radio");
await p.keyboard.press("ArrowRight"); await p.waitForTimeout(200);
log(`variante par flèche : référence = ${await p.getByTestId("item-ref").textContent()} ; url = ${p.url().replace(B, "")}`);
t = await tabUntil(() => document.activeElement?.getAttribute("inputmode") === "numeric");
await p.keyboard.press("ControlOrMeta+A"); await p.keyboard.type("10");
await p.getByTestId("qty-price").getByText(/^Pour 10 : /).waitFor();
log(`quantité 10 : « ${(await p.getByTestId("qty-price").textContent()).trim()} »`);
t = await tabUntil(() => /Ajouter au panier/.test(document.activeElement?.textContent ?? ""));
await p.keyboard.press("Enter"); await p.getByRole("status").getByText(/Ajouté au panier/).waitFor();
t = await tabUntil(() => /Voir le panier/.test(document.activeElement?.textContent ?? ""));
await p.keyboard.press("Enter"); await p.waitForURL(/panier/); await p.getByTestId("cart-total").getByText(/€/).waitFor();
log(`panier : total « ${(await p.getByTestId("cart-total").textContent()).trim()} »`);
t = await tabUntil(() => /Demander un devis/.test(document.activeElement?.textContent ?? ""));
await p.keyboard.press("Enter"); await p.waitForURL(/devis/); await p.getByRole("heading", { name: "Récapitulatif" }).waitFor();
t = await tabUntil(() => document.activeElement?.id === "f-org" || /organisation/i.test(document.activeElement?.getAttribute("name") ?? "") || document.activeElement?.tagName === "INPUT");
// Champs piégés XSS saisis au clavier
const X = { org: "<script>alert('org')</script>", name: '"><img src=x onerror=alert(1)>', email: "kb@example.fr", msg: "javascript:alert(1) <b>gras</b>" };
await p.keyboard.type(X.org); await p.keyboard.press("Tab"); await p.keyboard.type(X.name); await p.keyboard.press("Tab"); await p.keyboard.type(X.email);
t = await tabUntil(() => document.activeElement?.id === "f-message");
await p.keyboard.type(X.msg);
t = await tabUntil(() => document.activeElement?.getAttribute("data-testid") === "submit");
await p.keyboard.press("Enter");
await p.getByTestId("result-received").waitFor({ timeout: 10000 });
const focusedHeading = await p.evaluate(() => document.activeElement?.textContent);
const ref = (await p.getByTestId("receipt-ref").textContent()).trim();
log(`devis envoyé au clavier : titre focalisé « ${focusedHeading} », référence ${ref}`);
log(`DOM après envoi : <img onerror> injecté = ${await p.evaluate(() => !!document.querySelector("img[src='x']"))} ; <script>alert = ${await p.evaluate(() => [...document.scripts].some((s) => s.textContent.includes("alert('org')")))}`);
await shot(p, "K1-devis-recu-clavier");
const link = (await p.getByTestId("receipt-link").textContent()).trim();
log(`lien de consultation : ${link.replace(/code=[^&]+/, "code=<masqué>")} (code dans le fragment : ${/#.*code=/.test(link)})`);

// ── R1 : reçu, fragment, Referer, ré-affichage
log("\n## R1 reçu : fragment, Referer, persistance du code");
const r = await ctx();
const reqs = [];
r.on("request", (q) => reqs.push({ url: q.url(), referer: q.headers()["referer"] ?? null }));
await r.goto(link);
await r.getByTestId("receipt-found").waitFor();
log(`reçu affiché ; location.hash après consultation contient le code : ${await r.evaluate(() => /code=/.test(location.hash))}`);
log(`champ « Code d'accès » pré-rempli (type password) : ${(await r.locator("#r-code").inputValue()).length > 0}`);
log(`requêtes portant le code en paramètre d'URL : ${reqs.filter((q) => /access_token=/.test(q.url)).map((q) => q.url.replace(/access_token=[^&]+/, "access_token=<masqué>")).join(" ; ")}`);
log(`Referer contenant le code : ${reqs.some((q) => q.referer && /code=|access_token/.test(q.referer))} ; Referers vus : ${[...new Set(reqs.map((q) => q.referer))].join(" ; ")}`);
await axe(r, "recu-trouve"); await targets(r, "reçu"); await hscroll(r, "reçu 1440"); await focusAudit(r, "reçu");
await shot(r, "R1-recu-1440");
await r.getByRole("link", { name: "Panier" }).first().click(); await r.waitForURL(/panier/);
log(`navigation reçu → panier : document.referrer = « ${await r.evaluate(() => document.referrer)} »`);
await r.goBack(); await r.waitForTimeout(800);
log(`retour arrière : code de nouveau dans l'URL = ${await r.evaluate(() => /code=/.test(location.hash))} ; reçu ré-affiché = ${await r.getByTestId("receipt-found").isVisible().catch(() => false)}`);
await r.context().close();

// ── A11Y : axe + cibles + focus + reflow sur toutes les surfaces
log("\n## A11Y axe / cibles / focus sur les surfaces non couvertes par le builder");
const a = await ctx();
await a.goto(B + "/categorie/signaletique"); await axe(a, "categorie"); await targets(a, "catégorie"); await focusAudit(a, "catégorie");
await a.goto(B + "/recherche?q=gmce"); await axe(a, "recherche"); await targets(a, "recherche");
await a.goto(B + "/famille/inconnue"); await axe(a, "404"); log(`404 : statut titre « ${await a.title()} »`);
await a.goto(B + "/famille/gmce-demo"); await a.getByTestId("qty-price").getByText(/^Pour 1 : /).waitFor(); await focusAudit(a, "fiche");
await a.getByRole("button", { name: "Ajouter au panier" }).click(); await a.getByRole("status").getByText(/Ajouté/).waitFor();
await a.goto(B + "/panier"); await a.getByTestId("cart-total").getByText(/€/).waitFor(); await focusAudit(a, "panier");
await a.goto(B + "/commande"); await a.getByRole("heading", { name: "Récapitulatif" }).waitFor();
await axe(a, "commande"); await targets(a, "commande"); await focusAudit(a, "commande");
const inputs = await a.$$eval("form input, form textarea", (els) => els.map((e) => e.id));
log(`champs commande : ${inputs.join(",")}`);
for (const id of inputs) { if (/org/.test(id)) await a.fill("#" + id, "Mairie"); else if (/name|contact/.test(id)) await a.fill("#" + id, "Jean Dupont"); else if (/mail/.test(id)) await a.fill("#" + id, "j@d.fr"); }
await a.getByTestId("order-confirm").check();
await a.getByTestId("submit").click(); await a.getByTestId("result-received").waitFor();
await axe(a, "commande-recue"); await targets(a, "commande reçue");
await shot(a, "A11Y-commande-recue-1440");
await a.goto(B + "/devis"); await a.waitForTimeout(800); await axe(a, "devis-panier-vide");

log("\n## REFLOW 1440 / 1024 / 390 / 320 et zoom CSS 200 % (1280 px) sur chaque surface");
for (const [w, h, dsf] of [[1440, 900, 1], [1024, 768, 1], [390, 844, 2], [320, 640, 2]]) {
  const v = await ctx({ width: w, height: h }, { deviceScaleFactor: dsf });
  await v.goto(B + "/famille/gmce-demo"); await v.getByTestId("qty-price").getByText(/^Pour 1 : /).waitFor();
  await v.getByRole("button", { name: "Ajouter au panier" }).click(); await v.getByRole("status").getByText(/Ajouté/).waitFor();
  for (const path of ["/", "/categorie/signaletique", "/famille/gmce-demo", "/recherche?q=gmce", "/panier", "/devis", "/commande", "/recu", "/famille/inconnue"]) {
    await v.goto(B + path); await v.waitForLoadState("networkidle"); await hscroll(v, `${w}px ${path}`);
  }
  if (w === 320) { await v.goto(B + "/commande"); await v.waitForLoadState("networkidle"); await shot(v, "REFLOW-commande-320"); await v.goto(B + "/famille/gmce-demo"); await v.waitForLoadState("networkidle"); await shot(v, "REFLOW-fiche-320"); }
  await v.context().close();
}
const z = await ctx({ width: 1280, height: 800 });
await z.goto(B + "/famille/gmce-demo"); await z.getByTestId("qty-price").getByText(/^Pour 1 : /).waitFor();
await z.getByRole("button", { name: "Ajouter au panier" }).click(); await z.getByRole("status").getByText(/Ajouté/).waitFor();
for (const path of ["/", "/famille/gmce-demo", "/panier", "/commande", "/recu"]) {
  await z.goto(B + path); await z.waitForLoadState("networkidle");
  await z.evaluate(() => { document.documentElement.style.zoom = "2"; });
  await z.waitForTimeout(200);
  const res = await z.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, bw: Math.max(...[...document.querySelectorAll("body *")].map((e) => e.getBoundingClientRect().right)) }));
  log(`zoom CSS 200 % ${path} : scrollWidth ${res.sw} / clientWidth ${res.cw} ${res.sw > res.cw + 1 ? "→ DÉFILEMENT HORIZONTAL" : "→ ok"}`);
  if (path === "/commande") await shot(z, "ZOOM-css200-commande");
}
await z.context().close();

log("\n## console :", consoleErr.length, "entrée(s)");
for (const e of consoleErr) log("  " + e);
await browser.close();
