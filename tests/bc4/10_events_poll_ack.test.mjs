// Famille 10 — CE-T17/T18/T19 poll : client simulant la Factory (clé c0-test-events-01) reçoit les événements ;
// sans ACK → re-servis au poll suivant (le consommateur les reconnaît EVENT_DUPLICATE_NOOP) ; après ACK → plus servis ;
// clé c0-test-publish-02 / c0-test-ack-01 → EVENT_UNAUTHORIZED ; curseur forgé → CURSOR_INVALID ; limit 0 / 501 → CURSOR_INVALID.
// Cas C0 : F_QUOTE_ORDER.poll_first_page, poll_next_page, poll_with_publish_key, poll_with_ack_key, poll_unknown_cursor,
// poll_limit_zero, event_replay_after_lost_ack (sémantique), event_order_received / event_quote_requested (APPLY).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { VERDICTS, ack, activate, businessCase, c0events, events, headers, newPool, poll, rawSign, resetDb, submit } from "./helpers.mjs";

let pool;
const consumed = []; // registre du consommateur simulé (Factory)

/** Ce que ferait la Factory : validateEvent sur les octets EXACTS, persistance du record si APPLY. */
function consume(served) {
  const out = [];
  for (const e of served) {
    const v = c0events.validateEvent(e.bytes, consumed);
    if (v.outcome === "APPLY") consumed.push(JSON.parse(JSON.stringify(v.record)));
    out.push(v);
  }
  return out;
}

before(async () => {
  await resetDb();
  pool = newPool();
  await activate(pool, "F_SELL_WINDOWS.activate");
  for (const caseId of ["F_QUOTE_ORDER.order_valid", "F_QUOTE_ORDER.quote_priced", "F_QUOTE_ORDER.quote_unpriced_no_window"]) {
    const c = businessCase(caseId);
    assert.equal((await submit(pool, c.kind, c.bytes, c.now)).body.outcome, "RECEIVED");
  }
});
after(async () => { await pool.end(); });

let firstCursor;

test("CE-T17 premier poll (curseur null) → 3 événements dans l'ordre, octets exacts APPLY — F_QUOTE_ORDER.poll_first_page", async () => {
  assert.equal(VERDICTS["F_QUOTE_ORDER.poll_first_page"].outcome, "AUTHORIZED");
  const r = await poll(pool, { cursor: null, limit: 10 });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.events.length, 3);
  assert.deepEqual(r.body.events.map((e) => JSON.parse(Buffer.from(e.bytes).toString("utf8")).event_type), ["order.received", "quote.requested", "quote.requested"]);
  const stored = (await pool.query("SELECT event_id, event_bytes FROM site_outbox_event ORDER BY id")).rows;
  r.body.events.forEach((e, i) => assert.ok(Buffer.from(e.bytes).equals(stored[i].event_bytes), "octets servis = octets stockés"));
  assert.deepEqual(consume(r.body.events).map((v) => v.outcome), ["APPLY", "APPLY", "APPLY"]);
  assert.match(r.body.next_cursor, /^CUR-[0-9a-f]{32}$/);
  firstCursor = r.body.next_cursor;
  const st = (await pool.query("SELECT DISTINCT status FROM site_outbox_event")).rows.map((x) => x.status);
  assert.deepEqual(st, ["DELIVERED_TO_POLL"]);
});

test("CE-T18 sans ACK → les mêmes événements sont re-servis ; le consommateur les reconnaît EVENT_DUPLICATE_NOOP — F_QUOTE_ORDER.poll_next_page, event_replay_after_lost_ack", async () => {
  const r = await poll(pool, { cursor: firstCursor, limit: 10 });
  assert.equal(r.status, 200);
  assert.equal(r.body.events.length, 3);
  const verdicts = consume(r.body.events);
  assert.deepEqual(verdicts.map((v) => [v.outcome, v.error_codes]), Array(3).fill(["DUPLICATE_NOOP", ["EVENT_DUPLICATE_NOOP"]]));
  assert.deepEqual(VERDICTS["F_QUOTE_ORDER.event_replay_after_lost_ack"].error_codes, ["EVENT_DUPLICATE_NOOP"]);
  const counts = (await pool.query("SELECT delivery_count FROM site_outbox_event ORDER BY id")).rows.map((x) => x.delivery_count);
  assert.deepEqual(counts, [2, 2, 2]);
  firstCursor = r.body.next_cursor;
});

