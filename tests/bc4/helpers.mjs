// Outils communs des tests BC4 : PostgreSQL réel prodes_site_bc4_test, fixtures C0 vendues, modules compilés
// (.bc4-build : lib/site-transactions + lib/site-db + c0 ; .bc2-build via tests/bc2/helpers.mjs pour le receiver).
// La génération ACTIVE est posée par le receiver BC2 (STAGE → MEDIA → VERIFY → ACTIVATE) depuis un cas C0 nommé.
// Aucune règle C0 réécrite : les tests comparent au verdict déclaré dans VERDICTS.json.
import { createRequire } from "node:module";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import { FIXTURES, KEYRING, ROOT, VERDICTS, fullFlow, loadCase, testDatabaseUrl } from "../bc2/helpers.mjs";

export { FIXTURES, KEYRING, ROOT, VERDICTS, loadCase, resetDb, newPool, scalar } from "../bc2/helpers.mjs";

const require = createRequire(import.meta.url);
const BUILD = join(ROOT, ".bc4-build");
export const business = require(join(BUILD, "lib/site-transactions/business.js"));
export const receipt = require(join(BUILD, "lib/site-transactions/receipt.js"));
export const events = require(join(BUILD, "lib/site-transactions/events.js"));
export const common = require(join(BUILD, "lib/site-transactions/common.js"));
export const siteDb = require(join(BUILD, "lib/site-db/generation.js"));
export const sitePool = require(join(BUILD, "lib/site-db/pool.js"));
export const c0business = require(join(BUILD, "c0/ts/src/business.js"));
export const c0events = require(join(BUILD, "c0/ts/src/events.js"));
export const jsonc = require(join(BUILD, "c0/ts/src/jsonc.js"));
export const signing = require(join(BUILD, "c0/ts/src/signing.js"));

export const DB_URL = () => testDatabaseUrl();

/** Active la génération d'un cas C0 `evaluate_publication` via le receiver BC2 ; échoue si pas ACTIVATED. */
export async function activate(pool, caseId) {
  const c = loadCase(caseId);
  const flow = await fullFlow(pool, c);
  const outcome = flow.activated.headers["x-c0-outcome"];
  assert.equal(outcome, "ACTIVATED", `${caseId} : activation attendue, reçu ${Buffer.from(flow.activated.body).toString("utf8").slice(0, 300)}`);
  return c;
}

/** Cas C0 business (`validate_order_submit` / `validate_quote_request`) : octets, instant, verdict déclaré. */
export function businessCase(caseId) {
  const [scenario, name] = caseId.split(".");
  const c = JSON.parse(readFileSync(join(FIXTURES, "cases", scenario, `${name}.json`), "utf8"));
  assert.equal(c.case_id, caseId);
  const kind = c.function === "validate_order_submit" ? "order" : c.function === "validate_quote_request" ? "quote_request" : null;
  assert.ok(kind, `${caseId} : fonction inattendue ${c.function}`);
  return {
    caseId,
    kind,
    bytes: new Uint8Array(readFileSync(join(FIXTURES, c.input.request.$bytes))),
    now: c.input.now_utc,
    generation: c.input.generation,
    register: c.input.register,
    verdict: VERDICTS[caseId],
  };
}

export function docBytes(rel) {
  return new Uint8Array(readFileSync(join(FIXTURES, "documents", rel)));
}

export function docJson(rel) {
  return JSON.parse(readFileSync(join(FIXTURES, "documents", rel), "utf8"));
}

export const enc = (value) => new TextEncoder().encode(typeof value === "string" ? value : JSON.stringify(value));

/** Appel direct du module BC4 (même code que les routes). Renvoie {status, body}. */
export async function submit(pool, kind, bytes, now, hooks) {
  const r = await business.submitBusiness({ pool, now: () => now, hooks }, kind, bytes instanceof Uint8Array ? bytes : enc(bytes));
  return { status: r.status, headers: r.headers, body: JSON.parse(Buffer.from(r.body).toString("utf8")) };
}

