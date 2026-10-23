// Famille 5 — CE-T12 : séquence ≠ ACTIVE → CART_STALE (commande) / CATALOG_CHANGED (devis chiffré) ;
// génération UNSAFE → CATALOG_UNSAFE. Cas : F_QUOTE_ORDER.order_stale_generation, quote_stale_generation,
// order_catalog_unsafe, quote_priced_on_unsafe, quote_unpriced_on_unsafe (génération F_SELL_WINDOWS.activate).
// UNSAFE : octets ACTIVE altérés en base (même procédé que tests/bc2/15_read_interface) → lib/site-db rend status UNSAFE.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { activate, assertVerdict, businessCase, counts, newPool, resetDb, siteDb, submit } from "./helpers.mjs";

let pool;
before(async () => { await resetDb(); pool = newPool(); await activate(pool, "F_SELL_WINDOWS.activate"); });
after(async () => { await pool.end(); });

async function refused(caseId, status) {
  const before = await counts(pool);
  const c = businessCase(caseId);
  const res = await submit(pool, c.kind, c.bytes, c.now);
  assertVerdict(res, caseId);
  assert.equal(res.status, status, `${caseId} : HTTP`);
  assert.equal(res.body.catalogue_sequence, 7, "la réponse dit quelle génération ACTIVE a jugé");
  assert.deepEqual(await counts(pool), before);
}

test("CE-T12 commande sur séquence 6 (ACTIVE 7) → CART_STALE 409 — F_QUOTE_ORDER.order_stale_generation", async () => {
  await refused("F_QUOTE_ORDER.order_stale_generation", 409);
});

test("CE-T12 devis chiffré sur autre séquence → CATALOG_CHANGED 409 — F_QUOTE_ORDER.quote_stale_generation", async () => {
  await refused("F_QUOTE_ORDER.quote_stale_generation", 409);
});

test("génération UNSAFE → CATALOG_UNSAFE (commande, devis chiffré) ; devis non chiffré reçu — order_catalog_unsafe, quote_priced_on_unsafe, quote_unpriced_on_unsafe", async () => {
  const active = await siteDb.getActiveGeneration(pool);
  await pool.query("UPDATE site_generation SET snapshot_bytes = snapshot_bytes || '\\x20'::bytea WHERE id = $1", [active.generation_id]);
  assert.equal((await siteDb.getActiveGeneration(pool)).status, "UNSAFE");
  await refused("F_QUOTE_ORDER.order_catalog_unsafe", 503);
  await refused("F_QUOTE_ORDER.quote_priced_on_unsafe", 503);
  const c = businessCase("F_QUOTE_ORDER.quote_unpriced_on_unsafe");
  const res = await submit(pool, c.kind, c.bytes, c.now);
  assertVerdict(res, c.caseId);
  assert.equal(res.body.receipt.lines[0].priced, false);
  assert.equal((await counts(pool)).site_quote_request, 1);
});

test("octets ACTIVE illisibles → 503 CATALOG_UNAVAILABLE, aucun verdict inventé, 0 écriture", async () => {
  const active = await siteDb.getActiveGeneration(pool);
  await pool.query("UPDATE site_generation SET snapshot_bytes = '\\x7b'::bytea WHERE id = $1", [active.generation_id]);
  const before = await counts(pool);
  const c = businessCase("F_QUOTE_ORDER.order_valid");
  const res = await submit(pool, "order", c.bytes, c.now);
  assert.equal(res.status, 503);
  assert.equal(res.body.site_status, "CATALOG_UNAVAILABLE");
  assert.equal(res.body.reason, "ACTIVE_GENERATION_UNREADABLE");
  assert.equal(res.body.accepted, false);
  assert.deepEqual(await counts(pool), before);
});

test("aucune génération jamais activée → 503 CATALOG_UNAVAILABLE NO_ACTIVE_GENERATION", async () => {
  await resetDb();
  const c = businessCase("F_QUOTE_ORDER.order_valid");
  const res = await submit(pool, "order", c.bytes, c.now);
  assert.equal(res.status, 503);
  assert.equal(res.body.reason, "NO_ACTIVE_GENERATION");
});
