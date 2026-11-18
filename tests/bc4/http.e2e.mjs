// Recette HTTP BC4 sur un serveur Next réel (`next start`, 127.0.0.1:${SITE_TEST_PORT}, défaut 3351), base SITE_TEST_DATABASE_URL
// (défaut du script npm : prodes_site_bc4_test) — un reviewer ou la CI choisit SA base et SON port (review F-04).
// Prérequis : `npm run build`, `npm run bc2:build`, `npm run bc4:build` (script `npm run test:bc4:http`).
// Chaque serveur est lancé par ce fichier (PID tenu) et arrêté par lui : jamais de kill global.
// Génération ACTIVE : F_SELL_WINDOWS.activate (receiver BC2, module compilé). Requêtes : fixtures F_QUOTE_ORDER citées.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { datedHeaders } from "../bc2/helpers.mjs";
import { DB_URL, KEYRING, ROOT, activate, businessCase, c0events, counts, events, freshness, jsonc, pollContext, rawSign, resetDb, newPool } from "./helpers.mjs";

// Cercle 5 : les routes devis et commande reçoivent `{ request: <corps C0>, extras }` (docs/site_events_v2.md) et un événement site_events.v2 ; sans réglages de vente reçus, « la boutique n'est pas prête ».
const requireBuild = createRequire(import.meta.url);
const commerce = requireBuild(path.join(ROOT, ".bc4-build", "lib/site-commerce/document.js"));
const ADDRESS = { name: "Mairie de Val-Fictif", line1: "7 allée Fictive", line2: "", postal_code: "00000", city: "Val-Fictif" };
const EXTRAS = { quote_request: { commerce_sequence: 1, privacy_notice: "m1" }, order: { commerce_sequence: 1, privacy_notice: "m1", addresses: { delivery: ADDRESS, billing: null }, customer_refs: {}, payment_method: "virement", terms: { accepted: true, cgv_version: "c1" } } };
/** Corps v2 d'un corps C0 : le C0 reste jugé tel quel, les extras ne portent que ce qu'il ne connaît pas. */
function wrap(kind, raw) {
  const text = typeof raw === "string" ? raw : Buffer.from(raw).toString("utf8");
  return JSON.stringify({ request: JSON.parse(text), extras: EXTRAS[kind] });
}
async function installCommerce(pool) {
  const d = {
    contract_version: "site_commerce.v1", publication_id: "pub-0001", commerce_sequence: 1, generated_at_utc: "2026-10-20T08:00:00Z", tax_rate: "20.00",
    delivery_rendez_vous: { label: "Livraison sur rendez-vous", amount_ht: "20.00" },
    payment: { cheque: { label: "Chèque", instructions: "Texte d'attente." }, virement: { label: "Virement", instructions: "Texte d'attente." }, mandat_administratif: { label: "Mandat", instructions: "Texte d'attente." } },
    privacy_notice: { version: "m1", text: "Texte d'attente." }, cgv_version: "c1",
    acknowledgement: { quote: { subject: "S", body: "{numero}" }, order: { subject: "S", body: "{numero}" }, message: { subject: "S", body: "{numero}" } }, sender: null,
  };
  const doc = { ...d, payload_sha256: commerce.documentDigest(d) };
  await pool.query("INSERT INTO site_commerce_active (singleton, commerce_sequence, publication_id, payload_sha256, document_bytes, ack_bytes) VALUES (1, 1, $1, $2, $3, $4)", [doc.publication_id, doc.payload_sha256, Buffer.from(jsonc.canonicalBytes(doc)), Buffer.from("{}")]);
}

const PORT = (() => {
  const raw = process.env.SITE_TEST_PORT ?? "3351";
  if (!/^[1-9][0-9]{3,4}$/.test(raw) || Number(raw) > 65535) throw new Error(`SITE_TEST_PORT invalide : ${raw}`);
  return Number(raw);
})();
const BASE = `http://127.0.0.1:${PORT}`;
const KEYRING_PATH = path.join(ROOT, "c0", "fixtures", "keys", "test_keyring.json");
const NOW = "2026-10-20T09:00:00Z";

