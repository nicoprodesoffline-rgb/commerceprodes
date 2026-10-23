// Famille 3 — même clé, autre payload → DUPLICATE_KEY_DIFFERENT_PAYLOAD 409, 0 nouvel objet ;
// lignes réordonnées → même reçu. Cas : F_QUOTE_ORDER.order_valid, order_same_key_other_payload,
// order_replay_lines_reordered, quote_priced, quote_same_key_other_payload.
// Le registre durable passe AVANT le contrôle de génération (C0 §10.4) : vérifié aussi ici.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { activate, assertVerdict, businessCase, counts, newPool, resetDb, submit } from "./helpers.mjs";

let pool;
let first;
before(async () => {
  await resetDb();
  pool = newPool();
  await activate(pool, "F_SELL_WINDOWS.activate");
  const c = businessCase("F_QUOTE_ORDER.order_valid");
  first = await submit(pool, "order", c.bytes, c.now);
  assertVerdict(first, c.caseId);
});
after(async () => { await pool.end(); });

test("même clé, autre payload → 409 DUPLICATE_KEY_DIFFERENT_PAYLOAD, 0 écriture — F_QUOTE_ORDER.order_same_key_other_payload", async () => {
  const before = await counts(pool);
  const c = businessCase("F_QUOTE_ORDER.order_same_key_other_payload");
  const res = await submit(pool, "order", c.bytes, c.now);
  assertVerdict(res, c.caseId);
  assert.equal(res.status, 409);
  assert.equal(res.body.durable, false);
  assert.equal(res.body.access_token, undefined);
  assert.deepEqual(await counts(pool), before);
});

test("lignes réordonnées → REPLAY_SAME_RECEIPT, même reçu, 0 écriture — F_QUOTE_ORDER.order_replay_lines_reordered", async () => {
  const before = await counts(pool);
  const c = businessCase("F_QUOTE_ORDER.order_replay_lines_reordered");
  const res = await submit(pool, "order", c.bytes, c.now);
  assertVerdict(res, c.caseId);
  assert.equal(res.body.outcome, "REPLAY_SAME_RECEIPT");
  assert.deepEqual(res.body.receipt, first.body.receipt);
  assert.equal(res.body.access_token, undefined);
  assert.deepEqual(await counts(pool), before);
});

test("rejeu à un autre instant serveur → toujours le reçu d'origine (idempotence avant génération/prix)", async () => {
  const c = businessCase("F_QUOTE_ORDER.order_valid");
  const res = await submit(pool, "order", c.bytes, "2027-01-01T00:00:00Z");
  assert.equal(res.body.outcome, "REPLAY_SAME_RECEIPT");
  assert.deepEqual(res.body.receipt, first.body.receipt);
});

test("devis : même clé autre payload → 409 ; la même clé côté commande est un autre espace (kind) — F_QUOTE_ORDER.quote_same_key_other_payload", async () => {
  const q = businessCase("F_QUOTE_ORDER.quote_priced");
  assertVerdict(await submit(pool, "quote_request", q.bytes, q.now), q.caseId);
  const before = await counts(pool);
  const c = businessCase("F_QUOTE_ORDER.quote_same_key_other_payload");
  const res = await submit(pool, "quote_request", c.bytes, c.now);
  assertVerdict(res, c.caseId);
  assert.equal(res.status, 409);
  assert.deepEqual(await counts(pool), before);
  const { rows } = await pool.query("SELECT kind, idempotency_key FROM site_idempotency ORDER BY kind");
  assert.deepEqual(rows, [{ kind: "order", idempotency_key: "order:qo:0001" }, { kind: "quote_request", idempotency_key: "quote:qo:0001" }]);
});
