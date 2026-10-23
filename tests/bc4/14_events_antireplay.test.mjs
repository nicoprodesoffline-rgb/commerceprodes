// W4 lot I — DF-0115 : anti-rejeu du poll GET /api/site/events (transport de staging, hors C0).
// Contexte signé v2 {cursor, issued_at_utc, limit, nonce} ; fenêtre SITE_EVENTS_POLL_WINDOW_SECONDS (défaut 300 s) ;
// nonce déjà vu → 401 POLL_REPLAYED ; hors fenêtre → 401 POLL_STALE ; sans fraîcheur (requête W1) → 401 POLL_FRESHNESS_REQUIRED.
// Un poll refusé ne sert rien, n'émet aucun curseur et ne touche aucun delivery_count.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { KEYRING, activate, businessCase, events, freshness, headers, jsonc, newPool, poll, pollContext, rawSign, resetDb, scalar, submit } from "./helpers.mjs";

let pool;
const KEY = "c0-test-events-01";

before(async () => {
  await resetDb();
  pool = newPool();
  await activate(pool, "F_SELL_WINDOWS.activate");
  for (const caseId of ["F_QUOTE_ORDER.order_valid", "F_QUOTE_ORDER.quote_priced"]) {
    const c = businessCase(caseId);
    assert.equal((await submit(pool, c.kind, c.bytes, c.now)).body.outcome, "RECEIVED");
  }
});
after(async () => { await pool.end(); });

/** Requête de poll construite UNE fois (en-têtes figés), rejouable à l'identique comme le ferait un attaquant. */
function captured({ cursor = null, limit = 10, fresh = freshness(), keyId = KEY } = {}) {
  const sig = rawSign(keyId, events.EVENTS_POLL_DOMAIN, pollContext(cursor, limit, fresh));
  const params = new URLSearchParams({ cursor: cursor ?? "", limit: String(limit) });
  return { fresh, send: async (deps = {}) => body(await events.pollEvents({ pool, keyring: KEYRING, ...deps }, headers(keyId, sig, fresh), params)) };
}

function body(r) {
  return { status: r.status, body: JSON.parse(Buffer.from(r.body).toString("utf8")) };
}

async function state() {
  return {
    cursors: await scalar(pool, "SELECT count(*)::int FROM site_event_cursor"),
    deliveries: (await pool.query("SELECT delivery_count FROM site_outbox_event ORDER BY id")).rows.map((r) => r.delivery_count),
  };
}

function assertRefused(r, transportError) {
  assert.equal(r.status, 401, JSON.stringify(r.body));
  assert.deepEqual(r.body.error_codes, ["EVENT_UNAUTHORIZED"]);
  assert.equal(r.body.transport_error, transportError);
  assert.equal(r.body.events, undefined, "un refus ne sert aucun événement");
}

test("poll v2 frais → 200 ; le MÊME poll rejoué (mêmes octets, mêmes en-têtes) → 401 POLL_REPLAYED, aucun effet", async () => {
  const req = captured();
  const first = await req.send();
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal(first.body.events.length, 2);
  const before = await state();
  for (let i = 0; i < 3; i++) assertRefused(await req.send(), "POLL_REPLAYED");
  assert.deepEqual(await state(), before, "rejeu : 0 curseur émis, delivery_count inchangé");
  const logged = (await pool.query("SELECT detail FROM site_transaction_log WHERE operation = 'EVENTS_POLL' AND detail->>'transport_error' = 'POLL_REPLAYED'")).rows;
  assert.equal(logged.length, 3);
  assert.ok(logged.every((r) => !JSON.stringify(r.detail).includes(req.fresh.nonce) && !("signature" in r.detail)), "journal sans nonce ni signature");
});

test("rejeu d'une requête capturée APRÈS la fenêtre → 401 POLL_STALE (vérifié avant le nonce), aucun effet", async () => {
  const issued = Date.now();
  const req = captured({ fresh: freshness(issued) });
  assert.equal((await req.send({ clockMs: () => issued + 1000 })).status, 200);
  const before = await state();
  assertRefused(await req.send({ clockMs: () => issued + 301_000 }), "POLL_STALE");
  // Même une requête jamais vue est refusée hors fenêtre (passé comme futur).
  assertRefused(await captured({ fresh: freshness(issued - 301_000) }).send({ clockMs: () => issued }), "POLL_STALE");
  assertRefused(await captured({ fresh: freshness(issued + 301_000) }).send({ clockMs: () => issued }), "POLL_STALE");
  assert.deepEqual(await state(), before);
});

