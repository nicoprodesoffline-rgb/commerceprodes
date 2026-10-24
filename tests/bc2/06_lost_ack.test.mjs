// Famille 6 — perte d'ACK : la réponse d'ACTIVATE est perdue, l'émetteur rejoue ACTIVATE -> même ACK, aucun second effet.
// Cas rejoués : F_SIMPLE_READY.activate_first puis F_SIMPLE_READY.replay_after_lost_ack (REPLAY_ACK, instant 07:00).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { ACTIVATE, STAGE, deps, fullFlow, loadCase, newPool, pointer, resetDb, scalar } from "./helpers.mjs";

let pool;
before(async () => { await resetDb(); pool = newPool(); });
after(async () => { await pool.end(); });

test("F_SIMPLE_READY.replay_after_lost_ack : re-ACTIVATE -> REPLAY_ACK, ACK identique, 0 ligne de plus, journal explicite", async () => {
  const first = loadCase("F_SIMPLE_READY.activate_first");
  const flow = await fullFlow(pool, first);
  const lostAck = Buffer.from(flow.activated.body); // « perdue » côté émetteur : jamais lue par lui
  const counts = async () => ({
    generations: await scalar(pool, "SELECT count(*)::int FROM site_generation"),
    media: await scalar(pool, "SELECT count(*)::int FROM site_media"),
    active: await scalar(pool, "SELECT count(*)::int FROM site_generation WHERE status = 'ACTIVE'"),
    activatedLogs: await scalar(pool, "SELECT count(*)::int FROM site_publication_log WHERE outcome = 'ACTIVATED'"),
  });
  const before = await counts();
  const ptr = await pointer(pool);

  const c = loadCase("F_SIMPLE_READY.replay_after_lost_ack");
  assert.equal(c.verdict.outcome, "REPLAY_ACK");
  const d = deps(pool, { now: c.now, policy: c.policy }); // horloge plus tard (07:00) : l'ACK ne doit PAS changer
  const replay = await ACTIVATE(d, c);
  assert.equal(replay.status, 200);
  assert.equal(replay.headers["x-c0-outcome"], "REPLAY_ACK");
  assert.equal(Buffer.compare(Buffer.from(replay.body), lostAck), 0, "ACK rejoué ≠ ACK perdu");
  const restage = await STAGE(d, c); // un renvoi complet (STAGE) donne aussi le même ACK
  assert.equal(Buffer.compare(Buffer.from(restage.body), lostAck), 0);

  assert.deepEqual(await counts(), before, "aucun second effet");
  assert.deepEqual(await pointer(pool), ptr);
  const { rows } = await pool.query("SELECT operation, outcome, detail FROM site_publication_log WHERE outcome = 'REPLAY_ACK' ORDER BY id");
  assert.deepEqual(rows.map((r) => r.operation), ["ACTIVATE", "STAGE"]);
  assert.equal(rows[0].detail.second_effect, false);
});