/** Compare une réponse BC4 au verdict déclaré par VERDICTS.json pour le cas cité. */
export function assertVerdict(res, caseId, { replay = false } = {}) {
  const o = VERDICTS[caseId];
  assert.ok(o, `cas ${caseId} absent de VERDICTS.json`);
  assert.equal(res.body.accepted, o.accepted, `${caseId} : accepted (HTTP ${res.status} ${JSON.stringify(res.body).slice(0, 300)})`);
  if (!replay) assert.equal(res.body.outcome, o.outcome, `${caseId} : outcome`);
  assert.deepEqual(res.body.error_codes, o.error_codes, `${caseId} : error_codes`);
  if (o.accepted) assert.equal(res.status, 200, `${caseId} : HTTP`);
  else assert.ok(res.status >= 400, `${caseId} : refus en HTTP ${res.status}`);
}

const TABLES = ["site_quote_request", "site_quote_line", "site_order", "site_order_line", "site_idempotency", "site_outbox_event"];

export async function counts(pool) {
  const out = {};
  for (const t of TABLES) {
    const { rows } = await pool.query(`SELECT count(*)::int AS n FROM ${t}`);
    out[t] = rows[0].n;
  }
  return out;
}

export const ZERO = Object.fromEntries(TABLES.map((t) => [t, 0]));

/** Pool sur une base qui N'EXISTE PAS (nom prodes_site_* admis par le garde-fou) : simulation « DB coupée ». */
export function deadPool() {
  const url = new URL(DB_URL());
  url.pathname = "/prodes_site_bc4_absent_db";
  return sitePool.createPool(url.toString(), 2);
}

// ── Client simulant la Factory (poll sortant + ACK), transport STAGING_TRANSPORT ───────────────────────────────

function secretOf(keyId) {
  return KEYRING.keys.find((k) => k.key_id === keyId).secret_utf8;
}

/** HMAC brut (même construction que C0 §7) avec n'importe quelle clé du trousseau — pour prouver le refus par scope. */
export function rawSign(keyId, domain, context) {
  return createHmac("sha256", Buffer.from(secretOf(keyId), "utf8"))
    .update(Buffer.concat([Buffer.from(domain, "utf8"), Buffer.from([0]), Buffer.from(jsonc.canonicalBytes(context))]))
    .digest("hex");
}

export function headers(keyId, signature) {
  const h = new Headers();
  if (keyId !== undefined) h.set("x-c0-key-id", keyId);
  if (signature !== undefined) h.set("x-c0-signature", signature);
  return h;
}

export async function poll(pool, { cursor = null, limit = 100, keyId = "c0-test-events-01", signature } = {}) {
  const params = new URLSearchParams();
  params.set("cursor", cursor ?? "");
  params.set("limit", String(limit));
  const ctxLimit = /^(0|[1-9][0-9]{0,15})$/.test(String(limit)) ? Number(limit) : String(limit);
  const sig = signature ?? rawSign(keyId, events.EVENTS_POLL_DOMAIN, { cursor, limit: ctxLimit });
  const r = await events.pollEvents({ pool, keyring: KEYRING }, headers(keyId, sig), params);
  const body = JSON.parse(Buffer.from(r.body).toString("utf8"));
  if (body.events) for (const e of body.events) e.bytes = new Uint8Array(Buffer.from(e.event_bytes_b64, "base64"));
  return { status: r.status, body };
}

export async function ack(pool, bodyObj, { keyId = "c0-test-events-01", signature } = {}) {
  const sig = signature ?? rawSign(keyId, events.EVENTS_ACK_DOMAIN, bodyObj);
  const r = await events.ackEvents({ pool, keyring: KEYRING }, headers(keyId, sig), enc(bodyObj));
  return { status: r.status, body: JSON.parse(Buffer.from(r.body).toString("utf8")) };
}

/** Barrière : `n` transactions attendent ensemble après validation (force la course sur l'unicité). */
export function barrier(n) {
  let arrived = 0;
  let release;
  const gate = new Promise((r) => (release = r));
  return async () => {
    arrived += 1;
    if (arrived >= n) release();
    await gate;
  };
}
