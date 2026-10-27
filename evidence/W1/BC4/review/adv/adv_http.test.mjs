// Review indépendante BC4 — cas adversariaux HTTP sur `next start` 127.0.0.1:3352 (PID tenu, arrêté par ce fichier).
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import pg from "pg";
import { DB_URL, ROOT, activate, businessCase, counts, rawSign, resetDb, newPool, events } from "../../../../../tests/bc4/helpers.mjs";

const PORT = 3352;
const BASE = `http://127.0.0.1:${PORT}`;
const KEYRING_PATH = path.join(ROOT, "c0", "fixtures", "keys", "test_keyring.json");
const NOW = "2026-10-20T09:00:00Z";
const VALID = businessCase("F_QUOTE_ORDER.order_valid");
const BASE_ORDER = JSON.parse(Buffer.from(VALID.bytes).toString("utf8"));
const ENV = () => ({ SITE_BUSINESS_PERSISTENCE: "postgresql", SITE_DATABASE_URL: DB_URL(), SITE_KEYRING_PATH: KEYRING_PATH, SITE_NOW_UTC: NOW, SITE_ENV: "staging" });
const log = (...a) => console.log("# ADV-H", ...a);

async function portAnswers() { try { await fetch(BASE + "/api/site/receipt", { signal: AbortSignal.timeout(500) }); return true; } catch { return false; } }
async function startServer(env) {
  assert.equal(await portAnswers(), false, "port 3352 occupé");
  const child = spawn(process.execPath, [path.join(ROOT, "node_modules", "next", "dist", "bin", "next"), "start", "-H", "127.0.0.1", "-p", String(PORT)],
    { cwd: ROOT, env: { PATH: process.env.PATH, HOME: process.env.HOME, NEXT_TELEMETRY_DISABLED: "1", ...env }, stdio: ["ignore", "pipe", "pipe"] });
  const logs = []; let exited = false;
  child.stdout.on("data", (d) => logs.push(String(d))); child.stderr.on("data", (d) => logs.push(String(d))); child.on("exit", () => (exited = true));
  const deadline = Date.now() + 30000;
  while (!(await portAnswers())) { if (exited) throw new Error(logs.join("")); if (Date.now() > deadline) throw new Error("timeout"); await new Promise((r) => setTimeout(r, 150)); }
  log(`serveur PID ${child.pid} port ${PORT}`);
  return { child, logs, isExited: () => exited };
}
async function stopServer(s) {
  if (!s || s.isExited()) return;
  const done = new Promise((r) => s.child.once("exit", r));
  process.kill(s.child.pid, "SIGTERM"); await done;
  for (let i = 0; i < 40 && (await portAnswers()); i++) await new Promise((r) => setTimeout(r, 100));
  assert.equal(await portAnswers(), false); log(`serveur PID ${s.child.pid} arrêté`);
}
async function http(method, p, { body, headers = {} } = {}) {
  const r = await fetch(BASE + p, { method, body, headers: { "content-type": "application/json", ...headers } });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch {}
  return { status: r.status, text, json, headers: r.headers };
}
const withKey = (k) => JSON.stringify({ ...structuredClone(BASE_ORDER), idempotency_key: k });