test("bornes de la fenêtre : |écart| = fenêtre accepté, fenêtre + 1 s refusé ; fenêtre configurable (windowSeconds)", async () => {
  const t = Date.parse("2026-10-23T12:00:00Z");
  assert.equal((await captured({ fresh: freshness(t) }).send({ clockMs: () => t + 300_000 })).status, 200);
  assertRefused(await captured({ fresh: freshness(t) }).send({ clockMs: () => t + 301_000 }), "POLL_STALE");
  assert.equal((await captured({ fresh: freshness(t) }).send({ clockMs: () => t + 5_000, windowSeconds: 5 })).status, 200);
  assertRefused(await captured({ fresh: freshness(t) }).send({ clockMs: () => t + 6_000, windowSeconds: 5 }), "POLL_STALE");
});

test("requête W1 (domaine v1, sans issued_at ni nonce) → 401 POLL_FRESHNESS_REQUIRED ; fraîcheur mal formée → idem", async () => {
  const params = new URLSearchParams({ cursor: "", limit: "10" });
  const legacy = rawSign(KEY, events.LEGACY_EVENTS_POLL_DOMAIN_V1, { cursor: null, limit: 10 });
  assertRefused(body(await events.pollEvents({ pool, keyring: KEYRING }, headers(KEY, legacy), params)), "POLL_FRESHNESS_REQUIRED");
  const good = freshness();
  for (const bad of [
    { issuedAt: good.issuedAt },
    { nonce: good.nonce },
    { issuedAt: "2026-10-23T12:00:00.000Z", nonce: good.nonce },
    { issuedAt: "2026-10-23 12:00:00Z", nonce: good.nonce },
    { issuedAt: "2026-13-40T99:99:99Z", nonce: good.nonce },
    { issuedAt: good.issuedAt, nonce: good.nonce.toUpperCase() },
    { issuedAt: good.issuedAt, nonce: good.nonce.slice(0, 31) },
    { issuedAt: good.issuedAt, nonce: `${good.nonce}0` },
  ]) {
    const sig = rawSign(KEY, events.EVENTS_POLL_DOMAIN, { cursor: null, limit: 10, issued_at_utc: bad.issuedAt ?? null, nonce: bad.nonce ?? null });
    assertRefused(body(await events.pollEvents({ pool, keyring: KEYRING }, headers(KEY, sig, bad), params)), "POLL_FRESHNESS_REQUIRED");
  }
  // Ancien domaine v1 signé sur le contexte v2 : signature refusée (sans transport_error).
  const fresh = freshness();
  const v1OnV2 = rawSign(KEY, events.LEGACY_EVENTS_POLL_DOMAIN_V1, pollContext(null, 10, fresh));
  const r = body(await events.pollEvents({ pool, keyring: KEYRING }, headers(KEY, v1OnV2, fresh), params));
  assert.equal(r.status, 401);
  assert.equal(r.body.transport_error, undefined);
});

test("signature d'un autre nonce / d'un autre issued_at que les en-têtes → 401 EVENT_UNAUTHORIZED, nonce NON consommé", async () => {
  const fresh = freshness();
  const other = freshness();
  const params = new URLSearchParams({ cursor: "", limit: "10" });
  const sigOtherNonce = rawSign(KEY, events.EVENTS_POLL_DOMAIN, pollContext(null, 10, { ...fresh, nonce: other.nonce }));
  assert.equal(body(await events.pollEvents({ pool, keyring: KEYRING }, headers(KEY, sigOtherNonce, fresh), params)).status, 401);
  const sigOtherTime = rawSign(KEY, events.EVENTS_POLL_DOMAIN, pollContext(null, 10, { ...fresh, issuedAt: "2026-01-01T00:00:00Z" }));
  assert.equal(body(await events.pollEvents({ pool, keyring: KEYRING }, headers(KEY, sigOtherTime, fresh), params)).status, 401);
  assert.equal(await scalar(pool, "SELECT count(*)::int FROM site_event_poll_nonce WHERE nonce = $1", [fresh.nonce]), 0, "une requête non authentifiée n'écrit rien");
  // La bonne signature avec ce nonce passe ensuite (il n'a pas été brûlé par les essais refusés).
  assert.equal((await poll(pool, { cursor: null, limit: 10, fresh })).status, 200);
});

