// Review BC4 — crash entre chaque paire d'INSERT par trigger d'échec temporaire (base de test du reviewer) :
// idempotence→objet, objet→lignes (2e ligne), lignes→outbox, outbox. Attendu : 503 DB_WRITE_FAILED, 0 orphelin, clé réutilisable.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { activate, businessCase, counts, newPool, resetDb, submit } from "../../../../../tests/bc4/helpers.mjs";
const C = businessCase("F_QUOTE_ORDER.order_valid");
const BASE = JSON.parse(Buffer.from(C.bytes).toString("utf8"));
const enc = (o) => new TextEncoder().encode(JSON.stringify(o));
let pool;
before(async () => {
  await resetDb(); pool = newPool(); await activate(pool, "F_SELL_WINDOWS.activate");
  await pool.query(`CREATE FUNCTION rv_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF TG_TABLE_NAME = 'site_order_line' AND NEW.line_no < 2 THEN RETURN NEW; END IF;
    RAISE EXCEPTION 'rv crash %', TG_TABLE_NAME USING ERRCODE = 'P0001'; END $$`);
});
after(async () => pool.end());
for (const table of ["site_order", "site_order_line", "site_outbox_event"]) {
  test(`ADV-C crash à l'INSERT ${table} → 503, 0 ligne dans toutes les tables, clé réutilisable`, async () => {
    const before = await counts(pool);
    await pool.query(`CREATE TRIGGER rv_fail_t BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION rv_fail()`);
    const req = { ...BASE, idempotency_key: `order:rv:crash-${table}` };
    let r;
    try { r = await submit(pool, "order", enc(req), C.now); } finally { await pool.query(`DROP TRIGGER rv_fail_t ON ${table}`); }
    console.log(`# ADV-C ${table}`, r.status, JSON.stringify(r.body.error_codes), JSON.stringify(r.body.detail));
    assert.equal(r.status, 503); assert.deepEqual(r.body.error_codes, ["DB_WRITE_FAILED"]); assert.equal(r.body.accepted, false);
    assert.deepEqual(await counts(pool), before);
    const again = await submit(pool, "order", enc(req), C.now);
    assert.equal(again.body.outcome, "RECEIVED");
  });
}