test("limit=1 → pagination ordonnée, re-service du plus ancien non acquitté", async () => {
  const a = await poll(pool, { cursor: firstCursor, limit: 1 });
  assert.equal(a.body.events.length, 1);
  const oldest = (await pool.query("SELECT event_id FROM site_outbox_event ORDER BY id LIMIT 1")).rows[0].event_id;
  assert.equal(a.body.events[0].event_id, oldest);
});

test("ACK par event_ids puis par curseur → ACKED, plus jamais servis", async () => {
  const ids = (await pool.query("SELECT event_id FROM site_outbox_event ORDER BY id")).rows.map((x) => x.event_id);
  const one = await ack(pool, { event_ids: [ids[0]] });
  assert.equal(one.status, 200, JSON.stringify(one.body));
  assert.deepEqual(one.body.acked, [ids[0]]);
  const again = await ack(pool, { event_ids: [ids[0], "EVT-inconnu-0001"] });
  assert.deepEqual(again.body.already_acked, [ids[0]]);
  assert.deepEqual(again.body.unknown, ["EVT-inconnu-0001"]);

  const p = await poll(pool, { cursor: firstCursor, limit: 10 });
  assert.deepEqual(p.body.events.map((e) => e.event_id), ids.slice(1), "l'événement acquitté n'est plus servi");
  const byCursor = await ack(pool, { cursor: p.body.next_cursor });
  assert.deepEqual(byCursor.body.acked, ids.slice(1));
  const empty = await poll(pool, { cursor: p.body.next_cursor, limit: 10 });
  assert.equal(empty.status, 200);
  assert.deepEqual(empty.body.events, []);
  const st = (await pool.query("SELECT DISTINCT status FROM site_outbox_event")).rows.map((x) => x.status);
  assert.deepEqual(st, ["ACKED"]);
});

test("nouvel événement après ACK → servi seul ; un événement PENDING n'est pas acquittable avant livraison", async () => {
  const o = JSON.parse(Buffer.from(businessCase("F_QUOTE_ORDER.order_valid").bytes).toString("utf8"));
  o.idempotency_key = "order:qo:after-ack";
  assert.equal((await submit(pool, "order", JSON.stringify(o), "2026-10-20T09:00:00Z")).body.outcome, "RECEIVED");
  const pending = (await pool.query("SELECT event_id FROM site_outbox_event WHERE status = 'PENDING'")).rows[0].event_id;
  const early = await ack(pool, { event_ids: [pending] });
  assert.deepEqual(early.body.not_delivered, [pending]);
  const r = await poll(pool, { cursor: null, limit: 500 });
  assert.deepEqual(r.body.events.map((e) => e.event_id), [pending]);
  assert.deepEqual(consume(r.body.events).map((v) => v.outcome), ["APPLY"]);
});

