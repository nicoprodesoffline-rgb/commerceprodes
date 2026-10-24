// Correctifs de la review indépendante BC2 (F-01 à F-04), sur PostgreSQL réel.
// Cas rejoués : F_FULL_CORRUPT.activate_base (s10), F_FULL_CORRUPT.legit_withdrawals_listed (s11),
// F_SIMPLE_READY.activate_first (s1) ; règles C0 inchangées (evaluatePublication).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { ACTIVATE, KEYRING_PATH, STAGE, VERIFY, activateBase, body, control, deps, headersFor, http, loadCase, newPool, outcomeOf, pointer, putAllMedia, receiver, resetDb, scalar, sitePool, testDatabaseUrl } from "./helpers.mjs";

let pool;
before(async () => { await resetDb(); pool = newPool(); });
after(async () => { await pool.end(); });

const logCount = () => scalar(pool, "SELECT count(*)::int FROM site_publication_log");

// --- F-02 : ACTIVE corrompue -> CATALOG_UNSAFE, aucune activation par-dessus --------------------------------
test("F-02 : ACTIVE s10 corrompue (propriétaire) -> ACTIVATE s11 et STAGE refusés CATALOG_UNSAFE, journalisés ; réparée -> activation", async () => {
  const { base } = await activateBase(pool);
  const c = loadCase("F_FULL_CORRUPT.legit_withdrawals_listed");
  const d = deps(pool, { now: c.now, policy: c.policy });
  await STAGE(d, c);
  await putAllMedia(d, c);
  await VERIFY(d, c);
  const ptr = await pointer(pool);
  const original = (await pool.query("SELECT snapshot_bytes FROM site_generation WHERE id = $1", [ptr.generation_id])).rows[0].snapshot_bytes;
  const tamper = async (bytes) => {
    await pool.query("ALTER TABLE site_generation DISABLE TRIGGER site_generation_immutable");
    try { await pool.query("UPDATE site_generation SET snapshot_bytes = $2 WHERE id = $1", [ptr.generation_id, bytes]); }
    finally { await pool.query("ALTER TABLE site_generation ENABLE TRIGGER site_generation_immutable"); }
  };
  // même longueur : STAGING_FIXTURE -> PRODUCTION n'a pas la même taille ; on altère un octet du nom d'une catégorie
  const altered = Buffer.from(original);
  const at = altered.indexOf(Buffer.from("STAGING_FIXTURE "));
  altered[at] = "X".charCodeAt(0);
  await tamper(altered);
  const r1 = await ACTIVATE(d, c);
  assert.equal(r1.status, 409);
  assert.deepEqual(outcomeOf(r1), { accepted: false, outcome: "REJECTED", error_codes: ["CATALOG_UNSAFE"] });
  assert.equal(body(r1).stage, "active_integrity");
  assert.equal(r1.headers["x-c0-outcome"], undefined);
  assert.deepEqual(await pointer(pool), ptr, "pointeur inchangé");
  assert.equal(await scalar(pool, "SELECT status FROM site_generation WHERE payload_sha256 = $1", [c.doc.payload_sha256]), "VERIFIED", "cible inchangée");
  const r2 = await STAGE(d, base); // même un renvoi de l'ACTIVE n'obtient pas d'ACK
  assert.deepEqual(body(r2).error_codes, ["CATALOG_UNSAFE"]);
  assert.equal(await scalar(pool, "SELECT count(*)::int FROM site_publication_log WHERE stage = 'active_integrity'"), 2);
  await tamper(original);
  const r3 = await ACTIVATE(d, c);
  assert.equal(r3.headers["x-c0-outcome"], "ACTIVATED");
});

test("F-02 : migration 005 — octets, SHA, identité et ACK posé d'une génération non modifiables", async () => {
  const id = (await pointer(pool)).generation_id;
  for (const sql of [
    "UPDATE site_generation SET snapshot_bytes = '\\x00'::bytea WHERE id = $1",
    "UPDATE site_generation SET payload_sha256 = repeat('0', 64) WHERE id = $1",
    "UPDATE site_generation SET publication_id = 'PUB-x' WHERE id = $1",
    "UPDATE site_generation SET ack_bytes = '\\x00'::bytea WHERE id = $1",
  ]) await assert.rejects(pool.query(sql, [id]), /immuable/, sql);
  await pool.query("UPDATE site_generation SET last_result = '{}'::jsonb WHERE id = $1", [id]); // statut/résultats restent modifiables
});

