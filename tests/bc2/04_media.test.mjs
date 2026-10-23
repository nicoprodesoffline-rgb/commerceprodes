// Famille 4 — médias : absent -> MEDIA_MISSING ; octets corrompus -> MEDIA_HASH_MISMATCH ; SVG -> MEDIA_TYPE_REJECTED ;
// jamais d'ACK ni d'activation.
// Cas rejoués : F_FULL_CORRUPT.media_missing, media_hash_mismatch, media_type_svg_declared, media_type_magic_mismatch.
// Le store média du cas C0 est reproduit EN BASE : média supprimé (perte de stockage simulée) ou octets altérés
// directement dans site_media (corruption simulée) — le PUT, lui, refuse des octets dont le SHA diffère.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { ACTIVATE, STAGE, VERIFY, activateBase, body, deps, loadCase, mediaHeaders, newPool, outcomeOf, pointer, putAllMedia, receiver, resetDb, scalar } from "./helpers.mjs";

let pool;
let basePointer;
before(async () => { await resetDb(); pool = newPool(); await activateBase(pool); basePointer = await pointer(pool); });
after(async () => { await pool.end(); });

const ABC7 = "abc733be";

async function assertNoActivation(c) {
  assert.deepEqual(await pointer(pool), basePointer, "pointeur inchangé");
  assert.equal(await scalar(pool, "SELECT count(*)::int FROM site_generation WHERE payload_sha256 = $1 AND ack_json IS NOT NULL", [c.doc.payload_sha256]), 0, "aucun ACK stocké");
}

test("F_FULL_CORRUPT.media_missing : VERIFY et ACTIVATE -> MEDIA_MISSING, génération reste STAGED", async () => {
  const c = loadCase("F_FULL_CORRUPT.media_missing");
  const d = deps(pool, { now: c.now, policy: c.policy });
  const missing = (await pool.query("SELECT sha256 FROM site_media WHERE sha256 LIKE $1", [`${ABC7}%`])).rows[0].sha256;
  await pool.query("DELETE FROM site_media WHERE sha256 = $1", [missing]); // store du cas : abc733be… absent
  assert.equal(body(await STAGE(d, c)).outcome, "STAGED");
  for (const res of [await VERIFY(d, c), await ACTIVATE(d, c)]) {
    assert.deepEqual(outcomeOf(res), { accepted: false, outcome: c.verdict.outcome, error_codes: c.verdict.error_codes });
    assert.equal(res.status, 422);
    assert.equal(body(res).stage, "media");
    assert.equal(res.headers["x-c0-outcome"], undefined);
  }
  assert.equal(await scalar(pool, "SELECT status FROM site_generation WHERE payload_sha256 = $1", [c.doc.payload_sha256]), "STAGED");
  await assertNoActivation(c);
});

test("F_FULL_CORRUPT.media_hash_mismatch : PUT d'octets faux refusé ; octets altérés en base -> MEDIA_HASH_MISMATCH", async () => {
  const c = loadCase("F_FULL_CORRUPT.media_hash_mismatch");
  const d = deps(pool, { now: c.now, policy: c.policy });
  const wrong = c.media.find((m) => m.sha256.startsWith(ABC7)); // le cas associe abc733be… aux octets de full_family_1.png
  // 1) transport : PUT sur le chemin abc733be… avec d'autres octets -> refus, rien stocké
  const put = await receiver.putMedia(d, wrong.sha256, wrong.bytes, mediaHeaders(wrong.sha256, wrong.bytes.length), "image/png");
  assert.equal(put.status, 422);
  assert.deepEqual(body(put).error_codes, ["MEDIA_HASH_MISMATCH"]);
  assert.equal(await scalar(pool, "SELECT count(*)::int FROM site_media WHERE sha256 = $1", [wrong.sha256]), 0);
  // 2) stockage corrompu (store du cas reproduit en base, hors receiver)
  await pool.query("INSERT INTO site_media (sha256, mime, size, bytes) VALUES ($1, 'image/png', $2, $3)", [wrong.sha256, wrong.bytes.length, Buffer.from(wrong.bytes)]);
  for (const res of [await VERIFY(d, c), await ACTIVATE(d, c)]) {
    assert.deepEqual(outcomeOf(res), { accepted: false, outcome: c.verdict.outcome, error_codes: c.verdict.error_codes });
    assert.equal(body(res).stage, "media");
  }
  await assertNoActivation(c);
  // 3) un PUT des bons octets répare la ligne (adressage par contenu) : on remet le store sain pour la suite
  const good = loadCase("F_FULL_CORRUPT.legit_withdrawals_listed").media.find((m) => m.sha256.startsWith(ABC7));
  const repaired = await receiver.putMedia(d, good.sha256, good.bytes, mediaHeaders(good.sha256, good.bytes.length), "image/png");
  assert.equal(body(repaired).outcome, "REPAIRED");
});

for (const caseId of ["F_FULL_CORRUPT.media_type_svg_declared", "F_FULL_CORRUPT.media_type_magic_mismatch"]) {
  test(`${caseId} : MEDIA_TYPE_REJECTED, pas d'ACK, pas d'activation`, async () => {
    const c = loadCase(caseId);
    const d = deps(pool, { now: c.now, policy: c.policy });
    const staged = await STAGE(d, c);
    let final = staged;
    if (body(staged).outcome === "STAGED") {
      await putAllMedia(d, c);
      const verified = await VERIFY(d, c);
      assert.deepEqual(outcomeOf(verified), { accepted: false, outcome: c.verdict.outcome, error_codes: c.verdict.error_codes });
      final = await ACTIVATE(d, c);
    }
    assert.deepEqual(outcomeOf(final), { accepted: false, outcome: c.verdict.outcome, error_codes: c.verdict.error_codes });
    assert.equal(final.status, 415);
    assert.ok(["semantic", "media"].includes(body(final).stage), `étape ${body(final).stage}`);
    await assertNoActivation(c);
  });
}
