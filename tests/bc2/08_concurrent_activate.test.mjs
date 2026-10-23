// Famille 8 — deux ACTIVATE concurrents (Promise.all, deux pools donc deux connexions) -> une seule bascule ;
// l'autre reçoit REPLAY_ACK (même génération) ou SEQUENCE_COLLISION (même séquence, autre SHA).
// Cas rejoués : F_FULL_CORRUPT.activate_base (s10) et F_FULL_CORRUPT.sequence_collision (s10' même séquence 10).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { ACTIVATE, STAGE, VERIFY, deps, loadCase, newPool, outcomeOf, putAllMedia, resetDb, scalar } from "./helpers.mjs";

let poolA;
let poolB;
before(async () => { poolA = newPool(4); poolB = newPool(4); });
after(async () => { await poolA.end(); await poolB.end(); });

async function prepare(c) {
  const d = deps(poolA, { now: c.now, policy: c.policy });
  await STAGE(d, c);
  await putAllMedia(d, c);
  await VERIFY(d, c);
}

for (let round = 1; round <= 5; round += 1) {
  test(`F_FULL_CORRUPT.activate_base ×2 en parallèle (tour ${round}) : une bascule, l'autre REPLAY_ACK aux mêmes octets`, async () => {
    await resetDb();
    const c = loadCase("F_FULL_CORRUPT.activate_base");
    await prepare(c);
    const [a, b] = await Promise.all([
      ACTIVATE(deps(poolA, { now: c.now, policy: c.policy }), c),
      ACTIVATE(deps(poolB, { now: c.now, policy: c.policy }), c),
    ]);
    const outcomes = [a.headers["x-c0-outcome"], b.headers["x-c0-outcome"]].sort();
    assert.deepEqual(outcomes, ["ACTIVATED", "REPLAY_ACK"]);
    assert.equal(Buffer.compare(Buffer.from(a.body), Buffer.from(b.body)), 0);
    assert.equal(await scalar(poolA, "SELECT count(*)::int FROM site_publication_log WHERE outcome = 'ACTIVATED'"), 1);
  });
}

test("verrou observé : la seconde activation attend le COMMIT de la première (hook qui retient la transaction 400 ms)", async () => {
  await resetDb();
  const c = loadCase("F_FULL_CORRUPT.activate_base");
  await prepare(c);
  const timeline = [];
  const slow = deps(poolA, { now: c.now, policy: c.policy, hooks: { beforeCommit: async () => { timeline.push("A:avant-commit"); await new Promise((r) => setTimeout(r, 400)); } } });
  const pa = ACTIVATE(slow, c).then((r) => { timeline.push("A:fin"); return r; });
  await new Promise((r) => setTimeout(r, 100));
  const pb = ACTIVATE(deps(poolB, { now: c.now, policy: c.policy }), c).then((r) => { timeline.push("B:fin"); return r; });
  const [a, b] = await Promise.all([pa, pb]);
  assert.deepEqual(timeline, ["A:avant-commit", "A:fin", "B:fin"]);
  assert.equal(a.headers["x-c0-outcome"], "ACTIVATED");
  assert.equal(b.headers["x-c0-outcome"], "REPLAY_ACK");
});

for (let round = 1; round <= 5; round += 1) {
  test(`F_FULL_CORRUPT.sequence_collision : s10 et s10' activés en parallèle (tour ${round}) -> une bascule, l'autre SEQUENCE_COLLISION`, async () => {
    await resetDb();
    const s10 = loadCase("F_FULL_CORRUPT.activate_base");
    const s10b = loadCase("F_FULL_CORRUPT.sequence_collision");
    assert.equal(s10.doc.catalogue_sequence, s10b.doc.catalogue_sequence);
    await prepare(s10);
    await prepare({ ...s10b, now: s10.now });
    const [a, b] = await Promise.all([
      ACTIVATE(deps(poolA, { now: s10b.now, policy: s10.policy }), s10),
      ACTIVATE(deps(poolB, { now: s10b.now, policy: s10.policy }), s10b),
    ]);
    const results = [outcomeOf(a), outcomeOf(b)].map((o) => `${o.outcome}:${o.error_codes.join(",")}`).sort();
    assert.deepEqual(results, ["ACTIVATED:", "REJECTED:SEQUENCE_COLLISION"]);
    assert.equal(await scalar(poolA, "SELECT count(*)::int FROM site_generation WHERE status = 'ACTIVE'"), 1);
    assert.equal(await scalar(poolA, "SELECT count(*)::int FROM site_generation WHERE status = 'REJECTED'"), 1);
  });
}