describe("ADV-H A — BC4 postgresql", () => {
  let server, pool;
  before(async () => { await resetDb(); pool = newPool(); await activate(pool, "F_SELL_WINDOWS.activate"); server = await startServer(ENV()); });
  after(async () => { await stopServer(server); await pool.end(); });

  test("ADV-H1 10 POST HTTP simultanés même clé → 1 commande, 1 événement, réponses identiques hors access_token/outcome", async () => {
    const before = await counts(pool);
    const body = withKey("order:rvh:conc-10");
    const rs = await Promise.all(Array.from({ length: 10 }, () => http("POST", "/api/site/order", { body })));
    const strip = (j) => { const { access_token, outcome, ...rest } = j; return JSON.stringify(rest); };
    log("H1", JSON.stringify(rs.map((r) => `${r.status}:${r.json?.outcome}`).sort()));
    assert.equal(rs.filter((r) => r.json.outcome === "RECEIVED").length, 1);
    const canon = (t) => JSON.stringify(JSON.parse(t), (k, v) => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort()) : v));
    log("H1 corps distincts (octets, hors jeton/outcome):", new Set(rs.map((r) => strip(r.json))).size, "— distincts sémantiquement:", new Set(rs.map((r) => canon(strip(r.json)))).size);
    assert.equal(new Set(rs.map((r) => canon(strip(r.json)))).size, 1, "corps sémantiquement identiques hors jeton/outcome");
    const after = await counts(pool);
    assert.equal(after.site_order - before.site_order, 1); assert.equal(after.site_outbox_event - before.site_outbox_event, 1);
    assert.equal(rs[0].headers.get("cache-control"), "no-store");
  });

  test("ADV-H2 message de 10 Mio (devis) → 400 PAYLOAD_MALFORMED rapide, 0 écriture, serveur vivant", async () => {
    const before = await counts(pool);
    const q = { contract_version: "site_business.v1", kind: "quote_request", idempotency_key: "quote:rvh:huge", catalogue_sequence: null, contact: BASE_ORDER.contact,
      message: "A".repeat(10 * 1024 * 1024), lines: [{ public_item_key: BASE_ORDER.lines[0].public_item_key, variant_axes: {}, quantity: 1, displayed: null }] };
    const t = Date.now();
    const r = await http("POST", "/api/site/quote", { body: JSON.stringify(q) });
    log("H2", r.status, JSON.stringify(r.json?.error_codes), `${Date.now() - t} ms`);
    assert.equal(r.status, 400); assert.deepEqual(r.json.error_codes, ["PAYLOAD_MALFORMED"]);
    // message juste sous le plafond 256 Kio : quelle borne C0 ? (texte borné)
    const q2 = { ...q, idempotency_key: "quote:rvh:200k", message: "B".repeat(200 * 1024) };
    const r2 = await http("POST", "/api/site/quote", { body: JSON.stringify(q2) });
    log("H2 message 200 Kio", r2.status, JSON.stringify(r2.json?.error_codes));
    assert.deepEqual(await counts(pool).then((c) => c.site_quote_request - before.site_quote_request <= (r2.status === 200 ? 1 : 0)), true);
    const alive = await http("GET", "/api/site/receipt?ref=x&access_token=y");
    assert.equal(alive.status, 404);
  });

  test("ADV-H3 connexions du pool serveur tuées (pg_terminate_backend) → le serveur survit et répond à la requête suivante", async () => {
    const killer = new pg.Client({ connectionString: DB_URL() }); await killer.connect();
    const { rows } = await killer.query("SELECT pg_terminate_backend(pid) AS k FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid() AND backend_type = 'client backend'");
    log("H3 connexions tuées", rows.length);
    await killer.end(); await pool.end(); pool = newPool();
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(server.isExited(), false, "serveur toujours vivant");
    const r1 = await http("POST", "/api/site/order", { body: withKey("order:rvh:after-kill") });
    const r2 = r1.status === 503 ? await http("POST", "/api/site/order", { body: withKey("order:rvh:after-kill") }) : r1;
    log("H3 après kill", r1.status, r1.json?.outcome, JSON.stringify(r1.json?.error_codes), "puis", r2.status, r2.json?.outcome);
    assert.equal(r2.json.outcome, "RECEIVED");
    assert.equal(server.isExited(), false);
  });

  test("ADV-H4 Content-Type text/plain et Origin étranger : acceptés (aucun contrôle) — à qualifier", async () => {
    const r = await http("POST", "/api/site/order", { body: withKey("order:rvh:ctype"), headers: { "content-type": "text/plain", origin: "https://evil.example" } });
    log("H4 text/plain + Origin evil", r.status, r.json?.outcome, "ACAO:", r.headers.get("access-control-allow-origin"));
  });

  test("ADV-H5 poll HTTP : limit '010', '1e1', '+10', ' 10', absent, cursor d'une autre forme → CURSOR_INVALID ; PII absente", async () => {
    const out = [];
    for (const lim of ["010", "1e1", "+10", "10.0", "-1", "500", "501"]) {
      const ctx = /^(0|[1-9][0-9]{0,15})$/.test(lim) ? Number(lim) : lim;
      const sig = rawSign("c0-test-events-01", events.EVENTS_POLL_DOMAIN, { cursor: null, limit: ctx });
      const r = await http("GET", `/api/site/events?cursor=&limit=${encodeURIComponent(lim)}`, { headers: { "x-c0-key-id": "c0-test-events-01", "x-c0-signature": sig } });
      out.push(`${lim}=${r.status}:${r.json?.error_codes?.join("") || r.json?.outcome}`);
      if (r.status === 200) { for (const pii of ["achats@example.invalid", "STAGING_FIXTURE Contact", "email"]) assert.ok(!r.text.includes(pii)); assert.ok(!/"id"\s*:/.test(r.text)); }
    }
    const sigNo = rawSign("c0-test-events-01", events.EVENTS_POLL_DOMAIN, { cursor: null, limit: null });
    const noLimit = await http("GET", "/api/site/events?cursor=", { headers: { "x-c0-key-id": "c0-test-events-01", "x-c0-signature": sigNo } });
    out.push(`absent=${noLimit.status}:${noLimit.json?.error_codes?.join("")}`);
    log("H5", out.join(" "));
  });

  test("ADV-H6 journaux serveur : aucun jeton, e-mail, nom ou secret (après toutes les requêtes A)", async () => {
    const r = await http("POST", "/api/site/order", { body: withKey("order:rvh:logs") });
    const tok = r.json.access_token;
    await http("GET", `/api/site/receipt?ref=${r.json.receipt_ref}&access_token=${tok}`);
    const all = server.logs.join("");
    const bad = ["achats@example.invalid", "STAGING_FIXTURE", tok, "TEST_SECRET", "local-dev-only"].filter((s) => all.includes(s));
    log("H6 lignes de journal", all.split("\n").length, "fuites", JSON.stringify(bad));
    assert.deepEqual(bad, []);
  });
});

