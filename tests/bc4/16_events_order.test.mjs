// W4 lot I — ordre de service du poll au-delà de 9 événements (régression trouvée par la campagne réelle, C12).
// `ORDER BY id` désignait l'alias texte `id::text AS id` : le SITE servait « 10 », « 11 », « 12 », « 8 », « 9 »…
// L'ordre d'insertion de l'outbox (C0 §11 / annexe BC4 : « dans l'ordre id ») doit être numérique.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { ack, activate, businessCase, newPool, poll, resetDb, submit } from "./helpers.mjs";

let pool;
let ids;

before(async () => {
  await resetDb();
  pool = newPool();
  await activate(pool, "F_SELL_WINDOWS.activate");
  const base = JSON.parse(Buffer.from(businessCase("F_QUOTE_ORDER.order_valid").bytes).toString("utf8"));
  for (let i = 0; i < 23; i++) {
    const body = { ...base, idempotency_key: `order:w4i:order-${String(i).padStart(3, "0")}` };
    assert.equal((await submit(pool, "order", JSON.stringify(body), "2026-10-20T09:00:00Z")).body.outcome, "RECEIVED");
  }
  ids = (await pool.query("SELECT event_id FROM site_outbox_event ORDER BY id")).rows.map((r) => r.event_id);
  assert.equal(ids.length, 23);
});
after(async () => { await pool.end(); });

test("23 événements : le poll les sert dans l'ordre NUMÉRIQUE des id (pas « 10 » avant « 9 »)", async () => {
  const r = await poll(pool, { cursor: null, limit: 500 });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.events.map((e) => e.event_id), ids);
});

test("tête du flux : limit=3 sert les 3 plus anciens non acquittés, même au-delà de l'id 9", async () => {
  await ack(pool, { event_ids: ids.slice(0, 7) });
  const r = await poll(pool, { cursor: null, limit: 3 });
  assert.deepEqual(r.body.events.map((e) => e.event_id), ids.slice(7, 10), "ids 8, 9, 10 dans cet ordre");
  await ack(pool, { event_ids: ids.slice(7, 10) });
  const next = await poll(pool, { cursor: null, limit: 3 });
  assert.deepEqual(next.body.events.map((e) => e.event_id), ids.slice(10, 13));
});