test("CE-T19 clé de publication / d'ACK / inconnue → EVENT_UNAUTHORIZED 401 (même avec un HMAC correct pour cette clé) — poll_with_publish_key, poll_with_ack_key", async () => {
  for (const keyId of ["c0-test-publish-02", "c0-test-ack-01", "c0-test-publish-00"]) {
    const r = await poll(pool, { cursor: null, limit: 10, keyId });
    assert.equal(r.status, 401, keyId);
    assert.deepEqual(r.body.error_codes, ["EVENT_UNAUTHORIZED"]);
    const a = await ack(pool, { event_ids: ["EVT-x-00000001"] }, { keyId });
    assert.equal(a.status, 401);
  }
  const unknown = await events.pollEvents({ pool, keyring: (await import("./helpers.mjs")).KEYRING }, headers("c0-test-nope-01", "0".repeat(64)), new URLSearchParams("cursor=&limit=10"));
  assert.equal(unknown.status, 401);
  assert.deepEqual(VERDICTS["F_QUOTE_ORDER.poll_with_publish_key"].error_codes, ["EVENT_UNAUTHORIZED"]);
});

test("signature absente, fausse, ou sur un autre {cursor, limit} → EVENT_UNAUTHORIZED", async () => {
  assert.equal((await poll(pool, { cursor: null, limit: 10, signature: "" })).status, 401);
  assert.equal((await poll(pool, { cursor: null, limit: 10, signature: "f".repeat(64) })).status, 401);
  const sigFor5 = rawSign("c0-test-events-01", events.EVENTS_POLL_DOMAIN, { cursor: null, limit: 5 });
  assert.equal((await poll(pool, { cursor: null, limit: 10, signature: sigFor5 })).status, 401);
  const wrongDomain = rawSign("c0-test-events-01", events.EVENTS_ACK_DOMAIN, { cursor: null, limit: 10 });
  assert.equal((await poll(pool, { cursor: null, limit: 10, signature: wrongDomain })).status, 401);
});

test("curseur forgé / limit 0 / 501 / non entier → CURSOR_INVALID 400 — poll_unknown_cursor, poll_limit_zero", async () => {
  for (const [cursor, limit] of [["CUR-00000000000000000000000000000000", 10], ["forged", 10], [null, 0], [null, 501], [null, "1.5"], [null, "abc"]]) {
    const r = await poll(pool, { cursor, limit });
    assert.equal(r.status, 400, `${cursor} ${limit} ${JSON.stringify(r.body)}`);
    assert.deepEqual(r.body.error_codes, ["CURSOR_INVALID"]);
  }
  for (const body of [{ cursor: "CUR-00000000000000000000000000000000" }, { event_ids: [] }, { event_ids: ["a", "a"] }, { cursor: "x", event_ids: ["y"] }]) {
    const a = await ack(pool, body);
    assert.equal(a.status, 400, JSON.stringify(body));
  }
  assert.deepEqual(VERDICTS["F_QUOTE_ORDER.poll_unknown_cursor"].error_codes, ["CURSOR_INVALID"]);
  assert.deepEqual(VERDICTS["F_QUOTE_ORDER.poll_limit_zero"].error_codes, ["CURSOR_INVALID"]);
});

test("un curseur est lié à la clé qui l'a reçu : présenté par une autre clé events → CURSOR_INVALID (trousseau étendu de test)", async () => {
  const { KEYRING } = await import("./helpers.mjs");
  const keyring = { keys: [...KEYRING.keys, { key_id: "c0-test-events-02", scope: "site_events.read", status: "ACTIVE", secret_utf8: "TEST_SECRET_NOT_FOR_PRODUCTION_events_02_xxxxxxxx" }] };
  const r = await poll(pool, { cursor: null, limit: 1 });
  const cursor = r.body.next_cursor;
  const { createHmac } = await import("node:crypto");
  const { jsonc } = await import("./helpers.mjs");
  const sig = createHmac("sha256", Buffer.from(keyring.keys.at(-1).secret_utf8)).update(Buffer.concat([Buffer.from(events.EVENTS_POLL_DOMAIN), Buffer.from([0]), Buffer.from(jsonc.canonicalBytes({ cursor, limit: 1 }))])).digest("hex");
  const other = await events.pollEvents({ pool, keyring }, headers("c0-test-events-02", sig), new URLSearchParams({ cursor, limit: "1" }));
  assert.equal(other.status, 400);
});
