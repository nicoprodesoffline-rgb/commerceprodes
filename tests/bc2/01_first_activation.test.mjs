// Famille 1 — première activation. Cas rejoué : F_SIMPLE_READY.activate_first (VERDICTS : ACTIVATED).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { ACTIVATE, STAGE, VERIFY, body, deps, fixtureBytes, jsonc, loadCase, newPool, pointer, putAllMedia, resetDb, siteDb, statuses, testDatabaseUrl } from "./helpers.mjs";

let pool;
before(async () => { await resetDb(); pool = newPool(); });
after(async () => { await pool.end(); });

test("F_SIMPLE_READY.activate_first : STAGE -> MEDIA -> VERIFY -> ACTIVATE, ACK octet pour octet = ack_s1.json, pointeur durable", async () => {
  const c = loadCase("F_SIMPLE_READY.activate_first");
  assert.equal(c.verdict.outcome, "ACTIVATED");
  const d = deps(pool, { now: c.now, policy: c.policy });

  const staged = await STAGE(d, c);
  assert.equal(staged.status, 200);
  assert.equal(body(staged).outcome, "STAGED");
  assert.equal(staged.headers["x-c0-outcome"], undefined, "aucun ACK au STAGE");
  assert.deepEqual(await statuses(pool), [{ seq: 1, sha: c.doc.payload_sha256, status: "STAGED" }]);
  assert.equal((await pointer(pool)).generation_id, null, "rien d'actif après STAGE");

  // idempotence du STAGE
  const again = await STAGE(d, c);
  assert.equal(body(again).idempotent, true);
  assert.equal((await statuses(pool)).length, 1);

  const media = await putAllMedia(d, c);
  assert.deepEqual(media.map((r) => r.status), [201]);
  const verified = await VERIFY(d, c);
  assert.equal(verified.status, 200);
  assert.equal(body(verified).generation.status, "VERIFIED");

  const activated = await ACTIVATE(d, c);
  assert.equal(activated.status, 200);
  assert.equal(activated.headers["x-c0-outcome"], "ACTIVATED");
  const expectedFile = fixtureBytes("documents/F_SIMPLE_READY/ack_s1.json");
  // (a) octets canoniques de l'ACK = octets canoniques de ack_s1.json
  const expectedCanonical = jsonc.canonicalBytes(jsonc.parseBytes(expectedFile, 1 << 20));
  assert.equal(Buffer.compare(Buffer.from(activated.body), Buffer.from(expectedCanonical)), 0, "ACK canonique ≠ ack_s1.json");
  // (b) la forme de fichier de la fixture (indentation 2, clés triées, \n final) est reproduite à l'octet
  const pretty = Buffer.from(JSON.stringify(JSON.parse(Buffer.from(activated.body).toString("utf8")), null, 2) + "\n", "utf8");
  assert.equal(Buffer.compare(pretty, Buffer.from(expectedFile)), 0, "ACK ≠ fichier ack_s1.json octet pour octet");

  // Pointeur ACTIVE durable : relu par une NOUVELLE connexion, hors du pool du receiver.
  const fresh = new pg.Client({ connectionString: testDatabaseUrl() });
  await fresh.connect();
  try {
    const active = await siteDb.getActiveGeneration(fresh);
    assert.equal(active.status, "ACTIVE");
    assert.equal(active.catalogue_sequence, 1);
    assert.equal(active.payload_sha256, c.doc.payload_sha256);
    assert.equal(active.snapshot.publication_id, "PUB-F_SIMPLE_READY-s1");
    const { rows } = await fresh.query("SELECT ack_bytes FROM site_generation WHERE status = 'ACTIVE'");
    assert.equal(Buffer.compare(rows[0].ack_bytes, Buffer.from(expectedCanonical)), 0, "ACK stocké ≠ ACK renvoyé");
  } finally {
    await fresh.end();
  }
});
