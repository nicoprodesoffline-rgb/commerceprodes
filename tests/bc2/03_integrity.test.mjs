// Famille 3 — intégrité : payload_sha256 modifié / corps altéré -> INTEGRITY_MISMATCH ; comptes faux ->
// MANIFEST_COUNTS_MISMATCH ; rien n'est persisté (hors journal).
// Cas rejoués : F_FULL_CORRUPT.hash_wrong, body_tampered_after_hash, manifest_counts_wrong, withdrawals_digest_wrong.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { STAGE, activateBase, body, deps, loadCase, newPool, outcomeOf, pointer, resetDb, scalar } from "./helpers.mjs";

let pool;
before(async () => { await resetDb(); pool = newPool(); await activateBase(pool); });
after(async () => { await pool.end(); });

for (const [caseId, stage] of [
  ["F_FULL_CORRUPT.hash_wrong", "integrity"],
  ["F_FULL_CORRUPT.body_tampered_after_hash", "integrity"],
  ["F_FULL_CORRUPT.manifest_counts_wrong", "integrity"],
  ["F_FULL_CORRUPT.withdrawals_digest_wrong", "integrity"],
]) {
  test(`${caseId} : refus au STAGE, rien de persisté`, async () => {
    const c = loadCase(caseId);
    const rowsBefore = await scalar(pool, "SELECT count(*)::int FROM site_generation");
    const ptr = await pointer(pool);
    const res = await STAGE(deps(pool, { now: c.now, policy: c.policy }), c);
    assert.deepEqual(outcomeOf(res), { accepted: c.verdict.accepted, outcome: c.verdict.outcome, error_codes: c.verdict.error_codes });
    assert.equal(res.status, 422);
    assert.equal(body(res).stage, stage);
    if (c.verdict.expect && c.verdict.expect["detail.rules"]) assert.deepEqual(body(res).detail.rules, c.verdict.expect["detail.rules"]);
    assert.equal(await scalar(pool, "SELECT count(*)::int FROM site_generation"), rowsBefore, "aucune ligne site_generation ajoutée");
    assert.deepEqual(await pointer(pool), ptr);
    const logged = await scalar(pool, "SELECT count(*)::int FROM site_publication_log WHERE operation = 'STAGE' AND error_codes = $1::jsonb", [JSON.stringify(c.verdict.error_codes)]);
    assert.ok(logged >= 1, "refus journalisé");
  });
}