// --- F-03 : authentification avant tout verrou ; 401 avant 404 ------------------------------------------------
test("F-03 : ACTIVATE/VERIFY non signés -> 401 avant 404, sans verrou ni journal", async () => {
  await resetDb();
  await activateBase(pool);
  const c = loadCase("F_FULL_CORRUPT.legit_withdrawals_listed");
  const d = deps(pool, { now: c.now, policy: c.policy });
  await STAGE(d, c);
  const logs = await logCount();
  const unknown = jsonControl({ publication_id: "PUB-inconnue", catalogue_sequence: 99, payload_sha256: "0".repeat(64) });
  for (const op of [receiver.activate, receiver.verifyMedia]) {
    assert.equal((await op(d, unknown, headersFor({}))).status, 401, "génération inconnue, sans en-têtes : 401");
    assert.equal((await op(d, unknown, headersFor({ key_id: "c0-test-ack-01", signature: "a".repeat(64) }))).status, 401);
    assert.equal((await op(d, unknown, headersFor(c.transport))).status, 404, "clé valide, génération inconnue : 404");
  }
  // un verrou exclusif tenu sur le pointeur : un ACTIVATE à signature fausse répond 401 sans l'attendre
  const holder = await pool.connect();
  try {
    await holder.query("BEGIN");
    await holder.query("SELECT 1 FROM site_active_pointer WHERE singleton = 1 FOR UPDATE");
    const t0 = Date.now();
    const bad = await ACTIVATE(d, c, { key_id: c.transport.key_id, signature: "b".repeat(64) });
    assert.equal(bad.status, 401);
    assert.equal(body(bad).stage, "transport_gate");
    assert.ok(Date.now() - t0 < 1000, `répondu en ${Date.now() - t0} ms malgré le verrou`);
  } finally {
    await holder.query("ROLLBACK");
    holder.release();
  }
  assert.equal(await logCount(), logs, "aucune ligne de journal pour un refus non authentifié");
});

function jsonControl(o) {
  return Buffer.from(JSON.stringify(o), "utf8");
}

// --- F-04 : garde d'hôte ----------------------------------------------------------------------------------------
test("F-04 : SITE_DATABASE_URL — hôte local seulement, jamais jarvis, paramètres de cible refusés", () => {
  const ok = ["postgres://u:p@localhost:54318/prodes_site_bc2", "postgres://u:p@127.0.0.1:54318/prodes_site_bc2", "postgres://u:p@[::1]:54318/prodes_site_bc2"];
  for (const url of ok) assert.equal(sitePool.siteDatabaseName(url, {}), "prodes_site_bc2", url);
  const refused = [
    "postgres://u:p@jarvis:5432/prodes_site_prod",
    "postgres://u:p@jarvis.tail1234.ts.net:5432/prodes_site_prod",
    "postgres://u:p@localhost:54318/prodes_site_bc2?host=jarvis",
    "postgres://u:p@localhost:54318/prodes_site_bc2?hostaddr=10.0.0.1",
    "postgres://u:p@localhost:54318/prodes_site_bc2?options=-c%20search_path%3Dx",
    "postgres://u:p@localhost:54318/prodes_site_bc2?dbname=prodes_factory",
    "postgres://u:p@localhost:54318/prodes_site_bc2?database=prodes_factory",
    "postgres://u:p@db.example.com:5432/prodes_site_bc2",
    "postgres://u:p@localhost:54318/prodes_factory",
    "postgres:///prodes_site_bc2",
  ];
  for (const url of refused) assert.throws(() => sitePool.siteDatabaseName(url, {}), sitePool.SiteDbConfigError, url);
  // hôte distant explicitement autorisé ; jarvis jamais
  assert.equal(sitePool.siteDatabaseName("postgres://u:p@db.example.com:5432/prodes_site_bc2", { SITE_ALLOW_REMOTE_DB: "1" }), "prodes_site_bc2");
  assert.throws(() => sitePool.siteDatabaseName("postgres://u:p@jarvis:5432/prodes_site_prod", { SITE_ALLOW_REMOTE_DB: "1" }), sitePool.SiteDbConfigError);
  assert.throws(() => sitePool.siteDatabaseName("postgres://u:p@localhost:54318/prodes_site_bc2?host=jarvis", { SITE_ALLOW_REMOTE_DB: "1" }), sitePool.SiteDbConfigError);
});

// --- F-01 : porte de transport et lecture bornée (adaptateur HTTP, en processus) -------------------------------
function withEnv(fn) {
  const env = {
    SITE_ENV: "staging", SITE_KEYRING_PATH: KEYRING_PATH, SITE_ACK_KEY_ID: "c0-test-ack-01",
    SITE_WITHDRAWAL_HOLD_POLICY: '{"max_withdrawals_without_release":null,"released_expected_withdrawals_digest":null}',
    SITE_DATABASE_URL: testDatabaseUrl(),
  };
  const saved = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));
  Object.assign(process.env, env);
  return fn().finally(() => { for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });
}

