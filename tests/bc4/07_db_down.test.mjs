// Famille 7 — DB coupée → DB_WRITE_FAILED 503, 0 ligne, 0 événement, jamais accepted:true.
// (a) pool pointé sur une base inexistante ; (b) connexion révoquée EN COURS de transaction (pg_terminate_backend
// depuis une autre connexion, après l'INSERT de l'objet). Cas rejoué : F_QUOTE_ORDER.order_valid / quote_priced.
// DB_WRITE_FAILED est NOT_TESTABLE_IN_C0 (c0/ts/src/errors.ts) : prouvé ici seulement.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { ZERO, activate, assertVerdict, businessCase, counts, deadPool, newPool, resetDb, submit } from "./helpers.mjs";

let pool;
before(async () => { await resetDb(); pool = newPool(); await activate(pool, "F_SELL_WINDOWS.activate"); });
after(async () => { await pool.end(); });

test("(a) base inexistante → 503 DB_WRITE_FAILED, accepted:false — F_QUOTE_ORDER.order_valid", async () => {
  const dead = deadPool();
  try {
    const c = businessCase("F_QUOTE_ORDER.order_valid");
    for (const kind of ["order", "quote_request"]) {
      const bytes = kind === "order" ? c.bytes : businessCase("F_QUOTE_ORDER.quote_priced").bytes;
      const res = await submit(dead, kind, bytes, c.now);
      assert.equal(res.status, 503);
      assert.equal(res.body.accepted, false);
      assert.deepEqual(res.body.error_codes, ["DB_WRITE_FAILED"]);
      assert.equal(res.body.durable, false);
      assert.equal(res.body.receipt_ref, undefined);
      assert.equal(res.body.access_token, undefined);
      assert.equal(res.body.detail.reason, "3D000", "SQLSTATE invalid_catalog_name");
    }
  } finally {
    await dead.end();
  }
  assert.deepEqual(await counts(pool), ZERO);
});

test("(b) connexion révoquée après l'INSERT de l'objet → 503 DB_WRITE_FAILED, ROLLBACK complet — F_QUOTE_ORDER.order_valid", async () => {
  const killer = newPool(1);
  try {
    const c = businessCase("F_QUOTE_ORDER.order_valid");
    const res = await submit(pool, "order", c.bytes, c.now, {
      afterObjectInsert: async (client) => {
        const { rows } = await client.query("SELECT pg_backend_pid() AS pid");
        await killer.query("SELECT pg_terminate_backend($1)", [rows[0].pid]);
      },
    });
    assert.equal(res.status, 503);
    assert.deepEqual(res.body.error_codes, ["DB_WRITE_FAILED"]);
    assert.equal(res.body.accepted, false);
  } finally {
    await killer.end();
  }
  assert.deepEqual(await counts(pool), ZERO, "aucun objet, aucune ligne, aucune idempotence, aucun événement");
  // Le pool reste utilisable (connexion détruite, pas rendue) et un rejeu honnête réussit.
  const c = businessCase("F_QUOTE_ORDER.order_valid");
  const retry = await submit(pool, "order", c.bytes, c.now);
  assertVerdict(retry, c.caseId);
  assert.equal(retry.body.outcome, "RECEIVED");
});

test("(c) connexion révoquée juste avant COMMIT (devis) → 503, rien de commité — F_QUOTE_ORDER.quote_priced", async () => {
  const killer = newPool(1);
  const before = await counts(pool);
  try {
    const c = businessCase("F_QUOTE_ORDER.quote_priced");
    const res = await submit(pool, "quote_request", c.bytes, c.now, {
      beforeCommit: async (client) => {
        const { rows } = await client.query("SELECT pg_backend_pid() AS pid");
        await killer.query("SELECT pg_terminate_backend($1)", [rows[0].pid]);
      },
    });
    assert.equal(res.status, 503);
    assert.deepEqual(res.body.error_codes, ["DB_WRITE_FAILED"]);
  } finally {
    await killer.end();
  }
  assert.deepEqual(await counts(pool), before);
});
