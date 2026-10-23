// Famille 5 — CE-T12 : séquence ≠ ACTIVE → CART_STALE (commande) / CATALOG_CHANGED (devis chiffré) ;
// ACTIVE UNSAFE → refus fail-closed. Cas : F_QUOTE_ORDER.order_stale_generation, quote_stale_generation,
// order_catalog_unsafe, quote_priced_on_unsafe, quote_unpriced_on_unsafe (génération F_SELL_WINDOWS.activate).
// UNSAFE : incohérence pointeur/génération (site_active_pointer.payload_sha256 altéré, comme BC3) — la migration BC2 005
// interdit désormais d'altérer site_generation.snapshot_bytes. Depuis BC2 c5dc9d02 (review F-05), lib/site-db rend alors
// `snapshot: null` : aucune Generation C0 n'est constructible, BC4 répond 503 CATALOG_UNAVAILABLE (ACTIVE_GENERATION_UNREADABLE)
// au lieu du verdict C0 CATALOG_UNSAFE — plus strict que C0 (un devis non chiffré et un rejeu sont aussi refusés), voir REPORT.
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

test("ACTIVE UNSAFE (pointeur ≠ génération) → 503 CATALOG_UNAVAILABLE fail-closed, 0 écriture, même pour un devis non chiffré et un rejeu — order_catalog_unsafe, quote_priced_on_unsafe, quote_unpriced_on_unsafe", async () => {
  const done = businessCase("F_QUOTE_ORDER.order_valid");
  assert.equal((await submit(pool, "order", done.bytes, done.now)).body.outcome, "RECEIVED");
  const pointer = (await pool.query("SELECT payload_sha256 FROM site_active_pointer WHERE singleton = 1")).rows[0].payload_sha256;
  await pool.query("UPDATE site_active_pointer SET payload_sha256 = $1 WHERE singleton = 1", ["0".repeat(64)]);
  try {
    const active = await siteDb.getActiveGeneration(pool);
    assert.equal(active.status, "UNSAFE");
    assert.equal(active.snapshot, null, "BC2 F-05 : aucun document non vérifié");
    const before = await counts(pool);
    for (const caseId of ["F_QUOTE_ORDER.order_catalog_unsafe", "F_QUOTE_ORDER.quote_priced_on_unsafe", "F_QUOTE_ORDER.quote_unpriced_on_unsafe", "F_QUOTE_ORDER.order_double_post_same_key"]) {
      const c = businessCase(caseId);
      const res = await submit(pool, c.kind, c.bytes, c.now);
      assert.equal(res.status, 503, caseId);
      assert.equal(res.body.accepted, false, caseId);
      assert.equal(res.body.site_status, "CATALOG_UNAVAILABLE", caseId);
      assert.equal(res.body.reason, "ACTIVE_GENERATION_UNREADABLE", caseId);
      assert.equal(res.body.receipt_ref, undefined, caseId);
    }
    assert.deepEqual(await counts(pool), before);
  } finally {
    await pool.query("UPDATE site_active_pointer SET payload_sha256 = $1 WHERE singleton = 1", [pointer]);
  }
  const back = await siteDb.getActiveGeneration(pool);
  assert.equal(back.status, "ACTIVE");
  const replay = await submit(pool, "order", done.bytes, done.now);
  assert.equal(replay.body.outcome, "REPLAY_SAME_RECEIPT", "pointeur rétabli : le reçu d'origine revient");
});

test("migration BC2 005 : les octets ACTIVE ne sont plus altérables en SQL (le test précédent passe donc par le pointeur)", async () => {
  const active = await siteDb.getActiveGeneration(pool);
  await assert.rejects(pool.query("UPDATE site_generation SET snapshot_bytes = snapshot_bytes || '\\x20'::bytea WHERE id = $1", [active.generation_id]), /immuables/);
});

test("aucune génération jamais activée → 503 CATALOG_UNAVAILABLE NO_ACTIVE_GENERATION", async () => {
  await resetDb();
  const c = businessCase("F_QUOTE_ORDER.order_valid");
  const res = await submit(pool, "order", c.bytes, c.now);
  assert.equal(res.status, 503);
  assert.equal(res.body.reason, "NO_ACTIVE_GENERATION");
});
