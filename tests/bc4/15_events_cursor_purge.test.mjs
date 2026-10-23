// W4 lot I — DF-0115 : purge / compaction des curseurs de poll et des nonces (migration 017, site_purge_event_cursors).
// Politique : curseur émis avant now() − rétention (défaut 168 h) supprimé SAUF le plus récent de chaque clé ; nonce dont
// issued_at est plus ancien que la rétention (défaut 24 h) supprimé ; rétention < 1 h refusée ; aucun événement touché.
// Un curseur purgé présenté ensuite → 400 CURSOR_INVALID ; un curseur vide sert toujours la tête du non-acquitté.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { DB_URL, ROOT, ack, activate, businessCase, events, newPool, poll, resetDb, scalar, submit } from "./helpers.mjs";

let pool;
const KEY = "c0-test-events-01";

before(async () => {
  await resetDb();
  pool = newPool();
  await activate(pool, "F_SELL_WINDOWS.activate");
  const c = businessCase("F_QUOTE_ORDER.order_valid");
  assert.equal((await submit(pool, c.kind, c.bytes, c.now)).body.outcome, "RECEIVED");
});
after(async () => { await pool.end(); });

async function oldCursor(keyId, hoursAgo, ids = []) {
  const cursor = `CUR-old-${keyId}-${hoursAgo}h-${Math.random().toString(16).slice(2, 10)}`.slice(0, 64);
  await pool.query("INSERT INTO site_event_cursor (cursor, credential_key_id, position, event_ids, issued_at) VALUES ($1, $2, 0, $3::text[], now() - make_interval(hours => $4))", [cursor, keyId, ids, hoursAgo]);
  return cursor;
}

async function oldNonce(keyId, hoursAgo) {
  const nonce = Math.random().toString(16).slice(2).padEnd(32, "0").slice(0, 32);
  await pool.query("INSERT INTO site_event_poll_nonce (credential_key_id, nonce, issued_at) VALUES ($1, $2, now() - make_interval(hours => $3))", [keyId, nonce, hoursAgo]);
  return nonce;
}

const cursorsOf = async (keyId) => (await pool.query("SELECT cursor FROM site_event_cursor WHERE credential_key_id = $1 ORDER BY issued_at, cursor", [keyId])).rows.map((r) => r.cursor);

test("garde : UPDATE / DELETE / TRUNCATE d'un curseur hors purge refusés", async () => {
  const c = await oldCursor(KEY, 1);
  await assert.rejects(pool.query("UPDATE site_event_cursor SET position = 1 WHERE cursor = $1", [c]), /immuable hors purge/);
  await assert.rejects(pool.query("DELETE FROM site_event_cursor WHERE cursor = $1", [c]), /immuable hors purge/);
  await assert.rejects(pool.query("TRUNCATE site_event_cursor"), /immuable/);
  // Le paramètre de purge ne s'active pas hors de la fonction : il est local à SA transaction.
  await assert.rejects(pool.query("DELETE FROM site_event_cursor WHERE cursor = $1", [c]), /immuable hors purge/);
});

test("rétention < 1 h refusée par la fonction SQL et par purgeEventCursors", async () => {
  await assert.rejects(pool.query("SELECT * FROM site_purge_event_cursors(interval '59 minutes', interval '24 hours')"), /inférieure à 1 heure/);
  await assert.rejects(pool.query("SELECT * FROM site_purge_event_cursors(interval '168 hours', interval '30 minutes')"), /inférieure à 1 heure/);
  await assert.rejects(events.purgeEventCursors(pool, { cursorRetentionHours: 0 }), RangeError);
});