async function portAnswers() {
  try {
    await fetch(BASE + "/api/site/receipt", { signal: AbortSignal.timeout(500) });
    return true;
  } catch {
    return false;
  }
}

async function startServer(env) {
  assert.ok(existsSync(path.join(ROOT, ".next", "BUILD_ID")), "build absent : lancer `npm run build`");
  assert.equal(await portAnswers(), false, `port ${PORT} déjà occupé`);
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
  console.log(`# serveur PID ${child.pid} port ${PORT}`);
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

// Garde CSRF du SITE (BC3) : tout POST porte `Content-Type: application/json` et un `Origin` same-origin.
const POST_HEADERS = { "content-type": "application/json", origin: BASE };

async function http(method, p, { body, headers = {} } = {}) {
  const res = await fetch(BASE + p, { method, headers: method === "POST" ? { ...POST_HEADERS, ...headers } : headers, body });
  const bytes = new Uint8Array(await res.arrayBuffer());
  const text = new TextDecoder().decode(bytes);
  let json = null;
  try { json = JSON.parse(text); } catch { /* non JSON */ }
  return { status: res.status, headers: res.headers, text, json };
}

// W4-I (DF-0115) : chaque poll porte issued_at_utc + nonce frais, signés avec {cursor, limit} (domaine events_poll.v2).
function pollHeaders(cursor, limit, keyId = "c0-test-events-01") {
  const fresh = freshness();
  return {
    "x-c0-key-id": keyId,
    "x-c0-issued-at": fresh.issuedAt,
    "x-c0-nonce": fresh.nonce,
    "x-c0-signature": rawSign(keyId, events.EVENTS_POLL_DOMAIN, pollContext(cursor, limit, fresh)),
  };
}

const ENV = () => ({ SITE_BUSINESS_PERSISTENCE: "postgresql", SITE_DATABASE_URL: DB_URL(), SITE_KEYRING_PATH: KEYRING_PATH, SITE_NOW_UTC: NOW, SITE_REQUEST_LIMIT: "1000" });

describe("A — serveur BC4 (SITE_BUSINESS_PERSISTENCE=postgresql) sur prodes_site_bc4_test", () => {
  let server;
  let pool;
  before(async () => {
    await resetDb();
    pool = newPool();
    await activate(pool, "F_SELL_WINDOWS.activate");
    await installCommerce(pool);
    server = await startServer(ENV());
  });
  after(async () => { await stopServer(server); await pool.end(); });

  let created;
  test("POST /api/site/order (F_QUOTE_ORDER.order_valid) → 200 RECEIVED durable, puis rejeu → même reçu", async () => {
    const c = businessCase("F_QUOTE_ORDER.order_valid");
    const r = await http("POST", "/api/site/order", { body: wrap("order", c.bytes), headers: { "content-type": "application/json" } });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.json.outcome, "RECEIVED");
    assert.equal(r.json.persistence, "POSTGRESQL_SITE_LOCAL");
    assert.equal(r.json.instant_utc, NOW, "instant serveur (SITE_NOW_UTC), jamais client");
    assert.equal(r.headers.get("cache-control"), "no-store");
    created = r.json;
    const again = await http("POST", "/api/site/order", { body: wrap("order", c.bytes) });
    assert.equal(again.json.outcome, "REPLAY_SAME_RECEIPT");
    assert.deepEqual(again.json.receipt, created.receipt);
    assert.equal(again.json.access_token, undefined);
    const other = await http("POST", "/api/site/order", { body: wrap("order", businessCase("F_QUOTE_ORDER.order_same_key_other_payload").bytes) });
    assert.equal(other.status, 409);
    assert.deepEqual(other.json.error_codes, ["DUPLICATE_KEY_DIFFERENT_PAYLOAD"]);
  });

  test("CE-T03 HTTP : deux POST simultanés même clé → 1 commande, 1 événement", async () => {
    const o = JSON.parse(Buffer.from(businessCase("F_QUOTE_ORDER.order_valid").bytes).toString("utf8"));
    o.idempotency_key = "order:http:concurrent";
    const body = wrap("order", JSON.stringify(o));
    const rs = await Promise.all([http("POST", "/api/site/order", { body }), http("POST", "/api/site/order", { body })]);
    assert.deepEqual(rs.map((r) => r.json.outcome).sort(), ["RECEIVED", "REPLAY_SAME_RECEIPT"]);
    assert.equal(rs[0].json.receipt_ref, rs[1].json.receipt_ref);
    const n = await counts(pool);
    assert.equal(n.site_order, 2);
    assert.equal(n.site_outbox_event, 2);
  });

  test("POST /api/site/quote (F_QUOTE_ORDER.quote_unpriced_no_window) → RECEIVED priced:false ; falsifié (order_falsified_amount) → 409", async () => {
    const q = await http("POST", "/api/site/quote", { body: wrap("quote_request", businessCase("F_QUOTE_ORDER.quote_unpriced_no_window").bytes) });
    assert.equal(q.status, 200, q.text);
    assert.equal(q.json.receipt.lines[0].priced, false);
    const f = await http("POST", "/api/site/order", { body: wrap("order", businessCase("F_QUOTE_ORDER.order_falsified_amount").bytes) });
    assert.equal(f.status, 409);
    assert.deepEqual(f.json.error_codes, ["PRICE_CHANGED"]);
  });

  test("GET /api/site/receipt : bon jeton 200 ; absent 401 ; faux 404 = réf inconnue 404 (F_QUOTE_ORDER.lookup_*)", async () => {
    const ok = await http("GET", `/api/site/receipt?ref=${created.receipt_ref}&access_token=${encodeURIComponent(created.access_token)}`);
    assert.equal(ok.status, 200);
    assert.deepEqual(ok.json.receipt, created.receipt);
    assert.equal((await http("GET", `/api/site/receipt?ref=${created.receipt_ref}`)).status, 401);
    const wrong = await http("GET", `/api/site/receipt?ref=${created.receipt_ref}&access_token=faux`);
    const unknown = await http("GET", `/api/site/receipt?ref=ORD-00000000000000000000000000000000&access_token=faux`);
    assert.equal(wrong.status, 404);
    assert.equal(unknown.status, 404);
    assert.equal(wrong.text, unknown.text);
  });

  test("GET /api/site/events + POST /api/site/events/ack : client Factory simulé (c0-test-events-01), re-service sans ACK, scopes", async () => {
    const p1 = await http("GET", "/api/site/events?cursor=&limit=10", { headers: pollHeaders(null, 10) });
    assert.equal(p1.status, 200, p1.text);
    assert.equal(p1.json.events.length, 3);
    const consumed = [];
    for (const e of p1.json.events) {
      // Événement v2 : le validateur TypeScript commun arrive avec le lot d'eb ; ici, enveloppe, octets canoniques et empreinte du domaine v2.
      const bytes = new Uint8Array(Buffer.from(e.event_bytes_b64, "base64"));
      const event = jsonc.parseBytes(bytes, 262144);
      assert.equal(event.contract_version, "site_events.v2");
      assert.ok(jsonc.isCanonical(bytes, event));
      assert.equal(event.payload_digest, jsonc.digest("prodes.site_events.v2.payload", event.payload));
      consumed.push(e.event_bytes_b64);
    }
    const p2 = await http("GET", `/api/site/events?cursor=${p1.json.next_cursor}&limit=10`, { headers: pollHeaders(p1.json.next_cursor, 10) });
    assert.equal(p2.json.events.length, 3, "non acquittés → re-servis");
    for (const e of p2.json.events) assert.ok(consumed.includes(e.event_bytes_b64), "re-servi à l'identique");
    const ackBody = { cursor: p2.json.next_cursor };
    const a = await http("POST", "/api/site/events/ack", {
      body: JSON.stringify(ackBody),
      // Cercle 4 (4.4) : l'accusé porte aussi l'anti-rejeu daté du transport (en-têtes `x-c0-issued-at`, `x-c0-nonce`, `x-c0-request-signature`).
      headers: { ...datedHeaders("c0-test-events-01", "POST", "/api/site/events/ack", new TextEncoder().encode(JSON.stringify(ackBody))), "x-c0-signature": rawSign("c0-test-events-01", events.EVENTS_ACK_DOMAIN, ackBody) },
    });
    assert.equal(a.status, 200, a.text);
    assert.equal(a.json.acked.length, 3);
    const p3 = await http("GET", `/api/site/events?cursor=${p2.json.next_cursor}&limit=10`, { headers: pollHeaders(p2.json.next_cursor, 10) });
    assert.deepEqual(p3.json.events, []);
    const pub = await http("GET", "/api/site/events?cursor=&limit=10", { headers: pollHeaders(null, 10, "c0-test-publish-02") });
    assert.equal(pub.status, 401);
    assert.deepEqual(pub.json.error_codes, ["EVENT_UNAUTHORIZED"]);
    const forged = await http("GET", "/api/site/events?cursor=CUR-forged&limit=10", { headers: pollHeaders("CUR-forged", 10) });
    assert.equal(forged.status, 400);
    assert.deepEqual(forged.json.error_codes, ["CURSOR_INVALID"]);
    const zero = await http("GET", "/api/site/events?cursor=&limit=0", { headers: pollHeaders(null, 0) });
    assert.equal(zero.status, 400);
    assert.ok(KEYRING.keys.length > 0);
  });
});

