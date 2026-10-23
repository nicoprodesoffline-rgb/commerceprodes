// Famille 9 — ancienne génération : jamais de re-pointage ; ROLL_FORWARD sur capture ancienne refusé ;
// une restauration = NOUVELLE séquence supérieure, revalidée entièrement.
// Cas rejoués : F_FULL_CORRUPT.roll_forward_old_capture (CATALOG_UNSAFE), F_FULL_CORRUPT.legit_withdrawals_listed,
// puis réactivation de s10 (STALE_SEQUENCE, même règle que F_FULL_CORRUPT.sequence_stale), puis une restauration
// synthétique (contenu s10, séquence 12) construite avec les fonctions C0 (payloadSha256, withdrawalsDigest, sign).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { ACTIVATE, KEYRING, STAGE, activateBase, activation, body, deps, fullFlow, jsonc, loadCase, newPool, outcomeOf, pointer, resetDb, scalar, signing, snapshot } from "./helpers.mjs";

let pool;
let base;
before(async () => { await resetDb(); pool = newPool(); base = await activateBase(pool); });
after(async () => { await pool.end(); });

test("F_FULL_CORRUPT.roll_forward_old_capture : séquence supérieure mais capture antérieure -> CATALOG_UNSAFE", async () => {
  const c = loadCase("F_FULL_CORRUPT.roll_forward_old_capture");
  const ptr = await pointer(pool);
  const flow = await fullFlow(pool, c);
  assert.deepEqual(outcomeOf(flow.activated), { accepted: false, outcome: c.verdict.outcome, error_codes: c.verdict.error_codes });
  assert.equal(body(flow.activated).stage, "safety");
  assert.deepEqual(await pointer(pool), ptr);
  assert.equal(await scalar(pool, "SELECT status FROM site_generation WHERE payload_sha256 = $1", [c.doc.payload_sha256]), "REJECTED");
});

test("réactiver l'ancienne génération s10 après bascule vers s11 -> STALE_SEQUENCE, s10 reste SUPERSEDED", async () => {
  const legit = loadCase("F_FULL_CORRUPT.legit_withdrawals_listed");
  assert.equal((await fullFlow(pool, legit)).activated.headers["x-c0-outcome"], "ACTIVATED");
  const ptr = await pointer(pool);
  const d = deps(pool, { now: legit.now, policy: legit.policy });
  for (const res of [await ACTIVATE(d, base.base), await STAGE(d, base.base)]) {
    assert.deepEqual(outcomeOf(res), { accepted: false, outcome: "REJECTED", error_codes: ["STALE_SEQUENCE"] });
    assert.equal(res.status, 409);
  }
  assert.equal(await scalar(pool, "SELECT status FROM site_generation WHERE payload_sha256 = $1", [base.base.doc.payload_sha256]), "SUPERSEDED");
  assert.deepEqual(await pointer(pool), ptr, "jamais de re-pointage");
});

test("restauration du contenu s10 = nouvelle séquence 12, revalidée contre l'ACTIVE s11 -> ACTIVATED", async () => {
  const legit = loadCase("F_FULL_CORRUPT.legit_withdrawals_listed");
  const doc = structuredClone(base.base.doc);
  doc.publication_id = "PUB-BC2-restore-s12";
  doc.projection_id = "PRJ-BC2-restore-s12";
  doc.catalogue_sequence = 12;
  doc.as_of_utc = "2026-10-21T06:00:00Z";
  doc.generated_at_utc = "2026-10-21T06:05:00Z";
  doc.coverage.previous_catalogue_sequence = legit.doc.catalogue_sequence;
  doc.coverage.previous_payload_sha256 = legit.doc.payload_sha256;
  doc.coverage.expected_withdrawals = [];
  doc.coverage.expected_withdrawals_digest = snapshot.withdrawalsDigest(doc.coverage);
  doc.payload_sha256 = snapshot.payloadSha256(doc);
  const bytes = jsonc.canonicalBytes(doc);
  const signature = signing.sign(KEYRING, "c0-test-publish-02", signing.SCOPE_PUBLISH, signing.DOMAIN_SIG_SNAPSHOT, activation.signatureContext(doc));
  const c = { ...base.base, caseId: "BC2.restore_s12", bytes, doc, now: "2026-10-21T06:10:00Z", transport: { key_id: "c0-test-publish-02", signature } };
  const flow = await fullFlow(pool, c);
  assert.equal(flow.activated.headers["x-c0-outcome"], "ACTIVATED", Buffer.from(flow.activated.body).toString());
  assert.equal((await pointer(pool)).catalogue_sequence, "12");
  const { rows } = await pool.query("SELECT catalogue_sequence::int AS seq, status FROM site_generation WHERE status IN ('ACTIVE','SUPERSEDED') ORDER BY catalogue_sequence");
  assert.deepEqual(rows, [{ seq: 10, status: "SUPERSEDED" }, { seq: 11, status: "SUPERSEDED" }, { seq: 12, status: "ACTIVE" }]);
});