test("clé de publication / d'ACK avec fraîcheur valide → 401 EVENT_UNAUTHORIZED (scope), rien écrit", async () => {
  const nonces = await scalar(pool, "SELECT count(*)::int FROM site_event_poll_nonce");
  for (const keyId of ["c0-test-publish-02", "c0-test-ack-01"]) {
    const r = await captured({ keyId }).send();
    assert.equal(r.status, 401);
    assert.deepEqual(r.body.error_codes, ["EVENT_UNAUTHORIZED"]);
  }
  assert.equal(await scalar(pool, "SELECT count(*)::int FROM site_event_poll_nonce"), nonces);
});

test("8 rejeux CONCURRENTS de la même requête → exactement 1 servie, 7 POLL_REPLAYED, 1 curseur émis", async () => {
  const req = captured({ limit: 1 });
  const cursorsBefore = await scalar(pool, "SELECT count(*)::int FROM site_event_cursor");
  const results = await Promise.all(Array.from({ length: 8 }, () => req.send()));
  assert.equal(results.filter((r) => r.status === 200).length, 1, JSON.stringify(results.map((r) => r.status)));
  assert.equal(results.filter((r) => r.body.transport_error === "POLL_REPLAYED").length, 7);
  assert.equal(await scalar(pool, "SELECT count(*)::int FROM site_event_cursor"), cursorsBefore + 1);
});

test("le nonce est propre à la clé : même nonce sous une autre clé site_events.read → accepté (trousseau de test étendu)", async () => {
  const keyring = { keys: [...KEYRING.keys, { key_id: "c0-test-events-02", scope: "site_events.read", status: "ACTIVE", secret_utf8: "TEST_SECRET_NOT_FOR_PRODUCTION_events_02_xxxxxxxx" }] };
  const fresh = freshness();
  assert.equal((await poll(pool, { cursor: null, limit: 1, fresh })).status, 200);
  const sig = createHmac("sha256", Buffer.from(keyring.keys.at(-1).secret_utf8)).update(Buffer.concat([Buffer.from(events.EVENTS_POLL_DOMAIN), Buffer.from([0]), Buffer.from(jsonc.canonicalBytes(pollContext(null, 1, fresh)))])).digest("hex");
  const other = body(await events.pollEvents({ pool, keyring }, headers("c0-test-events-02", sig, fresh), new URLSearchParams({ cursor: "", limit: "1" })));
  assert.equal(other.status, 200, JSON.stringify(other.body));
});

test("SITE_EVENTS_POLL_WINDOW_SECONDS : défaut 300, bornes 5…3600, toute autre valeur → erreur de configuration", async () => {
  assert.equal(events.pollWindowSeconds({}), 300);
  assert.equal(events.pollWindowSeconds({ SITE_EVENTS_POLL_WINDOW_SECONDS: "" }), 300);
  assert.equal(events.pollWindowSeconds({ SITE_EVENTS_POLL_WINDOW_SECONDS: "5" }), 5);
  assert.equal(events.pollWindowSeconds({ SITE_EVENTS_POLL_WINDOW_SECONDS: "3600" }), 3600);
  for (const raw of ["4", "3601", "0", "-5", "1.5", "0300", "abc", " 60", "60s"]) {
    assert.throws(() => events.pollWindowSeconds({ SITE_EVENTS_POLL_WINDOW_SECONDS: raw }), (e) => e.code === "TRANSACTIONS_CONFIG_INVALID", raw);
  }
});

test("le nonce d'un poll accepté est enregistré UNE fois, sans UPDATE ni DELETE possibles hors purge", async () => {
  const fresh = freshness();
  assert.equal((await poll(pool, { cursor: null, limit: 1, fresh })).status, 200);
  assert.equal(await scalar(pool, "SELECT count(*)::int FROM site_event_poll_nonce WHERE nonce = $1 AND credential_key_id = $2", [fresh.nonce, KEY]), 1);
  await assert.rejects(pool.query("UPDATE site_event_poll_nonce SET seen_at = now() WHERE nonce = $1", [fresh.nonce]), /immuable hors purge/);
  await assert.rejects(pool.query("DELETE FROM site_event_poll_nonce WHERE nonce = $1", [fresh.nonce]), /immuable hors purge/);
  await assert.rejects(pool.query("TRUNCATE site_event_poll_nonce"), /immuable/);
});
