// Connexion PostgreSQL coupée en pleine transaction (constat BC4) : 503 propre, aucun ACK, aucune exception non
// capturée, le processus et la route suivante continuent. Cas rejoués : F_FULL_CORRUPT.activate_base (s10 ACTIVE),
// F_FULL_CORRUPT.legit_withdrawals_listed (s11). Le cas « hook avant COMMIT » est déjà couvert par la famille 7.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { ACTIVATE, STAGE, VERIFY, activateBase, body, deps, loadCase, newPool, pointer, putAllMedia, resetDb, scalar, sitePool } from "./helpers.mjs";

let pool;
let killer;
let uncaught = 0;
const onUncaught = () => { uncaught += 1; };
before(async () => {
  process.on("uncaughtException", onUncaught);
  await resetDb();
  pool = newPool();
  killer = newPool(2);
});
after(async () => {
  process.removeListener("uncaughtException", onUncaught);
  await pool.end();
  await killer.end();
});

async function waitForLockWaiter() {
  for (let i = 0; i < 100; i += 1) {
    const { rows } = await killer.query(
      "SELECT pid FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND pid <> pg_backend_pid()",
    );
    if (rows.length === 1) return rows[0].pid;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error("aucune transaction en attente de verrou");
}

test("ACTIVATE : connexion tuée pendant l'attente du verrou du pointeur -> 503 ACTIVATION_ABORTED, pas d'ACK, processus vivant, activation suivante OK", async () => {
  await activateBase(pool);
  const c = loadCase("F_FULL_CORRUPT.legit_withdrawals_listed");
  const d = deps(pool, { now: c.now, policy: c.policy });
  await STAGE(d, c);
  await putAllMedia(d, c);
  await VERIFY(d, c);
  const ptr = await pointer(pool);

  const holder = await killer.connect();
  let res;
  try {
    await holder.query("BEGIN");
    await holder.query("SELECT 1 FROM site_active_pointer WHERE singleton = 1 FOR SHARE");
    const pending = ACTIVATE(d, c);
    const pid = await waitForLockWaiter(); // la transaction d'ACTIVATE, bloquée sur FOR UPDATE
    await killer.query("SELECT pg_terminate_backend($1)", [pid]);
    res = await pending;
  } finally {
    await holder.query("ROLLBACK");
    holder.release();
  }
  assert.equal(res.status, 503);
  assert.equal(body(res).transport_error, "ACTIVATION_ABORTED");
  assert.equal(res.headers["x-c0-outcome"], undefined, "aucun ACK");
  await new Promise((r) => setTimeout(r, 200)); // laisse passer d'éventuels événements `error` tardifs
  assert.equal(uncaught, 0, "aucune exception non capturée");
  assert.deepEqual(await pointer(pool), ptr, "pointeur inchangé");
  assert.equal(await scalar(pool, "SELECT status FROM site_generation WHERE payload_sha256 = $1", [c.doc.payload_sha256]), "VERIFIED");
  assert.equal(await scalar(pool, "SELECT detail->>'reason' FROM site_publication_log WHERE operation = 'ACTIVATE_ABORTED' ORDER BY id DESC LIMIT 1"), "57P01");
  // la route suivante, sur le même pool, fonctionne
  const next = await ACTIVATE(d, c);
  assert.equal(next.headers["x-c0-outcome"], "ACTIVATED");
  assert.equal(uncaught, 0);
});

test("withTransaction (lib/site-db, utilisé par BC4) : connexion tuée -> rejet propre, aucune exception non capturée, pool réutilisable", async () => {
  await assert.rejects(
    sitePool.withTransaction(pool, async (client) => {
      const { rows } = await client.query("SELECT pg_backend_pid() AS pid");
      await killer.query("SELECT pg_terminate_backend($1)", [rows[0].pid]);
      await client.query("SELECT 1");
    }),
  );
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(uncaught, 0, "aucune exception non capturée");
  assert.equal(await scalar(pool, "SELECT 1 AS one"), 1, "le pool sert encore");
  const out = await sitePool.withTransaction(pool, async (client) => (await client.query("SELECT 2 AS two")).rows[0].two);
  assert.equal(out, 2);
});
