// Famille 5 — séquence : N-1 -> STALE_SEQUENCE ; même N autre SHA -> SEQUENCE_COLLISION ; même N même SHA -> REPLAY_ACK identique.
// Cas rejoués : F_FULL_CORRUPT.sequence_stale, sequence_collision, replay_active (ACK de référence ack_s10.json).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { ACTIVATE, STAGE, activateBase, body, deps, fixtureBytes, jsonc, loadCase, newPool, outcomeOf, pointer, resetDb, scalar } from "./helpers.mjs";

let pool;
let base;
before(async () => { await resetDb(); pool = newPool(); base = await activateBase(pool); });
after(async () => { await pool.end(); });

test("F_FULL_CORRUPT.activate_base : ACK = ack_s10.json (octets canoniques)", async () => {
  const expected = jsonc.canonicalBytes(jsonc.parseBytes(fixtureBytes("documents/F_FULL_CORRUPT/ack_s10.json"), 1 << 20));
  assert.equal(Buffer.compare(Buffer.from(base.activated.body), Buffer.from(expected)), 0);
});

for (const caseId of ["F_FULL_CORRUPT.sequence_stale", "F_FULL_CORRUPT.sequence_collision"]) {
  test(`${caseId} : refus au STAGE (étape sequence), 409, rien persisté`, async () => {
    const c = loadCase(caseId);
    const n = await scalar(pool, "SELECT count(*)::int FROM site_generation");
    const res = await STAGE(deps(pool, { now: c.now, policy: c.policy }), c);
    assert.deepEqual(outcomeOf(res), { accepted: false, outcome: c.verdict.outcome, error_codes: c.verdict.error_codes });
    assert.equal(res.status, 409);
    assert.equal(body(res).stage, "sequence");
    assert.equal(await scalar(pool, "SELECT count(*)::int FROM site_generation"), n);
  });
}

test("F_FULL_CORRUPT.replay_active : même N même SHA -> REPLAY_ACK, octets = ACK stocké = ack_s10.json", async () => {
  const c = loadCase("F_FULL_CORRUPT.replay_active");
  assert.equal(c.verdict.outcome, "REPLAY_ACK");
  const d = deps(pool, { now: c.now, policy: c.policy });
  const ptr = await pointer(pool);
  for (const res of [await STAGE(d, c), await ACTIVATE(d, c)]) {
    assert.equal(res.status, 200);
    assert.equal(res.headers["x-c0-outcome"], "REPLAY_ACK");
    assert.equal(Buffer.compare(Buffer.from(res.body), Buffer.from(base.activated.body)), 0, "ACK rejoué ≠ ACK d'origine");
  }
  assert.deepEqual(await pointer(pool), ptr);
});