describe("B — serveur BC4, base coupée (SITE_DATABASE_URL vers une base inexistante)", () => {
  let server;
  before(async () => {
    const url = new URL(DB_URL());
    url.pathname = "/prodes_site_bc4_absent_db";
    server = await startServer({ ...ENV(), SITE_DATABASE_URL: url.toString() });
  });
  after(async () => stopServer(server));

  test("POST /api/site/order → 503 DB_WRITE_FAILED, jamais accepted:true (F_QUOTE_ORDER.order_valid)", async () => {
    const r = await http("POST", "/api/site/order", { body: wrap("order", businessCase("F_QUOTE_ORDER.order_valid").bytes) });
    assert.equal(r.status, 503, r.text);
    assert.equal(r.json.accepted, false);
    assert.deepEqual(r.json.error_codes, ["DB_WRITE_FAILED"]);
  });
});

describe("C — configuration invalide", () => {
  let server;
  before(async () => { server = await startServer({ ...ENV(), SITE_BUSINESS_PERSISTENCE: "memory" }); });
  after(async () => stopServer(server));

  test("SITE_BUSINESS_PERSISTENCE inconnue → 503 TRANSACTIONS_CONFIG_INVALID sur devis et commande", async () => {
    for (const route of ["/api/site/order", "/api/site/quote"]) {
      const r = await http("POST", route, { body: businessCase("F_QUOTE_ORDER.order_valid").bytes });
      assert.equal(r.status, 503);
      assert.equal(r.json.transport_error, "TRANSACTIONS_CONFIG_INVALID");
    }
  });
});

describe("D — cercle 5, 5.23 : limite de débit par adresse sur les envois (P04)", () => {
  let server;
  before(async () => { server = await startServer({ ...ENV(), SITE_REQUEST_LIMIT: "5" }); });
  after(async () => stopServer(server));

  test("le sixième envoi en une minute reçoit « trop de demandes, réessayez dans une minute » (429), avant toute lecture du corps", async () => {
    const statuses = [];
    for (const route of ["/api/site/quote", "/api/site/order", "/api/site/message", "/api/site/quote", "/api/site/order", "/api/site/message"]) {
      const r = await http("POST", route, { body: "{pas du json" });
      statuses.push(r.status);
      if (statuses.length === 6) {
        assert.equal(r.json.message, "Trop de demandes, réessayez dans une minute.");
        assert.ok(Number(r.headers.get("retry-after")) >= 1);
      }
    }
    assert.ok(statuses.slice(0, 5).every((s) => s !== 429), `cinq premiers : ${statuses}`);
    assert.equal(statuses[5], 429);
  });
});
