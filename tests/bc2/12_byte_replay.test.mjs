// Famille 12 — génération valide réémise octet pour octet après activation -> REPLAY_ACK, octets de l'ACK identiques.
// Cas rejoués : F_SIMPLE_READY.activate_first (ACK = ack_s1.json) et F_FULL_CORRUPT.replay_active (s10, ack_s10.json).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { ACTIVATE, STAGE, VERIFY, deps, fixtureBytes, fullFlow, jsonc, loadCase, newPool, resetDb, scalar } from "./helpers.mjs";

let pool;
before(async () => { pool = newPool(); });
after(async () => { await pool.end(); });

for (const [first, replay, ackPath] of [
  ["F_SIMPLE_READY.activate_first", "F_SIMPLE_READY.replay_after_lost_ack", "documents/F_SIMPLE_READY/ack_s1.json"],
  ["F_FULL_CORRUPT.activate_base", "F_FULL_CORRUPT.replay_active", "documents/F_FULL_CORRUPT/ack_s10.json"],
]) {
  test(`${replay} : réémission des mêmes octets (STAGE, VERIFY, ACTIVATE) -> REPLAY_ACK = ${ackPath}`, async () => {
    await resetDb();
    const c1 = loadCase(first);
    const flow = await fullFlow(pool, c1);
    const expected = Buffer.from(jsonc.canonicalBytes(jsonc.parseBytes(fixtureBytes(ackPath), 1 << 20)));
    assert.equal(Buffer.compare(Buffer.from(flow.activated.body), expected), 0);
    const c2 = loadCase(replay);
    assert.equal(Buffer.compare(Buffer.from(c2.bytes), Buffer.from(c1.bytes)), 0, "mêmes octets de snapshot");
    const d = deps(pool, { now: c2.now, policy: c2.policy });
    const rows = await scalar(pool, "SELECT count(*)::int FROM site_generation");
    for (const res of [await STAGE(d, c2), await VERIFY(d, c2), await ACTIVATE(d, c2), await STAGE(d, c2)]) {
      assert.equal(res.status, 200);
      assert.equal(res.headers["x-c0-outcome"], "REPLAY_ACK");
      assert.equal(Buffer.compare(Buffer.from(res.body), expected), 0);
    }
    assert.equal(await scalar(pool, "SELECT count(*)::int FROM site_generation"), rows);
  });
}
