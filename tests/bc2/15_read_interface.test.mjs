// Interface lib/site-db (lue par BC3/BC4) : readActiveForUpdate (FOR SHARE) retient une activation jusqu'au COMMIT
// de l'appelant ; getActiveGeneration détecte une ligne incohérente (UNSAFE, fail-closed).
// Cas rejoués : F_FULL_CORRUPT.activate_base (s10 ACTIVE) puis F_FULL_CORRUPT.legit_withdrawals_listed (bascule).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { ACTIVATE, STAGE, VERIFY, activateBase, deps, loadCase, newPool, putAllMedia, resetDb, siteDb } from "./helpers.mjs";

let pool;
let reader;
before(async () => { await resetDb(); pool = newPool(); reader = newPool(2); });
after(async () => { await pool.end(); await reader.end(); });

test("readActiveForUpdate : une transaction BC4 ouverte retient l'activation, qui bascule après son COMMIT", async () => {
  const { base } = await activateBase(pool);
  const c = loadCase("F_FULL_CORRUPT.legit_withdrawals_listed");
  const d = deps(pool, { now: c.now, policy: c.policy });
  await STAGE(d, c);
  await putAllMedia(d, c);
  await VERIFY(d, c);

  const client = await reader.connect();
  const timeline = [];
  try {
    await client.query("BEGIN");
    const seen = await siteDb.readActiveForUpdate(client);
    assert.equal(seen.payload_sha256, base.doc.payload_sha256);
    assert.equal(seen.status, "ACTIVE");
    const pending = ACTIVATE(d, c).then((r) => { timeline.push("activation:fin"); return r; });
    await new Promise((r) => setTimeout(r, 300));
    timeline.push("bc4:commit");
    const again = await siteDb.readActiveForUpdate(client);
    assert.equal(again.payload_sha256, base.doc.payload_sha256, "toujours la même ACTIVE dans la transaction BC4");
    await client.query("COMMIT");
    const res = await pending;
    assert.equal(res.headers["x-c0-outcome"], "ACTIVATED");
  } finally {
    client.release();
  }
  assert.deepEqual(timeline, ["bc4:commit", "activation:fin"]);
  assert.equal((await siteDb.getActiveGeneration(pool)).payload_sha256, c.doc.payload_sha256);
});

test("getActiveGeneration : écriture des octets ACTIVE refusée (migration 005) ; corruption par le propriétaire -> UNSAFE, snapshot null", async () => {
  const active = await siteDb.getActiveGeneration(pool);
  assert.equal(active.status, "ACTIVE");
  await assert.rejects(
    pool.query("UPDATE site_generation SET snapshot_bytes = snapshot_bytes || '\\x20'::bytea WHERE id = $1", [active.generation_id]),
    /immuables/,
  );
  // Le rôle propriétaire peut désactiver le déclencheur (dette F-09) : on simule ainsi une corruption hors receiver.
  await pool.query("ALTER TABLE site_generation DISABLE TRIGGER site_generation_immutable");
  try {
    await pool.query("UPDATE site_generation SET snapshot_bytes = snapshot_bytes || '\\x20'::bytea WHERE id = $1", [active.generation_id]);
  } finally {
    await pool.query("ALTER TABLE site_generation ENABLE TRIGGER site_generation_immutable");
  }
  const after = await siteDb.getActiveGeneration(pool);
  assert.equal(after.status, "UNSAFE");
  assert.equal(after.snapshot, null, "jamais un document non vérifié (F-05)");
  assert.equal(after.catalogue_sequence, active.catalogue_sequence);
});
