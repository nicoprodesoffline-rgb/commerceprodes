// Re-review BC2 c5dc9d02 — F-02 (ACTIVE corrompue, migration 005), F-03 (ordre et verrous), connexions tuées.
import pg from "pg";
import { ACTIVATE, STAGE, VERIFY, activateBase, body, deps, headersFor, loadCase, newPool, pointer, putAllMedia, rec, receiver, resetDb, scalar, siteDb, sitePool, summary, testDatabaseUrl, control } from "./common.mjs";
const ok = (r) => r.headers["x-c0-outcome"];
const su = () => { const u = new URL(testDatabaseUrl()); u.username = "postgres"; u.password = ""; return u.toString(); };
async function superClient() { const c = new pg.Client({ connectionString: su() }); await c.connect(); return c; }
const tryq = async (pool, sql, p = []) => { try { await pool.query(sql, p); return "ACCEPTÉ"; } catch (e) { return `REFUSÉ ${e.message.slice(0, 70)}`; } };

// ---- F-02 : migration 005 + ACTIVE corrompue ----
{
  await resetDb();
  const pool = newPool();
  const { base } = await activateBase(pool);
  const id = await scalar(pool, "SELECT id FROM site_generation WHERE status='ACTIVE'");
  const w = [
    await tryq(pool, "UPDATE site_generation SET snapshot_bytes = snapshot_bytes || '\\x20'::bytea WHERE id=$1", [id]),
    await tryq(pool, "UPDATE site_generation SET payload_sha256 = repeat('0',64) WHERE id=$1", [id]),
    await tryq(pool, "UPDATE site_generation SET publication_id = 'PUB-X' WHERE id=$1", [id]),
    await tryq(pool, "UPDATE site_generation SET ack_bytes = NULL, ack_json = NULL WHERE id=$1", [id]),
    await tryq(pool, "UPDATE site_generation SET ack_json = '{}'::jsonb WHERE id=$1", [id]),
    await tryq(pool, "UPDATE site_generation SET transport_json = '{}'::jsonb WHERE id=$1", [id]),
    await tryq(pool, "UPDATE site_generation SET last_result = last_result WHERE id=$1", [id]),
  ];
  rec("RR-F02a", "migration 005 : octets/SHA/identité/ACK/transport refusés ; colonnes de statut modifiables", w.slice(0, 6).every((x) => x.startsWith("REFUSÉ")) && w[6] === "ACCEPTÉ", w);
  const s11 = loadCase("F_FULL_CORRUPT.legit_withdrawals_listed");
  const d = deps(pool, { now: s11.now, policy: s11.policy });
  await STAGE(d, s11); await putAllMedia(d, s11); await VERIFY(d, s11);
  // corruption simulée par le propriétaire (déclencheur désactivé), comme le builder ; puis réactivé
  await pool.query("ALTER TABLE site_generation DISABLE TRIGGER site_generation_immutable");
  await pool.query("UPDATE site_generation SET snapshot_bytes = convert_to(replace(convert_from(snapshot_bytes,'UTF8'), '\"STAGING_FIXTURE\"', '\"PRODUCTION\"'),'UTF8') WHERE id=$1", [id]);
  await pool.query("ALTER TABLE site_generation ENABLE TRIGGER site_generation_immutable");
  const g = await siteDb.getActiveGeneration(pool);
  const a = await ACTIVATE(d, s11);
  const st = await STAGE(d, s11);
  const s11st = await scalar(pool, "SELECT status FROM site_generation WHERE payload_sha256=$1", [s11.doc.payload_sha256]);
  rec("RR-F02b", "ACTIVE corrompue -> getActiveGeneration UNSAFE/snapshot null ; ACTIVATE s11 409 CATALOG_UNSAFE active_integrity ; s11 inchangée ; pointeur s10",
    g.status === "UNSAFE" && g.snapshot === null && a.status === 409 && body(a).error_codes[0] === "CATALOG_UNSAFE" && body(a).stage === "active_integrity" && s11st === "VERIFIED" && (await pointer(pool)).catalogue_sequence === "10",
    `get=${g.status}/${g.snapshot} ACTIVATE=${a.status} ${JSON.stringify(body(a).error_codes)} ${body(a).stage} ; STAGE=${st.status} ${JSON.stringify(body(st).error_codes ?? body(st).outcome)} ; s11=${s11st}`);
  // pointeur seul altéré (table non couverte par 005) : SHA du pointeur, puis re-pointage vers une génération non ACTIVE
  await resetDb();
  const pool2 = newPool();
  await activateBase(pool2);
  const d2 = deps(pool2, { now: s11.now, policy: s11.policy });
  await STAGE(d2, s11); await putAllMedia(d2, s11); await VERIFY(d2, s11);
  await pool2.query("UPDATE site_active_pointer SET payload_sha256 = $1", [s11.doc.payload_sha256]);
  const a2 = await ACTIVATE(d2, s11);
  await pool2.query("UPDATE site_active_pointer SET generation_id = (SELECT id FROM site_generation WHERE payload_sha256=$1), catalogue_sequence = 11, payload_sha256=$1", [s11.doc.payload_sha256]);
  const g2 = await siteDb.getActiveGeneration(pool2);
  const a3 = await ACTIVATE(d2, s11);
  rec("RR-F02c", "pointeur altéré (SHA ≠ ligne ; re-pointage direct vers une génération VERIFIED) -> UNSAFE, CATALOG_UNSAFE, aucune activation",
    body(a2).error_codes?.[0] === "CATALOG_UNSAFE" && g2.status === "UNSAFE" && body(a3).error_codes?.[0] === "CATALOG_UNSAFE" && (await scalar(pool2, "SELECT count(*)::int FROM site_generation WHERE status='ACTIVE'")) === 1,
    `sha_altéré -> ${a2.status} ${JSON.stringify(body(a2).error_codes)} ; re-pointé -> get=${g2.status} ACTIVATE=${a3.status} ${JSON.stringify(body(a3).error_codes)}`);
  await pool.end(); await pool2.end();
}

