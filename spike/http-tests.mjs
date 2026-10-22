#!/usr/bin/env node
// BC1-B — tests HTTP S05..S09 (Node 22, fetch natif, aucune dépendance).
// Lance lui-même trois instances `next start` (build requis) :
//   A : SPIKE_NOW_UTC=2026-10-22T20:00:00Z (défaut, PROMO GMCE future)
//   B : SPIKE_NOW_UTC=2026-11-15T12:00:00Z (PROMO GMCE active)
//   C : SPIKE_NOW_UTC=2025-12-01T00:00:00Z (avant toute fenêtre SELL)
// Usage : node spike/http-tests.mjs [portBase=3310]
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const portBase = Number(process.argv[2] ?? 3310);
const INSTANCES = {
  A: { now: "2026-10-22T20:00:00Z", port: portBase },
  B: { now: "2026-11-15T12:00:00Z", port: portBase + 1 },
  C: { now: "2025-12-01T00:00:00Z", port: portBase + 2 },
};
const children = [];
const results = [];

function startServer(name, { now, port }) {
  const child = spawn(join(root, "node_modules/.bin/next"), ["start", "-p", String(port)], {
    cwd: root,
    env: { ...process.env, SPIKE_NOW_UTC: now, NEXT_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", () => {});
  child.stderr.on("data", (d) => process.stderr.write(`[${name}] ${d}`));
  children.push(child);
}

async function waitReady(port) {
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/robots.txt`);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`serveur ${port} indisponible`);
}

const url = (inst, path) => `http://127.0.0.1:${INSTANCES[inst].port}${path}`;

async function post(inst, path, body, headers = {}) {
  const r = await fetch(url(inst, path), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
    redirect: "manual",
  });
  let json = null;
  const text = await r.text();
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: r.status, json, text, headers: r.headers };
}

function record(id, scenario, expected, obtained, pass) {
  results.push({ id, scenario, expected, obtained, verdict: pass ? "PASS" : "FAIL" });
}

let seq = 0;
const key = (p) => `${p}-${Date.now()}-${++seq}-bc1b`;
const contact = { name: "Test BC1", email: "test@example.invalid" };
const SIMPLE = (quantity, rate_id, unit_amount) => ({
  public_item_key: "PI-SIMPLE001",
  variant_axes: {},
  quantity,
  rate_id,
  unit_amount,
});
const sim = (j) => j?.simulation === true && j?.persistence === "NONE_CONTRACTUAL_SIMULATION";

async function run() {
  // ---------------- S05 paliers (instance A) ----------------
  for (const [q, rate, amount, lineAmount] of [
    [1, "RATE-PI-SIMPLE001-BASE-1", "189.00", "189.00"],
    [10, "RATE-PI-SIMPLE001-BASE-2", "179.50", "1795.00"],
    [20, "RATE-PI-SIMPLE001-BASE-3", "169.90", "3398.00"],
  ]) {
    const r = await post("A", "/api/site/quote", { idempotency_key: key("s05"), contact, lines: [SIMPLE(q, rate, amount)] });
    const l = r.json?.lines?.[0];
    record(
      `S05-qty${q}`,
      "S05",
      `200, ${rate}, unit ${amount}, ligne ${lineAmount}, total ${lineAmount}`,
      `${r.status}, ${l?.rate_id}, unit ${l?.unit_amount}, ligne ${l?.line_amount}, total ${r.json?.totals?.[0]?.lines_amount}`,
      r.status === 200 && l?.rate_id === rate && l?.unit_amount === amount && l?.line_amount === lineAmount && r.json?.totals?.[0]?.lines_amount === lineAmount && sim(r.json),
    );
  }
  // Franchissements : le palier précédent est refusé à la frontière (preuve que la frontière est lue).
  for (const [q, staleRate, staleAmount, expRate] of [
    [10, "RATE-PI-SIMPLE001-BASE-1", "189.00", "RATE-PI-SIMPLE001-BASE-2"],
    [9, "RATE-PI-SIMPLE001-BASE-2", "179.50", "RATE-PI-SIMPLE001-BASE-1"],
    [20, "RATE-PI-SIMPLE001-BASE-2", "179.50", "RATE-PI-SIMPLE001-BASE-3"],
    [19, "RATE-PI-SIMPLE001-BASE-3", "169.90", "RATE-PI-SIMPLE001-BASE-2"],
  ]) {
    const r = await post("A", "/api/site/quote", { idempotency_key: key("s05b"), contact, lines: [SIMPLE(q, staleRate, staleAmount)] });
    const exp = r.json?.line_errors?.[0]?.expected?.rate_id;
    record(
      `S05-frontiere-q${q}`,
      "S05",
      `409 PRICE_CHANGED, attendu ${expRate}`,
      `${r.status} ${r.json?.error?.code}, attendu ${exp}`,
      r.status === 409 && r.json?.error?.code === "PRICE_CHANGED" && exp === expRate,
    );
  }
  // Somme exacte multi-lignes (centimes) : 1795.00 + 38.70 + 299.00 = 2132.70
  {
    const r = await post("A", "/api/site/quote", {
      idempotency_key: key("s05sum"),
      contact,
      lines: [
        SIMPLE(10, "RATE-PI-SIMPLE001-BASE-2", "179.50"),
        { public_item_key: "PI-GMCE0003", variant_axes: { couleur: "bleu", taille: "M" }, quantity: 3, rate_id: "RATE-PI-GMCE0003-BASE-1", unit_amount: "12.90" },
        { public_item_key: "PI-ESUNNY02", variant_axes: { toile: "polyester", largeur: "300" }, quantity: 1, rate_id: "RATE-PI-ESUNNY02-BASE-1", unit_amount: "299.00" },
      ],
    });
    record("S05-somme-exacte", "S05", "200, total 2132.70", `${r.status}, total ${r.json?.totals?.[0]?.lines_amount}`, r.status === 200 && r.json?.totals?.[0]?.lines_amount === "2132.70");
  }

  // ---------------- S06 panier unique / serveur autoritaire ----------------
  {
    const r = await post("A", "/api/site/quote", {
      idempotency_key: key("s06"),
      contact,
      lines: [{ public_item_key: "PI-SIMPLE001", variant_axes: {}, quantity: 1 }],
    });
    record("S06-ligne-sans-prix-affiche", "S06", "400 INVALID_REQUEST (rate_id + unit_amount affichés obligatoires)", `${r.status} ${r.json?.error?.code}`, r.status === 400 && r.json?.error?.code === "INVALID_REQUEST");
  }
  {
    const r = await post("A", "/api/site/quote", { idempotency_key: key("s06"), contact, lines: [] });
    record("S06-panier-vide", "S06", "400 INVALID_REQUEST", `${r.status} ${r.json?.error?.code}`, r.status === 400 && r.json?.error?.code === "INVALID_REQUEST");
  }
  {
    const r = await post("A", "/api/site/quote", { idempotency_key: key("s06"), contact, lines: [SIMPLE(1, "RATE-PI-SIMPLE001-BASE-1", "189.00"), SIMPLE(2, "RATE-PI-SIMPLE001-BASE-1", "189.00")] });
    record("S06-ligne-dupliquee", "S06", "400 DUPLICATE_LINE", `${r.status} ${r.json?.error?.code}`, r.status === 400 && r.json?.error?.code === "DUPLICATE_LINE");
  }
  for (const path of ["/", "/cart", "/product/etabli-atelier-simple"]) {
    const r = await fetch(url("A", path));
    const html = await r.text();
    const cookie = r.headers.get("set-cookie");
    record(`S06-pas-de-cookie ${path}`, "S06", "200, aucun Set-Cookie, aucune mention cartId", `${r.status}, set-cookie=${cookie ?? "absent"}, cartId=${html.includes("cartId")}`, r.status === 200 && cookie === null && !html.includes("cartId"));
  }
  {
    const r = await post("A", "/api/site/quote", { idempotency_key: key("s06"), contact, lines: [SIMPLE(1, "RATE-PI-SIMPLE001-BASE-1", "189.00")] });
    record("S06-reponse-sans-cookie", "S06", "200, aucun Set-Cookie", `${r.status}, set-cookie=${r.headers.get("set-cookie") ?? "absent"}`, r.status === 200 && r.headers.get("set-cookie") === null);
  }
  {
    // Aucune action serveur : un appel Next-Action forgé ne doit rien exécuter.
    const r = await fetch(url("A", "/cart"), { method: "POST", headers: { "Next-Action": "0000000000000000000000000000000000000000", "Content-Type": "text/plain" }, body: "[]" });
    const t = await r.text();
    record("S06-next-action-forgee", "S06", "pas de 200 / pas de success:true", `${r.status}, success:true=${t.includes('"success":true')}`, r.status !== 200 && !t.includes('"success":true'));
  }

  // ---------------- S07 devis + idempotence ----------------
  {
    const k = key("s07");
    const payload = { idempotency_key: k, contact, lines: [SIMPLE(10, "RATE-PI-SIMPLE001-BASE-2", "179.50")] };
    const r1 = await post("A", "/api/site/quote", payload);
    record("S07-devis-recu", "S07", "200, simulation:true, persistence NONE_CONTRACTUAL_SIMULATION, kind QUOTE", `${r1.status}, simulation:${r1.json?.simulation}, ${r1.json?.persistence}, ${r1.json?.kind}`, r1.status === 200 && sim(r1.json) && r1.json?.kind === "QUOTE" && /^SIM-QUOTE-/.test(r1.json?.receipt_id ?? ""));
    const r2 = await post("A", "/api/site/quote", payload);
    record("S07-meme-cle-meme-payload", "S07", `200, même receipt_id ${r1.json?.receipt_id}`, `${r2.status}, ${r2.json?.receipt_id}, replay=${r2.json?.idempotent_replay}`, r2.status === 200 && r2.json?.receipt_id === r1.json?.receipt_id && r2.json?.idempotent_replay === true);
    const r3 = await post("A", "/api/site/quote", { ...payload, lines: [SIMPLE(11, "RATE-PI-SIMPLE001-BASE-2", "179.50")] });
    record("S07-meme-cle-payload-different", "S07", "409 DUPLICATE_KEY_DIFFERENT_PAYLOAD", `${r3.status} ${r3.json?.error?.code}`, r3.status === 409 && r3.json?.error?.code === "DUPLICATE_KEY_DIFFERENT_PAYLOAD");
    const r4 = await post("A", "/api/site/quote", { ...payload, idempotency_key: key("s07") });
    record("S07-autre-cle-nouveau-recu", "S07", "200, receipt_id différent", `${r4.status}, ${r4.json?.receipt_id}`, r4.status === 200 && r4.json?.receipt_id !== r1.json?.receipt_id);
    const r5 = await post("A", "/api/site/quote", { contact, lines: payload.lines });
    record("S07-cle-absente", "S07", "400 MISSING_IDEMPOTENCY_KEY", `${r5.status} ${r5.json?.error?.code}`, r5.status === 400 && r5.json?.error?.code === "MISSING_IDEMPOTENCY_KEY");
    const r6 = await post("A", "/api/site/quote", "{pas du json");
    record("S07-json-invalide", "S07", "400 INVALID_REQUEST", `${r6.status} ${r6.json?.error?.code}`, r6.status === 400 && r6.json?.error?.code === "INVALID_REQUEST");
  }

  // ---------------- S08 commande ----------------
  const GMCE_RM = (rate_id, unit_amount, quantity = 5) => ({ public_item_key: "PI-GMCE0001", variant_axes: { couleur: "rouge", taille: "M" }, quantity, rate_id, unit_amount });
  {
    const r = await post("A", "/api/site/order", { idempotency_key: key("s08"), contact, lines: [GMCE_RM("RATE-PI-GMCE0001-BASE-1", "12.40")] });
    record("S08-commande-acceptee", "S08", "200 ORDER, ligne 62.00, simulation", `${r.status} ${r.json?.kind}, ligne ${r.json?.lines?.[0]?.line_amount}, sim=${sim(r.json)}`, r.status === 200 && r.json?.kind === "ORDER" && r.json?.lines?.[0]?.line_amount === "62.00" && sim(r.json));
  }
  {
    const r = await post("A", "/api/site/order", { idempotency_key: key("s08"), contact, lines: [GMCE_RM("RATE-PI-GMCE0001-BASE-1", "1.00")] });
    record("S08-montant-falsifie", "S08", "409 PRICE_CHANGED, attendu 12.40", `${r.status} ${r.json?.error?.code}, attendu ${r.json?.line_errors?.[0]?.expected?.unit_amount}`, r.status === 409 && r.json?.error?.code === "PRICE_CHANGED" && r.json?.line_errors?.[0]?.expected?.unit_amount === "12.40");
  }
  {
    const r = await post("A", "/api/site/order", { idempotency_key: key("s08"), contact, lines: [GMCE_RM("RATE-PI-GMCE0001-BASE-1", "12.4")] });
    record("S08-meme-montant-autre-ecriture", "S08", "200 (12.4 == 12.40 en centimes)", `${r.status}`, r.status === 200);
  }
  for (const [id, line] of [
    ["S08-interdit-acrylique-400", { public_item_key: "PI-ESUNNY01", variant_axes: { toile: "acrylique", largeur: "400" }, quantity: 1, rate_id: "RATE-PI-ESUNNY01-BASE-1", unit_amount: "349.00" }],
    ["S08-absent-bleu-L", { public_item_key: "PI-GMCE0002", variant_axes: { couleur: "bleu", taille: "L" }, quantity: 1, rate_id: "RATE-PI-GMCE0002-BASE-1", unit_amount: "12.40" }],
    ["S08-item-inconnu", { public_item_key: "PI-GMCE0004", variant_axes: { couleur: "bleu", taille: "L" }, quantity: 1, rate_id: "RATE-PI-GMCE0002-BASE-1", unit_amount: "12.40" }],
    ["S08-axes-manquants", { public_item_key: "PI-GMCE0001", variant_axes: { couleur: "rouge" }, quantity: 1, rate_id: "RATE-PI-GMCE0001-BASE-1", unit_amount: "12.40" }],
  ]) {
    const r = await post("A", "/api/site/order", { idempotency_key: key("s08"), contact, lines: [line] });
    record(id, "S08", "400 INVALID_VARIANT", `${r.status} ${r.json?.error?.code}`, r.status === 400 && r.json?.error?.code === "INVALID_VARIANT");
  }
  {
    const r = await post("C", "/api/site/order", { idempotency_key: key("s08"), contact, lines: [GMCE_RM("RATE-PI-GMCE0001-BASE-1", "12.40")] });
    record("S08-hors-fenetre (instance C 2025-12-01)", "S08", "409 PRICE_WINDOW_UNAVAILABLE", `${r.status} ${r.json?.error?.code}`, r.status === 409 && r.json?.error?.code === "PRICE_WINDOW_UNAVAILABLE");
  }
  {
    const r = await post("A", "/api/site/order", { idempotency_key: key("s08"), contact, lines: [GMCE_RM("RATE-PI-GMCE0001-BASE-1", "12.40", 0)] });
    record("S08-quantite-zero", "S08", "400 INVALID_QUANTITY", `${r.status} ${r.json?.error?.code}`, r.status === 400 && r.json?.error?.code === "INVALID_QUANTITY");
  }
  {
    const r = await post("A", "/api/site/order", { idempotency_key: key("s08"), contact, lines: [GMCE_RM("RATE-PI-GMCE0001-BASE-1", "12.40"), { public_item_key: "PI-ESUNNY01", variant_axes: { toile: "acrylique", largeur: "400" }, quantity: 1, rate_id: "RATE-PI-ESUNNY01-BASE-1", unit_amount: "349.00" }] });
    record("S08-une-ligne-invalide-pas-de-recu", "S08", "400, aucun receipt_id", `${r.status}, receipt_id=${r.json?.receipt_id ?? "absent"}`, r.status === 400 && !r.json?.receipt_id);
  }
  // S03 côté serveur : PROMO future (A) puis active (B)
  {
    const rA = await post("A", "/api/site/order", { idempotency_key: key("s03"), contact, lines: [GMCE_RM("RATE-PI-GMCE0001-PROMO-1", "9.99")] });
    record("S03-promo-future-refusee (A)", "S03", "409 PRICE_CHANGED, attendu BASE-1", `${rA.status} ${rA.json?.error?.code}, ${rA.json?.line_errors?.[0]?.expected?.rate_id}`, rA.status === 409 && rA.json?.line_errors?.[0]?.expected?.rate_id === "RATE-PI-GMCE0001-BASE-1");
    const rB = await post("B", "/api/site/order", { idempotency_key: key("s03"), contact, lines: [GMCE_RM("RATE-PI-GMCE0001-PROMO-1", "9.99")] });
    record("S03-promo-active-acceptee (B)", "S03", "200, PROMO-1 9.99", `${rB.status}, ${rB.json?.lines?.[0]?.rate_id} ${rB.json?.lines?.[0]?.unit_amount}`, rB.status === 200 && rB.json?.lines?.[0]?.rate_id === "RATE-PI-GMCE0001-PROMO-1");
    const rB2 = await post("B", "/api/site/order", { idempotency_key: key("s03"), contact, lines: [GMCE_RM("RATE-PI-GMCE0001-BASE-1", "12.40")] });
    record("S03-base-perimee-pendant-promo (B)", "S03", "409 PRICE_CHANGED, attendu PROMO-1", `${rB2.status} ${rB2.json?.error?.code}, ${rB2.json?.line_errors?.[0]?.expected?.rate_id}`, rB2.status === 409 && rB2.json?.line_errors?.[0]?.expected?.rate_id === "RATE-PI-GMCE0001-PROMO-1");
  }

  // ---------------- S09 routes legacy -> 404 ----------------
  const legacy = [
    "/admin", "/admin/login", "/admin/produits", "/admin/devis", "/admin/catalogue",
    "/api/admin/auth", "/api/admin/products-list", "/api/admin/export-products",
    "/api/admin/ia/categories-list", "/api/admin/paniers-abandonnes/1/recover",
    "/api/admin/products/1", "/api/admin/devis/1", "/api/admin/site-config",
    "/api/checkout", "/checkout", "/checkout/confirmation",
    "/api/devis", "/api/devis-express", "/devis-express",
    "/api/revalidate", "/api/track", "/mes-commandes", "/mon-devis/PRODES-1",
    "/panier/abc", "/api/cart/share", "/api/cart/abandon", "/api/contact",
    "/api/search", "/api/product-pdf/x", "/api/products-by-handles", "/api/devis-status/1",
  ];
  const forged = { Cookie: "admin_session=forged", Authorization: "Bearer x" };
  for (const p of legacy) {
    for (const method of ["GET", "POST"]) {
      const r = await fetch(url("A", p), { method, headers: { ...forged, "Content-Type": "application/json" }, body: method === "POST" ? "{}" : undefined, redirect: "manual" });
      const t = await r.text();
      record(`S09 ${method} ${p}`, "S09", "404, pas de success:true", `${r.status}${t.includes('"success":true') ? " success:true" : ""}`, r.status === 404 && !t.includes('"success":true'));
    }
  }
  {
    const r = await fetch(url("A", "/api/site/quote"), { headers: forged });
    record("S09 GET /api/site/quote", "S09", "405 (POST seul)", `${r.status}`, r.status === 405);
  }
}

let exitCode = 0;
try {
  for (const [n, cfg] of Object.entries(INSTANCES)) startServer(n, cfg);
  await Promise.all(Object.values(INSTANCES).map((c) => waitReady(c.port)));
  await run();
} catch (e) {
  console.error("ERREUR", e);
  exitCode = 2;
} finally {
  for (const c of children) c.kill("SIGTERM");
}

const pad = (s, n) => String(s).padEnd(n);
console.log(`${pad("Cas", 52)} | ${pad("Attendu", 70)} | ${pad("Obtenu", 70)} | Verdict`);
for (const r of results) console.log(`${pad(r.id, 52)} | ${pad(r.expected, 70)} | ${pad(r.obtained, 70)} | ${r.verdict}`);
const fails = results.filter((r) => r.verdict === "FAIL").length;
const byScenario = {};
for (const r of results) {
  byScenario[r.scenario] ??= { PASS: 0, FAIL: 0 };
  byScenario[r.scenario][r.verdict]++;
}
console.log(`\nTotal ${results.length} cas, ${results.length - fails} PASS, ${fails} FAIL`);
console.log(JSON.stringify(byScenario));
mkdirSync(join(root, "spike/logs"), { recursive: true });
writeFileSync(join(root, "spike/logs/http-tests.json"), JSON.stringify({ instances: INSTANCES, results, byScenario }, null, 2));
process.exit(exitCode || (fails ? 1 : 0));
