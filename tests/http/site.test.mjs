// Tests HTTP du SITE sur le contrat C0 gelé (W1/A2) — `node --test tests/http/site.test.mjs`.
//
// Prérequis : `npm run build`. Chaque bloc lance SON serveur `next start` sur 127.0.0.1:3341
// (PID tenu par le test, tué par le test : jamais de kill global), avec une source fixture C0
// (`SITE_CATALOG_SOURCE=fixture`, `SITE_CATALOG_FIXTURE`) et un instant figé `SITE_NOW_UTC`.
// Chaque test cite le cas `c0/fixtures/VERDICTS.json` ou la fixture qu'il utilise.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const PORT = 3341;
const BASE = `http://127.0.0.1:${PORT}`;
const C0 = path.join(ROOT, "c0", "fixtures");
const ORACLE = JSON.parse(readFileSync(path.join(C0, "VERDICTS.json"), "utf8")).cases;

// ── Serveur ──────────────────────────────────────────────────────────────────

async function portAnswers() {
  try {
    await fetch(BASE + "/", { redirect: "manual", signal: AbortSignal.timeout(500) });
    return true;
  } catch {
    return false;
  }
}

async function startServer(env) {
  assert.ok(existsSync(path.join(ROOT, ".next", "BUILD_ID")), "build absent : lancer `npm run build` avant les tests");
  assert.equal(await portAnswers(), false, `port ${PORT} déjà occupé : aucun serveur étranger ne doit répondre`);
  const child = spawn(process.execPath, [path.join(ROOT, "node_modules", "next", "dist", "bin", "next"), "start", "-H", "127.0.0.1", "-p", String(PORT)], {
    cwd: ROOT,
    env: { PATH: process.env.PATH, HOME: process.env.HOME, NEXT_TELEMETRY_DISABLED: "1", ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const logs = [];
  child.stdout.on("data", (d) => logs.push(String(d)));
  child.stderr.on("data", (d) => logs.push(String(d)));
  let exited = false;
  child.on("exit", () => (exited = true));
  const deadline = Date.now() + 30_000;
  while (!(await portAnswers())) {
    if (exited) throw new Error(`serveur arrêté au démarrage :\n${logs.join("")}`);
    if (Date.now() > deadline) throw new Error("serveur non prêt en 30 s");
    await new Promise((r) => setTimeout(r, 150));
  }
  console.log(`# serveur PID ${child.pid} ${JSON.stringify(env)}`);
  return { child, logs, isExited: () => exited };
}

async function stopServer(server) {
  if (!server || server.isExited()) return;
  const done = new Promise((r) => server.child.once("exit", r));
  process.kill(server.child.pid, "SIGTERM"); // PID lancé par ce test uniquement
  const timer = setTimeout(() => !server.isExited() && process.kill(server.child.pid, "SIGKILL"), 10_000);
  await done;
  clearTimeout(timer);
  for (let i = 0; i < 40 && (await portAnswers()); i++) await new Promise((r) => setTimeout(r, 100));
  assert.equal(await portAnswers(), false, `port ${PORT} encore occupé après l'arrêt du PID ${server.child.pid}`);
  console.log(`# serveur PID ${server.child.pid} arrêté`);
}

function scenario(name, env, body) {
  describe(name, () => {
    let server;
    before(async () => (server = await startServer(env)));
    after(async () => stopServer(server));
    body();
  });
}

// ── HTTP ─────────────────────────────────────────────────────────────────────

async function http(method, p, { body, headers = {} } = {}) {
  const res = await fetch(BASE + p, {
    method,
    headers: body === undefined ? headers : { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : typeof body === "string" || body instanceof Uint8Array ? body : JSON.stringify(body),
    redirect: "manual",
  });
  const bytes = new Uint8Array(await res.arrayBuffer());
  const text = new TextDecoder().decode(bytes);
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* non JSON */
  }
  return { status: res.status, headers: res.headers, bytes, text, json };
}
const get = (p, o) => http("GET", p, o);
const post = (p, body, o = {}) => http("POST", p, { ...o, body });
const preview = (lines) => post("/api/site/cart/preview", { lines });
const doc = (rel) => readFileSync(path.join(C0, "documents", rel));
const docJson = (rel) => JSON.parse(doc(rel).toString("utf8"));
const sha256 = (b) => createHash("sha256").update(b).digest("hex");

function at(obj, dotted) {
  return dotted.split(".").reduce((o, k) => (o === null || o === undefined ? undefined : o[k]), obj);
}

/** Vérifie une réponse de devis/commande contre l'oracle VERDICTS.json du cas cité. */
function assertBusinessOracle(r, caseId) {
  const o = ORACLE[caseId];
  assert.ok(o, `cas ${caseId} absent de VERDICTS.json`);
  assert.equal(r.json?.persistence, "NONE_UNTIL_BC4", `${caseId} : persistence`);
  assert.equal(r.json?.durable, false, `${caseId} : durable`);
  const v = r.json?.verdict;
  assert.ok(v, `${caseId} : verdict absent (HTTP ${r.status} ${r.text.slice(0, 200)})`);
  assert.equal(v.accepted, o.accepted, `${caseId} : accepted`);
  assert.equal(v.outcome, o.outcome, `${caseId} : outcome`);
  assert.deepEqual(v.error_codes, o.error_codes, `${caseId} : error_codes`);
  for (const [k, expected] of Object.entries(o.expect ?? {})) assert.deepEqual(at(v, k), expected, `${caseId} : ${k}`);
  assert.equal(r.status, o.accepted ? 200 : r.status, `${caseId} : HTTP`);
  if (!o.accepted) assert.ok(r.status >= 400, `${caseId} : refus en HTTP ${r.status}`);
}

// ── Données de référence ─────────────────────────────────────────────────────

const S7 = "F_SELL_WINDOWS/snapshot_s7.json";
const S7_NOW = "2026-10-20T09:00:00Z"; // instant des cas F_QUOTE_ORDER.* sur snapshot_s7
const PANNEAU = "PI-000000CHJ"; // F_SELL_WINDOWS : paliers 1–9 / 10–19 / 20+
const POTELET = "PI-000000CJS"; // F_SELL_WINDOWS : palier 5+ futur (2026-11-01)
const CONTACT = { organisation_name: "STAGING_FIXTURE Mairie Exemple", contact_name: "STAGING_FIXTURE Contact", email: "achats@example.invalid", phone: null };

function orderFromPreview(pv, overrides = {}) {
  return {
    contract_version: "site_business.v1",
    kind: "order",
    idempotency_key: `order-test-${Math.random().toString(36).slice(2, 12)}`,
    catalogue_sequence: pv.catalogue_sequence,
    contact: CONTACT,
    currency: "EUR",
    total_amount: pv.total_amount,
    lines: pv.lines.map((l) => ({
      public_item_key: l.public_item_key,
      variant_axes: l.variant_axes,
      quantity: l.quantity,
      rate_id: l.selection.rate_id,
      unit_amount: l.selection.unit_amount,
      line_total: l.line_total,
    })),
    ...overrides,
  };
}

// Liste du spike BC1-D (spike/http-tests.mjs, S09) : 36 chemins legacy.
const LEGACY = [
  "/admin", "/admin/login", "/admin/devis", "/admin/devis/1", "/admin/produits", "/admin/catalogue", "/admin/import",
  "/api/admin/auth", "/api/admin/export-products", "/api/admin/products-list", "/api/admin/ia/categories-list",
  "/api/admin/paniers-abandonnes/1/recover", "/api/admin/products/1", "/api/admin/devis/1", "/api/admin/site-config",
  "/api/checkout", "/checkout", "/checkout/confirmation", "/api/checkout/bon-de-commande",
  "/api/devis", "/api/devis-express", "/devis-express", "/api/devis-status/X", "/api/revalidate", "/api/track",
  "/mes-commandes", "/mon-devis/X", "/panier/abc", "/api/cart/share", "/api/cart/abandon", "/cart",
  "/api/contact", "/api/search", "/api/product-by-sku", "/api/products-by-handles", "/api/product-pdf/x",
];

// ═════════════════════════════════════════════════════════════════════════════
// A. F_SELL_WINDOWS/snapshot_s7.json à 2026-10-20T09:00:00Z
// ═════════════════════════════════════════════════════════════════════════════

scenario(`A — ${S7} @ ${S7_NOW}`, { SITE_CATALOG_SOURCE: "fixture", SITE_CATALOG_FIXTURE: S7, SITE_NOW_UTC: S7_NOW }, () => {
  test("pages 200 : accueil, catégories (parent et feuille), familles, panier — fixture snapshot_s7", async () => {
    const home = await get("/");
    assert.equal(home.status, 200);
    assert.match(home.text, /STAGING_FIXTURE Panneau à paliers/);
    assert.match(home.text, /STAGING_FIXTURE Potelet/);
    assert.match(home.text, /data-testid="catalogue-sequence">7</);
    for (const p of ["/categorie/signaletique", "/categorie/mobilier", "/categorie/mobilier-chaises", "/famille/panneau-paliers", "/famille/potelet-paliers", "/panier"]) {
      const r = await get(p);
      assert.equal(r.status, 200, p);
      assert.match(r.text, /STAGING_FIXTURE/, p);
    }
    const parent = await get("/categorie/mobilier");
    assert.match(parent.text, /href="\/categorie\/mobilier-chaises"/, "sous-catégorie issue de parent_category_key");
    for (const p of ["/famille/inconnue", "/categorie/inconnue"]) assert.equal((await get(p)).status, 404, p);
  });

  test("fiche Famille : fenêtres publiées affichées telles quelles, fenêtre expirée masquée — snapshot_s7 PI-000000CHJ", async () => {
    const r = await get("/famille/panneau-paliers");
    for (const rate of ["R-401-B1", "R-401-T10", "R-401-T20", "R-401-P2", "R-401-B2"]) assert.match(r.text, new RegExp(`data-rate-id="${rate}"`), rate);
    for (const rate of ["R-401-B0", "R-401-P1"]) assert.doesNotMatch(r.text, new RegExp(`data-rate-id="${rate}"`), `${rate} expirée à ${S7_NOW}`);
    assert.match(r.text, /data-rate-id="R-401-P2" data-state="FUTURE"/);
  });

  test("médias : octets servis = SHA-256 et taille déclarés, bon Content-Type — snapshot_s7 media_refs", async () => {
    const refs = docJson(S7).media_refs;
    assert.equal(refs.length, 2);
    for (const m of refs) {
      const r = await get(`/media/${m.sha256}`);
      assert.equal(r.status, 200);
      assert.equal(r.headers.get("content-type"), m.mime);
      assert.equal(r.bytes.length, m.size);
      assert.equal(sha256(r.bytes), m.sha256);
    }
    // Média C0 existant mais NON déclaré par la génération servie (gmce_item_rouge, F_GMCE_VARIANTS) → 404.
    assert.equal((await get("/media/b020140e8822d96407cce4ec28d1ee2df7c25cf7c98f8e2fe0ee49bd73039c6c")).status, 404);
    assert.equal((await get(`/media/${"0".repeat(64)}`)).status, 404);
    assert.equal((await get("/media/not-a-sha")).status, 404);
  });

  test("cart/preview : paliers 1–9 / 10–19 / 20+ par selectPrice — cas F_SELL_WINDOWS.select_qty{1,9,10,19,20}_now (même fenêtres à 09:00Z)", async () => {
    const expected = [
      [1, "R-401-B1", "12.00", "12.00", "F_SELL_WINDOWS.select_qty1_now"],
      [9, "R-401-B1", "12.00", "108.00", "F_SELL_WINDOWS.select_qty9_now"],
      [10, "R-401-T10", "11.00", "110.00", "F_SELL_WINDOWS.select_qty10_now"],
      [19, "R-401-T10", "11.00", "209.00", "F_SELL_WINDOWS.select_qty19_now"],
      [20, "R-401-T20", "10.00", "200.00", "F_SELL_WINDOWS.select_qty20_now"],
    ];
    for (const [q, rate, unit, total, caseId] of expected) {
      assert.equal(ORACLE[caseId].expect["selection.rate_id"], rate, `oracle ${caseId}`);
      const r = await preview([{ public_item_key: PANNEAU, variant_axes: {}, quantity: q }]);
      assert.equal(r.status, 200);
      const l = r.json.lines[0];
      assert.equal(l.accepted, true, `q=${q}`);
      assert.equal(l.selection.rate_id, rate, `q=${q}`);
      assert.equal(l.selection.unit_amount, unit, `q=${q}`);
      assert.equal(typeof l.selection.unit_amount, "string");
      assert.equal(l.line_total, total, `q=${q}`);
      assert.equal(r.json.total_amount, total);
      assert.equal(r.json.catalogue_sequence, 7);
      assert.equal(r.json.instant_utc, S7_NOW);
    }
  });

  test("cart/preview : franchissement exact des seuils 10 et 20 (CE-T02) — snapshot_s7 PI-000000CHJ", async () => {
    const rate = async (q) => (await preview([{ public_item_key: PANNEAU, variant_axes: {}, quantity: q }])).json.lines[0].selection.rate_id;
    assert.equal(await rate(9), "R-401-B1");
    assert.equal(await rate(10), "R-401-T10");
    assert.equal(await rate(19), "R-401-T10");
    assert.equal(await rate(20), "R-401-T20");
  });

  test("DUPLICATE_LINE : 5 + 5 refusé, 10 en une ligne → palier 10 (C1, R-01) — cas F_QUOTE_ORDER.order_duplicate_lines_tier_bypass", async () => {
    const dup = await preview([
      { public_item_key: PANNEAU, variant_axes: {}, quantity: 5 },
      { public_item_key: PANNEAU, variant_axes: {}, quantity: 5 },
    ]);
    assert.equal(dup.status, 422);
    assert.deepEqual(dup.json.error_codes, ["DUPLICATE_LINE"]);
    assert.equal(dup.json.lines.length, 0, "aucune sélection sur une requête en double");
    const one = await preview([{ public_item_key: PANNEAU, variant_axes: {}, quantity: 10 }]);
    assert.equal(one.json.lines[0].selection.rate_id, "R-401-T10");
    const order = await post("/api/site/order", doc("F_QUOTE_ORDER/order_duplicate_lines_tier_bypass.json"));
    assertBusinessOracle(order, "F_QUOTE_ORDER.order_duplicate_lines_tier_bypass");
    assert.equal(order.status, 422);
    const quote = await post("/api/site/quote", doc("F_QUOTE_ORDER/quote_duplicate_lines.json"));
    assertBusinessOracle(quote, "F_QUOTE_ORDER.quote_duplicate_lines");
  });

  test("commande valide : verdict C0 RECEIVED mais NONE_UNTIL_BC4, jamais durable ni rejouée — cas F_QUOTE_ORDER.order_valid", async () => {
    const bytes = doc("F_QUOTE_ORDER/order_valid.json");
    const a = await post("/api/site/order", bytes);
    assertBusinessOracle(a, "F_QUOTE_ORDER.order_valid");
    assert.equal(a.status, 200);
    // Registre d'idempotence vide : le même POST n'est PAS un REPLAY_SAME_RECEIPT (rien n'a été enregistré).
    const b = await post("/api/site/order", bytes);
    assert.equal(b.json.verdict.outcome, "RECEIVED");
    assert.notEqual(b.json.verdict.outcome, "REPLAY_SAME_RECEIPT");
    assert.equal(b.json.verdict.receipt.receipt_ref, undefined, "aucun receipt_ref : rien n'est persisté");
    for (const r of [a, b]) assert.ok(!r.text.includes('"success"'));
  });

  test("bout en bout : aperçu → commande des lignes affichées acceptée ; montant falsifié → PRICE_CHANGED — snapshot_s7", async () => {
    const pv = (await preview([{ public_item_key: PANNEAU, variant_axes: {}, quantity: 12 }, { public_item_key: POTELET, variant_axes: {}, quantity: 3 }])).json;
    assert.equal(pv.accepted, true);
    assert.equal(pv.total_amount, "147.75"); // 12 × 11.00 + 3 × 5.25, centimes exacts
    const ok = await post("/api/site/order", orderFromPreview(pv));
    assert.equal(ok.status, 200);
    assert.equal(ok.json.verdict.receipt.total_amount, "147.75");
    const forged = orderFromPreview(pv);
    forged.lines[0].unit_amount = "1.00";
    forged.lines[0].line_total = "12.00";
    forged.total_amount = "27.75";
    const bad = await post("/api/site/order", forged);
    assert.equal(bad.status, 409);
    assert.deepEqual(bad.json.verdict.error_codes, ["PRICE_CHANGED"]);
  });

  test("PRICE_CHANGED : montant falsifié et palier franchi — cas F_QUOTE_ORDER.order_falsified_amount, order_tier_crossed", async () => {
    assertBusinessOracle(await post("/api/site/order", doc("F_QUOTE_ORDER/order_falsified_amount.json")), "F_QUOTE_ORDER.order_falsified_amount");
    assertBusinessOracle(await post("/api/site/order", doc("F_QUOTE_ORDER/order_tier_crossed.json")), "F_QUOTE_ORDER.order_tier_crossed");
    // Quantité 9 affichée, 10 envoyée avec le prix du palier 1–9 (aperçu réel).
    const pv = (await preview([{ public_item_key: PANNEAU, variant_axes: {}, quantity: 9 }])).json;
    const o = orderFromPreview(pv);
    o.lines[0].quantity = 10;
    o.lines[0].line_total = "120.00";
    o.total_amount = "120.00";
    const r = await post("/api/site/order", o);
    assert.equal(r.status, 409);
    assert.deepEqual(r.json.verdict.error_codes, ["PRICE_CHANGED"]);
  });

  test("CART_STALE / CATALOG_CHANGED : génération portée par le panier ≠ génération servie (CE-T12) — cas F_QUOTE_ORDER.order_stale_generation, quote_stale_generation", async () => {
    assertBusinessOracle(await post("/api/site/order", doc("F_QUOTE_ORDER/order_stale_generation.json")), "F_QUOTE_ORDER.order_stale_generation");
    assertBusinessOracle(await post("/api/site/quote", doc("F_QUOTE_ORDER/quote_stale_generation.json")), "F_QUOTE_ORDER.quote_stale_generation");
    const pv = (await preview([{ public_item_key: PANNEAU, variant_axes: {}, quantity: 1 }])).json;
    const stale = await post("/api/site/order", orderFromPreview(pv, { catalogue_sequence: 6 }));
    assert.equal(stale.status, 409);
    assert.deepEqual(stale.json.verdict.error_codes, ["CART_STALE"]);
  });

  test("devis non chiffré : aucune fenêtre pour 5 Potelets maintenant → ligne priced:false, commande refusée — cas F_QUOTE_ORDER.quote_unpriced_no_window", async () => {
    const pv = await preview([{ public_item_key: POTELET, variant_axes: {}, quantity: 5 }]);
    assert.equal(pv.status, 200);
    assert.deepEqual(pv.json.lines[0].error_codes, ["PRICE_WINDOW_UNAVAILABLE"]);
    assert.equal(pv.json.lines[0].selection, null);
    assert.equal(pv.json.total_amount, null, "aucun total inventé");
    const q = await post("/api/site/quote", doc("F_QUOTE_ORDER/quote_unpriced.json"));
    assertBusinessOracle(q, "F_QUOTE_ORDER.quote_unpriced_no_window");
    assert.equal(q.json.verdict.receipt.lines[0].unit_amount, null, "jamais un ancien montant reconduit");
    const order = await post("/api/site/order", {
      contract_version: "site_business.v1", kind: "order", idempotency_key: "order-test-unpriced", catalogue_sequence: 7, contact: CONTACT,
      currency: "EUR", total_amount: "26.25",
      lines: [{ public_item_key: POTELET, variant_axes: {}, quantity: 5, rate_id: "R-402-A", unit_amount: "5.25", line_total: "26.25" }],
    });
    assert.equal(order.status, 409);
    assert.deepEqual(order.json.verdict.error_codes, ["PRICE_WINDOW_UNAVAILABLE"]);
    assertBusinessOracle(await post("/api/site/quote", doc("F_QUOTE_ORDER/quote_priced.json")), "F_QUOTE_ORDER.quote_priced");
  });

  test("PAYLOAD_MALFORMED : non-JSON, flottant, BOM, clé dupliquée, > 256 Kio — cas F_QUOTE_ORDER.order_float_amount", async () => {
    assertBusinessOracle(await post("/api/site/order", doc("F_QUOTE_ORDER/order_float_amount.json")), "F_QUOTE_ORDER.order_float_amount");
    const valid = doc("F_QUOTE_ORDER/order_valid.json");
    const bodies = {
      "non JSON": "pas du json",
      BOM: Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), valid]),
      "clé dupliquée": valid.toString("utf8").replace('"kind": "order",', '"kind": "order", "kind": "order",'),
      "> 256 Kio": `{"pad":"${"x".repeat(256 * 1024)}"}`,
      "UTF-8 invalide": Buffer.from([0x7b, 0xff, 0x7d]),
    };
    for (const [label, body] of Object.entries(bodies)) {
      for (const route of ["/api/site/order", "/api/site/quote"]) {
        const r = await post(route, body);
        assert.equal(r.status, 400, `${route} ${label}`);
        assert.deepEqual(r.json.verdict.error_codes, ["PAYLOAD_MALFORMED"], `${route} ${label}`);
      }
      const p = await post("/api/site/cart/preview", body);
      assert.equal(p.status, 400, `preview ${label}`);
      assert.deepEqual(p.json.error_codes, ["PAYLOAD_MALFORMED"], `preview ${label}`);
    }
  });

  test("INVALID_DATA : clé de taxe / port / statut envoyée par le client, prix navigateur dans l'aperçu — cas F_QUOTE_ORDER.order_client_sets_tax", async () => {
    assertBusinessOracle(await post("/api/site/order", doc("F_QUOTE_ORDER/order_client_tax.json")), "F_QUOTE_ORDER.order_client_sets_tax");
    const base = docJson("F_QUOTE_ORDER/order_valid.json");
    for (const extra of [{ tax_amount: "25.15" }, { shipping_amount: "9.90" }, { status: "PAID" }, { vat_rate: "20" }]) {
      const r = await post("/api/site/order", { ...base, ...extra });
      assert.equal(r.status, 422, JSON.stringify(extra));
      assert.deepEqual(r.json.verdict.error_codes, ["INVALID_DATA"], JSON.stringify(extra));
    }
    const q = docJson("F_QUOTE_ORDER/quote_priced.json");
    const rq = await post("/api/site/quote", { ...q, tax_amount: "2.20" });
    assert.deepEqual(rq.json.verdict.error_codes, ["INVALID_DATA"]);
    // L'aperçu n'accepte aucun prix venu du navigateur.
    const p = await preview([{ public_item_key: PANNEAU, variant_axes: {}, quantity: 1, unit_amount: "0.01" }]);
    assert.equal(p.status, 422);
    assert.deepEqual(p.json.error_codes, ["INVALID_DATA"]);
    assertBusinessOracle(await post("/api/site/order", doc("F_QUOTE_ORDER/order_unknown_version.json")), "F_QUOTE_ORDER.order_unknown_version");
  });

  test("aucun Set-Cookie, aucun champ \"success\" sur pages et routes", async () => {
    const rs = [await get("/"), await get("/panier"), await get("/famille/panneau-paliers"), await preview([{ public_item_key: PANNEAU, variant_axes: {}, quantity: 1 }]), await post("/api/site/order", doc("F_QUOTE_ORDER/order_valid.json"))];
    for (const r of rs) {
      assert.equal(r.headers.get("set-cookie"), null);
      assert.ok(!r.text.includes('"success"'));
    }
  });

  test("144 requêtes legacy → 404 : 36 chemins du spike × GET/POST × (sans en-têtes | cookie forgé + Bearer) — spike/http-tests.mjs S09", async () => {
    const evil = { cookie: "admin_session=forged", authorization: "Bearer x" };
    let n = 0;
    const failures = [];
    for (const p of LEGACY) {
      for (const headers of [{}, evil]) {
        for (const method of ["GET", "POST"]) {
          const r = await http(method, p, { headers, body: method === "POST" ? { any: 1 } : undefined });
          n++;
          if (r.status !== 404 || r.text.includes('"success"')) failures.push(`${method} ${p} ${JSON.stringify(headers)} → ${r.status}`);
        }
      }
    }
    assert.equal(LEGACY.length, 36);
    assert.equal(n, 144);
    assert.deepEqual(failures, []);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// B. F_ESUNNY_FORBIDDEN/snapshot_s1.json — combinaison interdite
// ═════════════════════════════════════════════════════════════════════════════

const ES = "F_ESUNNY_FORBIDDEN/snapshot_s1.json";
scenario(`B — ${ES} @ 2026-10-20T12:00:00Z`, { SITE_CATALOG_SOURCE: "fixture", SITE_CATALOG_FIXTURE: ES, SITE_NOW_UTC: "2026-10-20T12:00:00Z" }, () => {
  test("INVALID_VARIANT : blanc + sol n'existe pas (aucun produit cartésien) — cas F_ESUNNY_FORBIDDEN.select_forbidden_combination, order_forbidden_combination", async () => {
    const pv = await preview([{ public_item_key: "PI-0000006BC", variant_axes: { coloris: "blanc", fixation: "sol" }, quantity: 1 }]);
    assert.equal(pv.status, 200);
    assert.deepEqual(pv.json.lines[0].error_codes, ORACLE["F_ESUNNY_FORBIDDEN.select_forbidden_combination"].error_codes);
    assert.deepEqual(pv.json.lines[0].error_codes, ["INVALID_VARIANT"]);
    const forbidden = await post("/api/site/order", doc("F_ESUNNY_FORBIDDEN/order_forbidden_combination.json"));
    assertBusinessOracle(forbidden, "F_ESUNNY_FORBIDDEN.order_forbidden_combination");
    assert.equal(forbidden.status, 422);
    assertBusinessOracle(await post("/api/site/order", doc("F_ESUNNY_FORBIDDEN/order_allowed_combination.json")), "F_ESUNNY_FORBIDDEN.order_allowed_combination");
  });

  test("fiche Famille : seuls les 3 Items publiés, libellés d'axes du DTO — fixture snapshot_s1", async () => {
    const r = await get("/famille/esunny-demo");
    assert.equal(r.status, 200);
    for (const k of ["PI-00000069X", "PI-0000006AP", "PI-0000006BC"]) assert.match(r.text, new RegExp(k));
    assert.match(r.text, /Coloris/);
    assert.match(r.text, /Fixation/);
    assert.doesNotMatch(r.text, /Combinaison non proposée/, "plus de liste issue d'un produit cartésien");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// C. F_IDENTITY/snapshot_gen_c.json — registre d'identité
// ═════════════════════════════════════════════════════════════════════════════

const ID = "F_IDENTITY/snapshot_gen_c.json";
scenario(`C — ${ID} @ 2026-10-22T12:00:00Z`, { SITE_CATALOG_SOURCE: "fixture", SITE_CATALOG_FIXTURE: ID, SITE_NOW_UTC: "2026-10-22T12:00:00Z" }, () => {
  test("/article : SUPERSEDED → 308 vers la canonique, canonique → fiche, RETIRED → 410, absente → 404 — cas F_IDENTITY.select_superseded, select_retired, select_canonical", async () => {
    const sup = await get("/article/PI-000000JW3");
    assert.equal(sup.status, 308);
    assert.equal(new URL(sup.headers.get("location")).pathname, "/article/PI-000000JVF");
    assert.equal(ORACLE["F_IDENTITY.select_superseded"].expect["superseded_by.PI-000000JW3"], "PI-000000JVF");
    const canon = await get("/article/PI-000000JVF");
    assert.equal(canon.status, 307);
    const loc = new URL(canon.headers.get("location"));
    assert.match(loc.pathname, /^\/famille\//);
    assert.equal(loc.searchParams.get("article"), "PI-000000JVF");
    assert.equal((await get(loc.pathname + loc.search)).status, 200);
    const ret = await get("/article/PI-000000JSY");
    assert.equal(ret.status, 410);
    assert.equal((await get("/article/PI-00000001R")).status, 404, "clé bien formée absente de la génération");
    assert.equal((await get("/article/n-importe-quoi")).status, 404);
  });

  test("aperçu et commande d'un vieux panier : ITEM_SUPERSEDED (canonique donnée) + ITEM_RETIRED — cas F_IDENTITY.order_with_tombstoned_keys", async () => {
    const pv = await preview([{ public_item_key: "PI-000000JW3", variant_axes: { modele: "D" }, quantity: 1 }, { public_item_key: "PI-000000JSY", variant_axes: { modele: "A" }, quantity: 1 }]);
    assert.deepEqual(pv.json.lines[0].error_codes, ["ITEM_SUPERSEDED"]);
    assert.deepEqual(pv.json.lines[0].superseded_by, { "PI-000000JW3": "PI-000000JVF" });
    assert.deepEqual(pv.json.lines[1].error_codes, ["ITEM_RETIRED"]);
    assertBusinessOracle(await post("/api/site/order", doc("F_IDENTITY/order_old_cart_tombstoned_keys.json")), "F_IDENTITY.order_with_tombstoned_keys");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// D. F_GMCE_VARIANTS/snapshot_s1.json — variantes et média d'Item
// ═════════════════════════════════════════════════════════════════════════════

const GM = "F_GMCE_VARIANTS/snapshot_s1.json";
scenario(`D — ${GM} @ 2026-10-20T12:00:00Z`, { SITE_CATALOG_SOURCE: "fixture", SITE_CATALOG_FIXTURE: GM, SITE_NOW_UTC: "2026-10-20T12:00:00Z" }, () => {
  test("fiche à variantes, média d'Item servi et vérifié, présélection ?article= — fixture snapshot_s1", async () => {
    const r = await get("/famille/gmce-demo?article=PI-00000037S");
    assert.equal(r.status, 200);
    for (const k of ["PI-000000358", "PI-000000363", "PI-00000037S"]) assert.match(r.text, new RegExp(k));
    assert.match(r.text, /Article <span[^>]*>PI-00000037S</, "variante présélectionnée");
    const m = await get("/media/b020140e8822d96407cce4ec28d1ee2df7c25cf7c98f8e2fe0ee49bd73039c6c");
    assert.equal(m.status, 200);
    assert.equal(m.headers.get("content-type"), "image/png");
    assert.equal(sha256(m.bytes), "b020140e8822d96407cce4ec28d1ee2df7c25cf7c98f8e2fe0ee49bd73039c6c");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// E. Indisponibilité honnête (jamais un catalogue vide « vert »)
// ═════════════════════════════════════════════════════════════════════════════

const UNAVAILABLE = [
  ["E1 — SITE_CATALOG_SOURCE absent", {}, "SOURCE_NOT_CONFIGURED"],
  ["E2 — SITE_CATALOG_SOURCE=db (BC2 non fourni)", { SITE_CATALOG_SOURCE: "db" }, "DB_SOURCE_NOT_PROVIDED"],
  ["E3 — fixture refusée par C0 (F_SIMPLE_READY/snapshot_buy_leak.json)", { SITE_CATALOG_SOURCE: "fixture", SITE_CATALOG_FIXTURE: "F_SIMPLE_READY/snapshot_buy_leak.json" }, "SNAPSHOT_REFUSED"],
  ["E4 — nom de fixture hors c0/fixtures/documents", { SITE_CATALOG_SOURCE: "fixture", SITE_CATALOG_FIXTURE: "../../package.json" }, "FIXTURE_NAME_INVALID"],
];
for (const [name, env, reason] of UNAVAILABLE) {
  scenario(name, env, () => {
    test(`pages en erreur, API 503 ${reason}, aucun verdict ni prix`, async () => {
      // Next 16 : une page qui lève rend la coquille d'erreur (HTTP 500) ; le texte « Catalogue
      // indisponible » (app/error.tsx) est rendu côté client. Aucune donnée de catalogue dans le HTML.
      const home = await get("/");
      assert.equal(home.status, 500);
      assert.match(home.text, /id="__next_error__"/);
      assert.doesNotMatch(home.text, /data-testid="catalogue-sequence"|STAGING_FIXTURE Chaise|R-SIMPLE-1/);
      assert.equal((await get("/famille/chaise-demo")).status, 500);
      for (const route of ["/api/site/order", "/api/site/quote", "/api/site/cart/preview"]) {
        const r = await post(route, doc("F_QUOTE_ORDER/order_valid.json"));
        assert.equal(r.status, 503, route);
        assert.equal(r.json.site_status, "CATALOG_UNAVAILABLE");
        assert.equal(r.json.reason, reason);
        assert.equal(r.json.verdict, null);
      }
      assert.equal((await get("/media/ed9aaaaa1debb1f00870b9b41636dc75b64eb0437ed9c58dcbb18047b73b41ec")).status, 503);
      assert.equal((await get("/article/PI-00000001R")).status, 503);
    });
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// F. Rejeu HTTP de TOUS les cas C0 site_business rejouables
// ═════════════════════════════════════════════════════════════════════════════
// Rejouable = génération ACTIVE (la fixture sert ACTIVE), registre vide (pas de persistance avant BC4),
// instant au format C0 (l'instant vient du serveur, `SITE_NOW_UTC`) et document servable par FixtureSource.
// Les cas exclus sont listés avec leur motif (sortie `# exclu`).

function businessCases() {
  const out = [];
  for (const dir of readdirSync(path.join(C0, "cases"))) {
    for (const file of readdirSync(path.join(C0, "cases", dir))) {
      const c = JSON.parse(readFileSync(path.join(C0, "cases", dir, file), "utf8"));
      if (!["select_price", "validate_order_submit", "validate_quote_request"].includes(c.function)) continue;
      out.push(c);
    }
  }
  return out.sort((a, b) => (a.case_id < b.case_id ? -1 : 1));
}

const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const groups = new Map();
const excluded = [];
for (const c of businessCases()) {
  const i = c.input;
  const fixture = i.generation.snapshot.$doc?.replace(/^documents\//, "");
  const now = i.now_utc ?? i.instant_utc;
  if (i.generation.status !== "ACTIVE") excluded.push([c.case_id, `génération ${i.generation.status} : la fixture sert ACTIVE`]);
  else if (Array.isArray(i.register) && i.register.length > 0) excluded.push([c.case_id, "registre non vide : idempotence persistée = BC4"]);
  else if (!UTC.test(now)) excluded.push([c.case_id, `instant ${now} non C0 : l'instant est celui du serveur, jamais fourni`]);
  else if (fixture === "F_SELL_WINDOWS/snapshot_overlap.json") excluded.push([c.case_id, "snapshot_overlap refusé par validateSnapshotBytes (PRICE_WINDOW_OVERLAP) : non servable"]);
  else {
    const key = `${fixture}|${now}`;
    if (!groups.has(key)) groups.set(key, { fixture, now, cases: [] });
    groups.get(key).cases.push(c);
  }
}

describe("F — rejeu HTTP des cas C0 site_business", () => {
  test("inventaire des cas exclus (motifs)", () => {
    for (const [id, why] of excluded) console.log(`# exclu ${id} — ${why}`);
    assert.ok(groups.size > 0);
  });
  for (const { fixture, now, cases } of groups.values()) {
    scenario(`F — ${fixture} @ ${now} (${cases.length} cas)`, { SITE_CATALOG_SOURCE: "fixture", SITE_CATALOG_FIXTURE: fixture, SITE_NOW_UTC: now }, () => {
      for (const c of cases) {
        test(c.case_id, async () => {
          const o = ORACLE[c.case_id];
          if (c.function === "select_price") {
            const r = await preview([{ public_item_key: c.input.public_item_key, variant_axes: c.input.variant_axes, quantity: c.input.quantity }]);
            assert.equal(r.status, 200, r.text.slice(0, 200));
            const l = r.json.lines[0];
            assert.equal(l.accepted, o.accepted);
            assert.deepEqual(l.error_codes, o.error_codes);
            for (const [k, expected] of Object.entries(o.expect ?? {})) assert.deepEqual(at(l, k), expected, k);
          } else {
            const route = c.function === "validate_order_submit" ? "/api/site/order" : "/api/site/quote";
            const bytes = readFileSync(path.join(C0, c.input.request.$bytes));
            assertBusinessOracle(await post(route, bytes), c.case_id);
          }
        });
      }
    });
  }
});