// ---- F-03 : ordre 401 clé -> 404 génération -> 401 signature ; aucun verrou avant signature ----
{
  await resetDb();
  const pool = newPool();
  const { base } = await activateBase(pool);
  const s11 = loadCase("F_FULL_CORRUPT.legit_withdrawals_listed");
  const d = deps(pool, { now: s11.now, policy: s11.policy });
  await STAGE(d, s11); await putAllMedia(d, s11); await VERIFY(d, s11);
  const unknown = new TextEncoder().encode(JSON.stringify({ publication_id: "PUB-NONE", catalogue_sequence: 99, payload_sha256: "0".repeat(64) }));
  const bad = { key_id: "c0-test-publish-02", signature: "ab".repeat(32) };
  const l0 = await scalar(pool, "SELECT count(*)::int FROM site_publication_log");
  const o = [];
  for (const op of ["activate", "verifyMedia"]) {
    o.push([op, "sans clé + inconnue", (await receiver[op](d, unknown, headersFor({}))).status]);
    o.push([op, "clé ACK + inconnue", (await receiver[op](d, unknown, headersFor({ key_id: "c0-test-ack-01", signature: "ab".repeat(32) }))).status]);
    o.push([op, "clé valide + inconnue", (await receiver[op](d, unknown, headersFor(bad))).status]);
    o.push([op, "clé valide + connue + HMAC faux", (await receiver[op](d, control(s11.doc), headersFor(bad))).status]);
  }
  const l1 = await scalar(pool, "SELECT count(*)::int FROM site_publication_log");
  const order = o.map((x) => x[2]).join(",") === "401,401,404,401,401,401,404,401";
  // verrou exclusif tenu sur le pointeur ET la cible : un ACTIVATE mal signé doit répondre sans attendre
  const holder = await pool.connect();
  await holder.query("BEGIN");
  await holder.query("SELECT 1 FROM site_active_pointer WHERE singleton=1 FOR UPDATE");
  await holder.query("SELECT 1 FROM site_generation WHERE payload_sha256=$1 FOR UPDATE", [s11.doc.payload_sha256]);
  let t = Date.now(); const rBad = await ACTIVATE(d, s11, bad); const dtBad = Date.now() - t;
  t = Date.now(); let goodDone = null; const pGood = ACTIVATE(d, s11).then((r) => { goodDone = Date.now() - t; return r; });
  await new Promise((r) => setTimeout(r, 1200));
  const goodBlocked = goodDone === null;
  await holder.query("ROLLBACK"); holder.release();
  const rGood = await pGood;
  rec("RR-F03", "ordre 401 clé -> 404 génération -> 401 HMAC (ACTIVATE et VERIFY), 0 ligne de journal ; HMAC faux répond sous verrou tenu, ACTIVATE valide attend",
    order && l1 === l0 && rBad.status === 401 && dtBad < 1000 && goodBlocked && ok(rGood) === "ACTIVATED",
    `${o.map((x) => `${x[0]}/${x[1]}=${x[2]}`).join(" ; ")} ; journal +${l1 - l0} ; HMAC faux sous verrou -> ${rBad.status} ${body(rBad).stage} en ${dtBad} ms ; valide bloqué 1.2 s=${goodBlocked} puis ${ok(rGood)}`);
  await pool.end();
}