describe("ADV-H B — mode SITE_BUSINESS_PERSISTENCE absent (A2, non durable)", () => {
  let server, pool;
  before(async () => { pool = newPool(); const env = { ...ENV(), SITE_CATALOG_SOURCE: "fixture", SITE_CATALOG_FIXTURE: "F_SELL_WINDOWS/snapshot_s7.json" }; delete env.SITE_BUSINESS_PERSISTENCE; server = await startServer(env); });
  after(async () => { await stopServer(server); await pool.end(); });
  test("ADV-H7 absent → verdict A2, durable:false, aucune écriture en base, jamais persistence POSTGRESQL", async () => {
    const before = await counts(pool);
    const r = await http("POST", "/api/site/order", { body: withKey("order:rvh:a2") });
    log("H7", r.status, JSON.stringify({ accepted: r.json?.accepted, outcome: r.json?.outcome, durable: r.json?.durable, persistence: r.json?.persistence, receipt_ref: r.json?.receipt_ref ?? null }));
    assert.notEqual(r.json.durable, true); assert.notEqual(r.json.persistence, "POSTGRESQL_SITE_LOCAL");
    assert.deepEqual(await counts(pool), before);
  });
});

describe("ADV-H C — valeur de mode en casse différente", () => {
  let server;
  before(async () => { server = await startServer({ ...ENV(), SITE_BUSINESS_PERSISTENCE: "POSTGRESQL" }); });
  after(async () => { await stopServer(server); });
  test("ADV-H8 'POSTGRESQL' → 503 TRANSACTIONS_CONFIG_INVALID (aucune tolérance)", async () => {
    const r = await http("POST", "/api/site/quote", { body: withKey("order:rvh:case") });
    log("H8", r.status, r.json?.transport_error);
    assert.equal(r.status, 503); assert.equal(r.json.transport_error, "TRANSACTIONS_CONFIG_INVALID");
  });
});
