// Famille 8 — crash injecté entre l'INSERT objet et l'INSERT outbox → rollback complet (aucun objet orphelin,
// aucun événement, aucune idempotence) ; le rejeu honnête de la même clé reçoit ensuite un vrai RECEIVED.
// Cas rejoués : F_QUOTE_ORDER.order_valid, F_QUOTE_ORDER.quote_priced. Plus : contraintes différées en base.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { ZERO, activate, assertVerdict, businessCase, counts, newPool, resetDb, submit } from "./helpers.mjs";

let pool;
before(async () => { await resetDb(); pool = newPool(); await activate(pool, "F_SELL_WINDOWS.activate"); });
after(async () => { await pool.end(); });

const crash = async () => { throw Object.assign(new Error("crash injecté (test)"), { code: "TEST_CRASH" }); };

for (const caseId of ["F_QUOTE_ORDER.order_valid", "F_QUOTE_ORDER.quote_priced"]) {
  test(`crash après INSERT objet → 503 DB_WRITE_FAILED, 0 orphelin ; rejeu → RECEIVED — ${caseId}`, async () => {
    const before = await counts(pool);
    const c = businessCase(caseId);
    const res = await submit(pool, c.kind, c.bytes, c.now, { afterObjectInsert: crash });
    assert.equal(res.status, 503);
    assert.deepEqual(res.body.error_codes, ["DB_WRITE_FAILED"]);
    assert.equal(res.body.detail.reason, "TEST_CRASH");
    assert.deepEqual(await counts(pool), before, "rollback complet");
    const retry = await submit(pool, c.kind, c.bytes, c.now);
    assertVerdict(retry, caseId);
    assert.equal(retry.body.outcome, "RECEIVED");
  });
}

test("crash juste avant COMMIT (après outbox) → rien de visible", async () => {
  const o = JSON.parse(Buffer.from(businessCase("F_QUOTE_ORDER.order_valid").bytes).toString("utf8"));
  o.idempotency_key = "order:crash:before-commit";
  const before = await counts(pool);
  const res = await submit(pool, "order", JSON.stringify(o), "2026-10-20T09:00:00Z", { beforeCommit: crash });
  assert.equal(res.status, 503);
  assert.deepEqual(await counts(pool), before);
});

test("base : commande sans ligne → COMMIT refusé (contrainte différée site_order_lines_consistent)", async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`INSERT INTO site_order (order_ref, idempotency_key, request_fingerprint, catalogue_sequence, contact, currency, total_amount, total_cents, status, access_token_sha256, created_at_utc)
                        VALUES ('ORD-raw-0', 'order:raw:0000', repeat('a', 64), 7, '{}', 'EUR', '1.00', 100, 'RECEIVED', repeat('b', 64), '2026-10-20T09:00:00Z')`);
    await assert.rejects(client.query("COMMIT"), (e) => e.code === "23514" && /sans ligne/.test(e.message));
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
    client.release();
  }
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM site_order WHERE order_ref = 'ORD-raw-0'")).rows[0].n, 0);
});

test("base : total_cents ≠ Σ line_total_cents → COMMIT refusé ; total_cents ≠ total_amount → CHECK", async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(`INSERT INTO site_order (order_ref, idempotency_key, request_fingerprint, catalogue_sequence, contact, currency, total_amount, total_cents, status, access_token_sha256, created_at_utc)
                        VALUES ('ORD-raw-1', 'order:raw:0001', repeat('a', 64), 7, '{}', 'EUR', '2.00', 200, 'RECEIVED', repeat('b', 64), '2026-10-20T09:00:00Z') RETURNING id`);
    await client.query(`INSERT INTO site_order_line (order_id, line_no, public_item_key, variant_axes, quantity, catalogue_sequence, rate_id, unit_amount, unit_cents, currency, tax_basis_or_status, offer_price_version_public, line_total, line_total_cents)
                        VALUES ($1, 1, 'PI-000000CHJ', '{}', 1, 7, 'R-1', '1.00', 100, 'EUR', 'HT', 'OPV-1', '1.00', 100)`, [rows[0].id]);
    await assert.rejects(client.query("COMMIT"), (e) => e.code === "23514" && /somme des lignes/.test(e.message));
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
    client.release();
  }
  await assert.rejects(
    pool.query(`INSERT INTO site_order (order_ref, idempotency_key, request_fingerprint, catalogue_sequence, contact, currency, total_amount, total_cents, status, access_token_sha256, created_at_utc)
                VALUES ('ORD-raw-2', 'order:raw:0002', repeat('a', 64), 7, '{}', 'EUR', '2.00', 201, 'RECEIVED', repeat('b', 64), '2026-10-20T09:00:00Z')`),
    (e) => e.code === "23514",
  );
});

test("base : lignes, outbox (contenu) et idempotence immuables ; ACKED final", async () => {
  await assert.rejects(pool.query("UPDATE site_order_line SET unit_amount = '1.00'"), /immuable/);
  await assert.rejects(pool.query("DELETE FROM site_order"), /immuable/);
  await assert.rejects(pool.query("UPDATE site_order SET total_amount = '1.00', total_cents = 100"), /statut/);
  await assert.rejects(pool.query("UPDATE site_outbox_event SET event_bytes = '\\x7b7d'::bytea"), /immuable/);
  await assert.rejects(pool.query("DELETE FROM site_idempotency"), /immuable/);
  await assert.rejects(pool.query("TRUNCATE site_outbox_event"), /immuable/);
});
