// Famille 2 — CE-T03 : deux POST concurrents, même clé, même corps (Promise.all, deux connexions PostgreSQL)
// → 1 objet, 1 événement, deux réponses portant le même reçu. Cas C0 : F_QUOTE_ORDER.order_valid
// (puis F_QUOTE_ORDER.order_double_post_same_key pour le rejeu), F_QUOTE_ORDER.quote_priced / quote_double_post.
// La barrière force les deux transactions à valider AVANT toute écriture : c'est l'unicité (kind, idempotency_key)
// en base, et non un verrou applicatif, qui tranche.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { ZERO, activate, assertVerdict, barrier, businessCase, counts, newPool, resetDb, submit } from "./helpers.mjs";

let pool;
before(async () => { await resetDb(); pool = newPool(10); await activate(pool, "F_SELL_WINDOWS.activate"); });
after(async () => { await pool.end(); });

function pair(responses) {
  const outcomes = responses.map((r) => r.body.outcome).sort();
  assert.deepEqual(outcomes, ["RECEIVED", "REPLAY_SAME_RECEIPT"], JSON.stringify(responses.map((r) => r.body)));
  const [first, replay] = responses[0].body.outcome === "RECEIVED" ? responses : [responses[1], responses[0]];
  assert.equal(first.status, 200);
  assert.equal(replay.status, 200);
  assert.deepEqual(replay.body.receipt, first.body.receipt, "même reçu (receipt_ref, lignes, empreinte, total)");
  assert.equal(replay.body.receipt_ref, first.body.receipt_ref);
  assert.equal(typeof first.body.access_token, "string");
  assert.equal(replay.body.access_token, undefined, "le jeton d'accès n'est renvoyé qu'une fois");
  return first;
}

test("CE-T03 commande : course forcée (barrière) → 1 site_order, 1 événement, même reçu — F_QUOTE_ORDER.order_valid", async () => {
  const c = businessCase("F_QUOTE_ORDER.order_valid");
  const wait = barrier(2);
  const responses = await Promise.all([submit(pool, "order", c.bytes, c.now, { afterValidate: wait }), submit(pool, "order", c.bytes, c.now, { afterValidate: wait })]);
  pair(responses);
  assert.deepEqual(await counts(pool), { ...ZERO, site_order: 1, site_order_line: 2, site_idempotency: 1, site_outbox_event: 1 });
  const { rows } = await pool.query("SELECT detail FROM site_transaction_log WHERE outcome = 'REPLAY_SAME_RECEIPT'");
  assert.deepEqual(rows.map((r) => r.detail), [{ concurrent: true }], "le second a bien perdu la course sur l'unicité (relecture)");
});

test("CE-T03 commande : rejeu séquentiel → REPLAY_SAME_RECEIPT, aucun nouvel objet — F_QUOTE_ORDER.order_double_post_same_key", async () => {
  const c = businessCase("F_QUOTE_ORDER.order_double_post_same_key");
  const res = await submit(pool, "order", c.bytes, c.now);
  assertVerdict(res, c.caseId);
  assert.equal(res.body.outcome, "REPLAY_SAME_RECEIPT");
  assert.deepEqual(await counts(pool), { ...ZERO, site_order: 1, site_order_line: 2, site_idempotency: 1, site_outbox_event: 1 });
});

test("CE-T03 commande : 8 POST concurrents sans barrière → toujours 1 objet, 1 événement, 1 seul RECEIVED", async () => {
  const c = businessCase("F_QUOTE_ORDER.order_valid");
  const bytes = new TextEncoder().encode(Buffer.from(c.bytes).toString("utf8").replace("order:qo:0001", "order:qo:conc-8"));
  const responses = await Promise.all(Array.from({ length: 8 }, () => submit(pool, "order", bytes, c.now)));
  assert.equal(responses.filter((r) => r.body.outcome === "RECEIVED").length, 1);
  assert.equal(responses.filter((r) => r.body.outcome === "REPLAY_SAME_RECEIPT").length, 7);
  assert.equal(new Set(responses.map((r) => r.body.receipt_ref)).size, 1);
  assert.deepEqual(await counts(pool), { ...ZERO, site_order: 2, site_order_line: 4, site_idempotency: 2, site_outbox_event: 2 });
});

test("CE-T03 devis : course forcée → 1 devis, 1 événement quote.requested — F_QUOTE_ORDER.quote_priced, quote_double_post", async () => {
  const c = businessCase("F_QUOTE_ORDER.quote_priced");
  const wait = barrier(2);
  const responses = await Promise.all([submit(pool, "quote_request", c.bytes, c.now, { afterValidate: wait }), submit(pool, "quote_request", c.bytes, c.now, { afterValidate: wait })]);
  pair(responses);
  const replay = await submit(pool, "quote_request", businessCase("F_QUOTE_ORDER.quote_double_post").bytes, c.now);
  assertVerdict(replay, "F_QUOTE_ORDER.quote_double_post");
  const n = await counts(pool);
  assert.equal(n.site_quote_request, 1);
  assert.equal(n.site_quote_line, 1);
  assert.equal(n.site_outbox_event, 3);
  const { rows } = await pool.query("SELECT event_type, count(*)::int AS n FROM site_outbox_event GROUP BY event_type ORDER BY event_type");
  assert.deepEqual(rows, [{ event_type: "order.received", n: 2 }, { event_type: "quote.requested", n: 1 }]);
});

test("course forcée même clé, AUTRE corps → 1 RECEIVED + 1 DUPLICATE_KEY_DIFFERENT_PAYLOAD 409 — F_QUOTE_ORDER.order_same_key_other_payload", async () => {
  const valid = Buffer.from(businessCase("F_QUOTE_ORDER.order_valid").bytes).toString("utf8").replaceAll("order:qo:0001", "order:qo:race-diff");
  const other = Buffer.from(businessCase("F_QUOTE_ORDER.order_same_key_other_payload").bytes).toString("utf8").replaceAll("order:qo:0001", "order:qo:race-diff");
  const before = await counts(pool);
  const wait = barrier(2);
  const now = "2026-10-20T09:00:00Z";
  const responses = await Promise.all([submit(pool, "order", valid, now, { afterValidate: wait }), submit(pool, "order", other, now, { afterValidate: wait })]);
  const outcomes = responses.map((r) => `${r.status}:${r.body.outcome}:${r.body.error_codes.join(",")}`).sort();
  assert.deepEqual(outcomes, ["200:RECEIVED:", "409:REJECTED:DUPLICATE_KEY_DIFFERENT_PAYLOAD"]);
  const after = await counts(pool);
  assert.equal(after.site_order, before.site_order + 1);
  assert.equal(after.site_outbox_event, before.site_outbox_event + 1);
});