// ---- Connexions tuées : withTransaction (BC4) et ACTIVATE en attente du verrou ----
{
  await resetDb();
  const pool = newPool(3);
  await activateBase(pool);
  const adm = await superClient();
  let uncaught = 0; const onU = () => { uncaught++; }; process.on("uncaughtException", onU);
  // (a) withTransaction : connexion tuée pendant fn (lecteur FOR SHARE + pg_sleep)
  let pidA = null;
  const pA = sitePool.withTransaction(pool, async (c) => { pidA = (await c.query("SELECT pg_backend_pid() p")).rows[0].p; await siteDb.readActiveForUpdate(c); await c.query("SELECT pg_sleep(10)"); return "fini"; }).then(() => "RÉSOLU", (e) => `REJETÉ ${e.code ?? e.message.slice(0, 40)}`);
  while (pidA === null) await new Promise((r) => setTimeout(r, 50));
  await new Promise((r) => setTimeout(r, 300));
  await adm.query("SELECT pg_terminate_backend($1)", [pidA]);
  const outA = await pA;
  const after = await sitePool.withTransaction(pool, async (c) => (await siteDb.readActiveForUpdate(c)).catalogue_sequence);
  // (b) withTransaction : connexion tuée pendant le COMMIT ? -> tuée pendant fn juste avant de retourner (déjà (a)) ; (c) ACTIVATE en attente du verrou
  const s11 = loadCase("F_FULL_CORRUPT.legit_withdrawals_listed");
  const d = deps(pool, { now: s11.now, policy: s11.policy });
  await STAGE(d, s11); await putAllMedia(d, s11); await VERIFY(d, s11);
  const holder = await pool.connect();
  await holder.query("BEGIN"); await holder.query("SELECT 1 FROM site_active_pointer WHERE singleton=1 FOR UPDATE");
  const pAct = ACTIVATE(d, s11);
  let waiter = null;
  for (let i = 0; i < 60 && waiter === null; i++) {
    await new Promise((r) => setTimeout(r, 100));
    const { rows } = await adm.query("SELECT pid FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query ILIKE '%site_active_pointer%FOR UPDATE%'");
    if (rows.length) waiter = rows[0].pid;
  }
  await adm.query("SELECT pg_terminate_backend($1)", [waiter]);
  const rAct = await pAct;
  await holder.query("ROLLBACK"); holder.release();
  const rAgain = await ACTIVATE(d, s11);
  process.off("uncaughtException", onU);
  rec("RR-CONN", "connexion tuée : withTransaction rejette, pool réutilisable ; ACTIVATE tué en attente du verrou -> 503 sans ACK ; 0 exception non capturée ; activation suivante OK",
    outA.startsWith("REJETÉ") && after === 10 && rAct.status === 503 && ok(rAct) === undefined && uncaught === 0 && ok(rAgain) === "ACTIVATED",
    `withTransaction=${outA} ; puis lecture=${after} ; ACTIVATE(victime ${waiter})=${rAct.status} ${body(rAct).transport_error} ; non capturées=${uncaught} ; suivant=${ok(rAgain)} ; journal=${JSON.stringify((await pool.query("SELECT detail FROM site_publication_log WHERE operation='ACTIVATE_ABORTED'")).rows)}`);
  await adm.end(); await pool.end();
}
summary("adv_fix");