/** Flux de `total` octets en blocs de 1 MiB ; compte les octets effectivement tirés par le serveur. */
function countingStream(total) {
  const state = { pulled: 0 };
  const chunk = new Uint8Array(1 << 20);
  const stream = new ReadableStream({
    pull(controller) {
      if (state.pulled >= total) { controller.close(); return; }
      const n = Math.min(chunk.length, total - state.pulled);
      state.pulled += n;
      controller.enqueue(chunk.subarray(0, n));
    },
  }, { highWaterMark: 0 });
  return { stream, state };
}

const MiB = 1 << 20;

test("F-01 : porte de transport — sans en-têtes ou clé hors scope -> 401 sans lire le corps ni journaliser", async () => {
  await resetDb();
  await withEnv(async () => {
    const logs = await logCount();
    for (const [route, max] of [["STAGE", receiver.MAX_BYTES], ["VERIFY_MEDIA", receiver.MAX_CONTROL_BYTES], ["ACTIVATE", receiver.MAX_CONTROL_BYTES], ["MEDIA_PUT", receiver.MAX_MEDIA_BYTES]]) {
      for (const h of [{}, { "x-c0-key-id": "c0-test-ack-01", "x-c0-signature": "a".repeat(64) }, { "x-c0-key-id": "c0-test-publish-02", "x-c0-signature": "zz" }]) {
        const { stream, state } = countingStream(100 * MiB);
        const req = new Request("http://local/x", { method: "POST", body: stream, duplex: "half", headers: h });
        let ran = false;
        const res = await http.handleWithBody(route, req, max, async () => { ran = true; throw new Error("non appelé"); });
        assert.equal(res.status, 401, route);
        assert.equal(ran, false);
        assert.ok(state.pulled <= MiB, `${route} : ${state.pulled} octets tirés`);
      }
    }
    assert.equal(await logCount(), logs);
  });
});

test("F-01 : lecture bornée — Content-Length au-delà -> 413 sans lecture ; flux sans longueur coupé à plafond + 1 bloc", async () => {
  await withEnv(async () => {
    const c = loadCase("F_SIMPLE_READY.activate_first");
    const signed = { "x-c0-key-id": c.transport.key_id, "x-c0-signature": c.transport.signature };
    const logs = await logCount();
    for (const [route, max] of [["STAGE", receiver.MAX_BYTES], ["VERIFY_MEDIA", receiver.MAX_CONTROL_BYTES], ["ACTIVATE", receiver.MAX_CONTROL_BYTES], ["MEDIA_PUT", receiver.MAX_MEDIA_BYTES]]) {
      // (a) Content-Length annoncé > plafond : refus immédiat, 0 octet tiré
      const a = countingStream(100 * MiB);
      const reqA = new Request("http://local/x", { method: "POST", body: a.stream, duplex: "half", headers: { ...signed, "content-length": String(100 * MiB) } });
      const resA = await http.handleWithBody(route, reqA, max, async () => { throw new Error("non appelé"); });
      assert.equal(resA.status, 413, route);
      assert.equal((await resA.json()).transport_error, "BODY_TOO_LARGE");
      assert.ok(a.state.pulled <= MiB, `${route} (a) : ${a.state.pulled} octets tirés`);
      // (b) flux sans longueur : lecture arrêtée dès le dépassement
      const b = countingStream(100 * MiB);
      const reqB = new Request("http://local/x", { method: "POST", body: b.stream, duplex: "half", headers: signed });
      const resB = await http.handleWithBody(route, reqB, max, async () => { throw new Error("non appelé"); });
      assert.equal(resB.status, 413, route);
      assert.ok(b.state.pulled <= max + 2 * MiB, `${route} (b) : ${b.state.pulled} octets tirés pour un plafond de ${max}`);
    }
    // (c) exactement au plafond : accepté et transmis tel quel au receiver
    const exact = countingStream(receiver.MAX_CONTROL_BYTES);
    const reqC = new Request("http://local/x", { method: "POST", body: exact.stream, duplex: "half", headers: signed });
    let got = -1;
    const resC = await http.handleWithBody("ACTIVATE", reqC, receiver.MAX_CONTROL_BYTES, async (_d, bodyBytes) => { got = bodyBytes.length; return { status: 200, headers: {}, body: new Uint8Array(0) }; });
    assert.equal(resC.status, 200);
    assert.equal(got, receiver.MAX_CONTROL_BYTES);
    assert.equal(await logCount(), logs, "aucune ligne de journal pour un 413");
  });
});
