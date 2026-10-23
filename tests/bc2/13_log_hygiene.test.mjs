// Famille 13 — journal : aucune PII, aucun secret (TEST_SECRET), aucun octet ni contenu de snapshot, append-only.
// Parcours rejoué : F_SIMPLE_READY.activate_first, replay_after_lost_ack, signature_wrong_scope, price_public_leak,
// F_FULL_CORRUPT.activate_base, hash_wrong, full_amputated_self_consistent, media_hash_mismatch (PUT faux).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ACTIVATE, KEYRING_PATH, STAGE, activateBase, deps, fullFlow, loadCase, mediaHeaders, newPool, receiver, resetDb } from "./helpers.mjs";

let pool;
before(async () => { await resetDb(); pool = newPool(); });
after(async () => { await pool.end(); });

const ALLOWED_DETAIL_KEYS = new Set(["rules", "hold_reason", "key_id", "transport_error", "media_sha256", "size", "generation_status", "superseded_sequence", "second_effect", "reason"]);

test("journal sans PII, sans secret, sans octets ; détail borné ; UPDATE/DELETE/TRUNCATE refusés", async () => {
  await fullFlow(pool, loadCase("F_SIMPLE_READY.activate_first"));
  const lost = loadCase("F_SIMPLE_READY.replay_after_lost_ack");
  await ACTIVATE(deps(pool, { now: lost.now, policy: lost.policy }), lost);
  for (const id of ["F_SIMPLE_READY.signature_wrong_scope", "F_SIMPLE_READY.price_public_leak"]) {
    const c = loadCase(id);
    await STAGE(deps(pool, { now: c.now, policy: c.policy }), c);
  }
  await resetDb();
  await activateBase(pool);
  for (const id of ["F_FULL_CORRUPT.hash_wrong", "F_FULL_CORRUPT.full_amputated_self_consistent"]) {
    const c = loadCase(id);
    if (id.endsWith("hash_wrong")) await STAGE(deps(pool, { now: c.now, policy: c.policy }), c);
    else await fullFlow(pool, c);
  }
  const mm = loadCase("F_FULL_CORRUPT.media_hash_mismatch");
  const wrong = mm.media.find((m) => m.sha256.startsWith("abc733be"));
  await receiver.putMedia(deps(pool), wrong.sha256, wrong.bytes, mediaHeaders(wrong.sha256, wrong.bytes.length), "image/png");

  const { rows } = await pool.query("SELECT row_to_json(l)::text AS line, detail FROM site_publication_log l ORDER BY id");
  assert.ok(rows.length >= 10, `journal trop court (${rows.length})`);
  const text = rows.map((r) => r.line).join("\n");
  const keyring = JSON.parse(readFileSync(KEYRING_PATH, "utf8"));
  const secrets = keyring.keys.map((k) => k.secret_utf8);
  assert.equal(text.includes("TEST_SECRET"), false, "secret de test dans le journal");
  for (const s of secrets) assert.equal(text.includes(s), false);
  // aucune signature (octets de transport), aucun contenu de snapshot (noms, descriptions, catégories, prix)
  const docs = [loadCase("F_SIMPLE_READY.activate_first"), loadCase("F_FULL_CORRUPT.activate_base")];
  for (const c of docs) {
    assert.equal(text.includes(c.transport.signature), false, "signature dans le journal");
    for (const fam of c.doc.families) {
      assert.equal(text.includes(fam.name), false, `nom de famille dans le journal : ${fam.name}`);
      assert.equal(text.includes(fam.description_short), false);
    }
    for (const cat of c.doc.categories) assert.equal(text.includes(cat.name), false);
  }
  assert.equal(/"unit_amount"|"public_item_key"|"families"|STAGING_FIXTURE /.test(text), false, "contenu de snapshot dans le journal");
  assert.equal(/iVBOR|\\\\x89|PNG/.test(text), false, "octets média dans le journal");
  assert.equal(/@[A-Za-z0-9-]+\.[A-Za-z]{2,}/.test(text), false, "adresse e-mail dans le journal");
  for (const r of rows) for (const k of Object.keys(r.detail)) assert.ok(ALLOWED_DETAIL_KEYS.has(k), `clé de détail non prévue : ${k}`);

  // append-only
  await assert.rejects(pool.query("UPDATE site_publication_log SET outcome = 'X'"), /append-only/);
  await assert.rejects(pool.query("DELETE FROM site_publication_log"), /append-only/);
  await assert.rejects(pool.query("TRUNCATE site_publication_log"), /append-only/);
});