test("purge : anciens curseurs supprimés sauf le dernier de chaque clé ; simulation sans effet ; récents et événements intacts", async () => {
  const live = await poll(pool, { cursor: null, limit: 10 });
  assert.equal(live.status, 200);
  const recent = live.body.next_cursor;
  const a1 = await oldCursor(KEY, 400);
  const a2 = await oldCursor(KEY, 200);
  const lone = await oldCursor("c0-test-events-09", 500); // clé dont le SEUL curseur est ancien : gardé
  const lone2 = await oldCursor("c0-test-events-09", 900);
  const n1 = await oldNonce(KEY, 48);
  const n2 = await oldNonce(KEY, 2);
  const outbox = (await pool.query("SELECT event_id, status, delivery_count FROM site_outbox_event ORDER BY id")).rows;

  const dry = await events.purgeEventCursors(pool, { dryRun: true });
  assert.equal(dry.cursors_deleted, 3); // a1, a2, lone2 (le 1 h du test précédent est récent)
  assert.equal(dry.nonces_deleted, 1);
  assert.ok((await cursorsOf(KEY)).includes(a1), "simulation : rien supprimé");

  const done = await events.purgeEventCursors(pool);
  assert.deepEqual([done.cursors_deleted, done.nonces_deleted], [3, 1]);
  const kept = await cursorsOf(KEY);
  assert.ok(!kept.includes(a1) && !kept.includes(a2) && kept.includes(recent));
  assert.deepEqual(await cursorsOf("c0-test-events-09"), [lone]);
  assert.equal(await scalar(pool, "SELECT count(*)::int FROM site_event_poll_nonce WHERE nonce = $1", [n1]), 0);
  assert.equal(await scalar(pool, "SELECT count(*)::int FROM site_event_poll_nonce WHERE nonce = $1", [n2]), 1);
  assert.deepEqual((await pool.query("SELECT event_id, status, delivery_count FROM site_outbox_event ORDER BY id")).rows, outbox, "aucun événement touché");
  // Rejouée : idempotente.
  assert.deepEqual([(await events.purgeEventCursors(pool)).cursors_deleted, (await events.purgeEventCursors(pool)).nonces_deleted], [0, 0]);
});

test("curseur purgé présenté au poll → 400 CURSOR_INVALID ; ACK par ce curseur → 400 ; curseur vide → re-sert la tête non acquittée ; ACK par event_ids OK", async () => {
  const ids = (await pool.query("SELECT event_id FROM site_outbox_event WHERE status <> 'ACKED' ORDER BY id")).rows.map((r) => r.event_id);
  const purged = await oldCursor(KEY, 300, ids);
  await poll(pool, { cursor: null, limit: 10 }); // un curseur plus récent existe pour la clé
  assert.equal((await events.purgeEventCursors(pool)).cursors_deleted >= 1, true);
  const r = await poll(pool, { cursor: purged, limit: 10 });
  assert.equal(r.status, 400);
  assert.deepEqual(r.body.error_codes, ["CURSOR_INVALID"]);
  assert.equal((await ack(pool, { cursor: purged })).status, 400);
  const head = await poll(pool, { cursor: null, limit: 10 });
  assert.deepEqual(head.body.events.map((e) => e.event_id), ids);
  const a = await ack(pool, { event_ids: ids });
  assert.deepEqual(a.body.acked, ids);
});

test("script scripts/db/purge-event-cursors.mjs : simulation puis purge, une ligne JSON ; arguments invalides refusés (code 2)", async () => {
  await oldCursor(KEY, 1000);
  const script = join(ROOT, "scripts/db/purge-event-cursors.mjs");
  const env = { ...process.env, SITE_DATABASE_URL: DB_URL() };
  const dry = JSON.parse(execFileSync(process.execPath, [script, "--dry-run"], { env }).toString());
  assert.equal(dry.outcome, "PURGE_DRY_RUN");
  assert.equal(dry.cursors_deleted, 1);
  const done = JSON.parse(execFileSync(process.execPath, [script, "--cursor-retention-hours", "168", "--nonce-retention-hours", "24"], { env }).toString());
  assert.equal(done.outcome, "PURGED");
  assert.equal(done.cursors_deleted, 1);
  for (const args of [["--cursor-retention-hours", "0"], ["--nonce-retention-hours", "x"], ["--unknown"]]) {
    assert.throws(() => execFileSync(process.execPath, [script, ...args], { env, stdio: "pipe" }), (e) => e.status === 2, args.join(" "));
  }
  const factoryDb = DB_URL().replace(/\/[^/]+$/, "/prodes_factory");
  assert.throws(() => execFileSync(process.execPath, [script, "--dry-run"], { env: { ...env, SITE_DATABASE_URL: factoryDb }, stdio: "pipe" }), (e) => e.status === 2, "jamais une base Factory");
});
