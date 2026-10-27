// Famille 7 — crash injecté entre les écritures et le COMMIT d'ACTIVATE -> rollback complet, ancienne génération
// servie, reprise sans doublon. Cas rejoués : F_FULL_CORRUPT.activate_base puis F_FULL_CORRUPT.legit_withdrawals_listed.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { ACTIVATE, STAGE, VERIFY, activateBase, body, deps, loadCase, newPool, pointer, putAllMedia, resetDb, scalar, siteDb } from "./helpers.mjs";

let pool;
let base;
before(async () => { await resetDb(); pool = newPool(); base = await activateBase(pool); });
after(async () => { await pool.end(); });

async function snapshotState() {
  return {
    pointer: await pointer(pool),
    rows: (await pool.query("SELECT id::int, status, ack_json IS NOT NULL AS has_ack, activated_at FROM site_generation ORDER BY id")).rows,
    activatedLogs: await scalar(pool, "SELECT count(*)::int FROM site_publication_log WHERE operation = 'ACTIVATE' AND outcome = 'ACTIVATED'"),
  };
}

test("F_FULL_CORRUPT.legit_withdrawals_listed : exception avant COMMIT puis connexion tuée avant COMMIT -> rollback ; reprise = une seule bascule", async () => {
  const c = loadCase("F_FULL_CORRUPT.legit_withdrawals_listed");
  const plain = deps(pool, { now: c.now, policy: c.policy });
  await STAGE(plain, c);
  await putAllMedia(plain, c);
  assert.equal(body(await VERIFY(plain, c)).generation.status, "VERIFIED");
  const stateBefore = await snapshotState();

  // (a) crash applicatif : exception levée après toutes les écritures, avant COMMIT
  let reached = 0;
  const throwing = deps(pool, { now: c.now, policy: c.policy, hooks: { beforeCommit: () => { reached += 1; throw new Error("crash injecté"); } } });
  const r1 = await ACTIVATE(throwing, c);
  assert.equal(reached, 1, "le hook a bien été atteint (écritures faites)");
  assert.equal(r1.status, 503);
  assert.equal(body(r1).transport_error, "ACTIVATION_ABORTED");
  assert.equal(r1.headers["x-c0-outcome"], undefined, "aucun ACK sans COMMIT");
  assert.deepEqual(await snapshotState(), stateBefore, "rollback complet");

  // (b) crash « processus » : la connexion PostgreSQL de la transaction est tuée par une autre connexion avant COMMIT
  const killer = deps(pool, { now: c.now, policy: c.policy, hooks: { beforeCommit: async ({ backendPid }) => {
    await pool.query("SELECT pg_terminate_backend($1)", [backendPid]);
  } } });
  const r2 = await ACTIVATE(killer, c);
  assert.equal(r2.status, 503);
  assert.equal(r2.headers["x-c0-outcome"], undefined);
  assert.deepEqual(await snapshotState(), stateBefore, "rollback complet après perte de connexion");
  const active = await siteDb.getActiveGeneration(pool);
  assert.equal(active.payload_sha256, base.base.doc.payload_sha256, "l'ancienne génération est toujours servie");
  const aborted = await scalar(pool, "SELECT count(*)::int FROM site_publication_log WHERE operation = 'ACTIVATE_ABORTED'");
  assert.equal(aborted, 2, "deux abandons journalisés");

  // reprise
  const r3 = await ACTIVATE(plain, c);
  assert.equal(r3.headers["x-c0-outcome"], "ACTIVATED");
  const after = await snapshotState();
  assert.equal(after.rows.length, stateBefore.rows.length, "aucune ligne en double");
  assert.equal(after.rows.filter((r) => r.status === "ACTIVE").length, 1);
  assert.equal(after.activatedLogs, stateBefore.activatedLogs + 1);
  assert.equal(after.pointer.payload_sha256, c.doc.payload_sha256);
});
