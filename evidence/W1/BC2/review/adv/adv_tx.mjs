// Reviewer BC2 — attaques transactionnelles et média (in-process, PostgreSQL réel prodes_site_rv_bc2_test).
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { ACTIVATE, KEYRING, STAGE, VERIFY, activateBase, activation, body, control, deps, derive, fixtureBytes, fullFlow, headersFor, jsonc, loadCase, mediaHeaders, newPool, outcomeOf, pointer, putAllMedia, rec, receiver, resetDb, scalar, signing, siteDb, statuses, summary, config, sitePool } from "./common.mjs";

const ok = (r) => r.headers["x-c0-outcome"];
const txt = (r) => Buffer.from(r.body).toString("utf8");

// ---------- R01 : échec du COMMIT lui-même (contrainte différée violée au COMMIT) ----------
{
  await resetDb();
  const pool = newPool();
  const { base } = await activateBase(pool);
  await pool.query(`CREATE FUNCTION rv_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'rv: echec injecte au COMMIT'; END $$`);
  await pool.query(`CREATE CONSTRAINT TRIGGER rv_fail_at_commit AFTER UPDATE ON site_active_pointer DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION rv_fail()`);
  const legit = loadCase("F_FULL_CORRUPT.legit_withdrawals_listed");
  const before = await pointer(pool);
  const flow = await fullFlow(pool, legit);
  const st = await scalar(pool, "SELECT status FROM site_generation WHERE payload_sha256=$1", [legit.doc.payload_sha256]);
  const ackStored = await scalar(pool, "SELECT ack_bytes IS NOT NULL FROM site_generation WHERE payload_sha256=$1", [legit.doc.payload_sha256]);
  const logs = (await pool.query("SELECT operation, outcome, detail FROM site_publication_log WHERE catalogue_sequence=11 AND operation LIKE 'ACTIVATE%' ORDER BY id")).rows;
  rec("R01a", "COMMIT échoue (contrainte différée) -> 503 sans ACK, pointeur inchangé, s11 non ACTIVE, aucun ack stocké",
    flow.activated.status === 503 && ok(flow.activated) === undefined && JSON.stringify(await pointer(pool)) === JSON.stringify(before) && st === "VERIFIED" && ackStored === false,
    `${flow.activated.status} ${txt(flow.activated)} ptr_seq=${(await pointer(pool)).catalogue_sequence} s11=${st} ack=${ackStored} logs=${JSON.stringify(logs)}`);
  await pool.query("DROP TRIGGER rv_fail_at_commit ON site_active_pointer");
  const again = await ACTIVATE(flow.d, legit);
  const actives = await scalar(pool, "SELECT count(*)::int FROM site_generation WHERE status='ACTIVE'");
  rec("R01b", "reprise après échec du COMMIT -> ACTIVATED, une seule ACTIVE", ok(again) === "ACTIVATED" && actives === 1, `${ok(again)} actives=${actives}`);
  await pool.end();
}

// ---------- R02 : crash RÉEL du processus Node entre COMMIT et réponse (SIGKILL) ----------
{
  await resetDb();
  const pool = newPool();
  await activateBase(pool);
  const legit = loadCase("F_FULL_CORRUPT.legit_withdrawals_listed");
  const d = deps(pool, { now: legit.now, policy: legit.policy });
  await STAGE(d, legit); await putAllMedia(d, legit); await VERIFY(d, legit);
  const rowsBefore = await scalar(pool, "SELECT count(*)::int FROM site_generation");
  const child = spawnSync(process.execPath, [fileURLToPath(new URL("./crash_child.mjs", import.meta.url))], { env: process.env, encoding: "utf8" });
  const ptr = await pointer(pool);
  const stored = (await pool.query("SELECT ack_bytes FROM site_generation WHERE payload_sha256=$1", [legit.doc.payload_sha256])).rows[0].ack_bytes;
  rec("R02a", "processus tué (SIGKILL) juste après le COMMIT, avant réponse -> bascule durable s11, ACK stocké",
    child.signal === "SIGKILL" && ptr.catalogue_sequence === "11" && stored !== null, `signal=${child.signal} stdout=${child.stdout.trim()} ptr=${ptr.catalogue_sequence} ack_stored=${stored !== null}`);
  const pool2 = newPool(); // « nouveau processus »
  const replay = await ACTIVATE(deps(pool2, { policy: legit.policy }), legit); // horloge serveur réelle
  const same = Buffer.compare(Buffer.from(replay.body), stored) === 0;
  const v = activation.verifyAck(JSON.parse(txt(replay)), KEYRING, legit.doc);
  rec("R02b", "rejeu après crash -> REPLAY_ACK, octets = ack_bytes stockés, ACK_VALID, 0 ligne de plus",
    ok(replay) === "REPLAY_ACK" && same && v.outcome === "ACK_VALID" && (await scalar(pool, "SELECT count(*)::int FROM site_generation")) === rowsBefore,
    `${ok(replay)} same=${same} ${v.outcome}`);
  await pool2.end(); await pool.end();
}

// ---------- R03 : activations concurrentes N et N+1 ----------
async function concurrentRound(variant, order) {
  await resetDb();
  const pool = newPool();
  const { base } = await activateBase(pool);
  const s11 = loadCase("F_FULL_CORRUPT.legit_withdrawals_listed");
  const s12 = derive(s11, { seq: 12, prevDoc: variant === "chain" ? s11.doc : base.doc, pub: "PUB-RV-s12" });
  const d = deps(pool, { now: s11.now, policy: s11.policy });
  for (const c of [s11, s12]) { await STAGE(d, c); await putAllMedia(d, c); await VERIFY(d, c); }
  const pA = newPool(2), pB = newPool(2);
  const dA = deps(pA, { now: s11.now, policy: s11.policy }), dB = deps(pB, { now: s11.now, policy: s11.policy });
  const calls = order === "11first" ? [ACTIVATE(dA, s11), ACTIVATE(dB, s12)] : [ACTIVATE(dB, s12), ACTIVATE(dA, s11)];
  const res = await Promise.all(calls);
  const [r11, r12] = order === "11first" ? res : [res[1], res[0]];
  const desc = (r) => ok(r) ?? `${body(r).outcome}:${body(r).error_codes.join(",")}${body(r).hold_reason ? "/" + body(r).hold_reason : ""}`;
  const st = await statuses(pool);
  const actives = st.filter((s) => s.status === "ACTIVE");
  const ptr = await pointer(pool);
  await pA.end(); await pB.end(); await pool.end();
  return { r11: desc(r11), r12: desc(r12), actives: actives.map((a) => a.seq), ptr: ptr.catalogue_sequence, st: st.map((s) => `${s.seq}:${s.status}`).join(" ") };
}
for (const variant of ["chain", "sibling"]) {
  const seen = new Set();
  let allOk = true;
  for (let i = 0; i < 6; i++) {
    const r = await concurrentRound(variant, i % 2 === 0 ? "11first" : "12first");
    seen.add(`${r.r11} | ${r.r12} -> ptr=${r.ptr} [${r.st}]`);
    const one = r.actives.length === 1 && String(r.actives[0]) === r.ptr;
    let legal;
    if (variant === "chain") legal = (r.r11 === "ACTIVATED" && (r.r12 === "ACTIVATED" || r.r12 === "STAGE_HOLD:STAGE_HOLD/BASE_MISMATCH"));
    else legal = (r.r11 === "ACTIVATED" && r.r12 === "STAGE_HOLD:STAGE_HOLD/BASE_MISMATCH") || (r.r12 === "ACTIVATED" && r.r11 === "REJECTED:STALE_SEQUENCE");
    allOk = allOk && one && legal;
  }
  rec(`R03-${variant}`, `ACTIVATE concurrents s11 et s12 (${variant === "chain" ? "s12 basée sur s11" : "s11 et s12 basées sur s10"}), 6 tours -> une ACTIVE, issues légales`, allOk, Array.from(seen));
}

// ---------- R04 : ACTIVATE revérifie les OCTETS en base, jamais le drapeau VERIFIED ----------
{
  await resetDb();
  const pool = newPool();
  const c = loadCase("F_SIMPLE_READY.activate_first");
  const d = deps(pool, { now: c.now, policy: c.policy });
  await STAGE(d, c); await putAllMedia(d, c);
  const v = await VERIFY(d, c);
  const m = c.media[0];
  // octets altérés de même longueur (dernier octet inversé) après VERIFIED
  await pool.query("UPDATE site_media SET bytes = overlay(bytes placing decode(lpad(to_hex(255 - get_byte(bytes, length(bytes)-1)),2,'0'),'hex') from length(bytes) for 1) WHERE sha256=$1", [m.sha256]);
  const a1 = await ACTIVATE(d, c);
  const st1 = await scalar(pool, "SELECT status FROM site_generation WHERE payload_sha256=$1", [c.doc.payload_sha256]);
  rec("R04a", "VERIFIED puis octets média altérés en base (même taille) -> ACTIVATE MEDIA_HASH_MISMATCH, retour STAGED, pas d'ACK",
    body(v).generation.status === "VERIFIED" && ok(a1) === undefined && body(a1).error_codes[0] === "MEDIA_HASH_MISMATCH" && st1 === "STAGED", `${a1.status} ${JSON.stringify(body(a1).error_codes)} status=${st1}`);
  // ligne média supprimée
  await pool.query("DELETE FROM site_media WHERE sha256=$1", [m.sha256]);
  const a2 = await ACTIVATE(d, c);
  rec("R04b", "ligne média supprimée -> ACTIVATE MEDIA_MISSING", body(a2).error_codes[0] === "MEDIA_MISSING", `${a2.status} ${JSON.stringify(body(a2).error_codes)}`);
  // PUT correct sans nouveau VERIFY -> ACTIVATE réussit (décision 2 du builder)
  await putAllMedia(d, c);
  const a3 = await ACTIVATE(d, c);
  rec("R04c", "STAGED + octets conformes, sans VERIFY_MEDIA -> ACTIVATED (étape media rejouée sous verrou)", ok(a3) === "ACTIVATED", `${ok(a3)} verified_at=${await scalar(pool, "SELECT verified_at IS NOT NULL FROM site_generation WHERE payload_sha256=$1", [c.doc.payload_sha256])}`);
  // altération APRÈS activation : getActiveGeneration ne le voit pas
  await pool.query("UPDATE site_media SET bytes = overlay(bytes placing '\\x00'::bytea from length(bytes) for 1) WHERE sha256=$1", [m.sha256]);
  const g = await siteDb.getActiveGeneration(pool);
  rec("R04d", "média ACTIVE altéré en base après activation -> getActiveGeneration.status (NOTE : UNSAFE ne couvre que le snapshot)", true, `status=${g.status}`);
  await pool.end();
}

// ---------- R05 : PUT média (STAGING_TRANSPORT) ----------
{
  await resetDb();
  const pool = newPool();
  const c = loadCase("F_SIMPLE_READY.activate_first");
  const d = deps(pool, { now: c.now, policy: c.policy });
  const m = c.media[0];
  const other = fixtureBytes("media/full_family_1.png");
  const otherSha = jsonc.sha256Hex(other);
  const put = (sha, bytes, h, ct = "image/png") => receiver.putMedia(d, sha, bytes, h, ct);
  const res = [];
  let r = await put(m.sha256, new Uint8Array(0), mediaHeaders(m.sha256, 0)); res.push(["taille 0 signée", r.status, txt(r)]);
  const big = new Uint8Array(20 * 1024 * 1024 + 1); const bigSha = jsonc.sha256Hex(big);
  r = await put(bigSha, big, mediaHeaders(bigSha, big.length)); res.push(["20 MiB + 1 signé", r.status, body(r).transport_error]);
  const edge = new Uint8Array(20 * 1024 * 1024); edge.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); const edgeSha = jsonc.sha256Hex(edge);
  r = await put(edgeSha, edge, mediaHeaders(edgeSha, edge.length)); res.push(["20 MiB exact signé", r.status, body(r).outcome]);
  r = await put(m.sha256, other, mediaHeaders(m.sha256, other.length)); res.push(["sha chemin ≠ octets (signé)", r.status, body(r).error_codes]);
  r = await put(m.sha256.toUpperCase(), m.bytes, mediaHeaders(m.sha256, m.bytes.length)); res.push(["sha en majuscules", r.status, body(r).transport_error]);
  const sigA = mediaHeaders(m.sha256, m.bytes.length);
  r = await put(otherSha, other, sigA); res.push(["signature de A rejouée pour B", r.status, body(r).error_codes]);
  r = await put(m.sha256, m.bytes, mediaHeaders(m.sha256, m.bytes.length + 1)); res.push(["signature sur une autre taille", r.status, body(r).error_codes]);
  const ackSig = signing.sign(KEYRING, "c0-test-ack-01", signing.SCOPE_ACK, receiver.MEDIA_TRANSPORT_DOMAIN, { sha256: m.sha256, size: m.bytes.length });
  r = await put(m.sha256, m.bytes, headersFor({ key_id: "c0-test-ack-01", signature: ackSig })); res.push(["clé activation_ack (hors scope)", r.status, body(r).error_codes]);
  const snapSig = signing.sign(KEYRING, "c0-test-publish-02", signing.SCOPE_PUBLISH, signing.DOMAIN_SIG_SNAPSHOT, { sha256: m.sha256, size: m.bytes.length });
  r = await put(m.sha256, m.bytes, headersFor({ key_id: "c0-test-publish-02", signature: snapSig })); res.push(["signature du domaine snapshot (séparation de domaine)", r.status, body(r).error_codes]);
  r = await put(m.sha256, m.bytes, sigA); res.push(["PUT correct", r.status, body(r).outcome]);
  r = await put(m.sha256, m.bytes, sigA); res.push(["même signature rejouée (mêmes octets)", r.status, body(r).outcome]);
  // SVG sous Content-Type image/png : stocké (indication), refusé à VERIFY par la signature binaire déclarée
  const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'); const svgSha = jsonc.sha256Hex(svg);
  r = await put(svgSha, svg, mediaHeaders(svgSha, svg.length), "image/png"); res.push(["SVG déclaré image/png au PUT", r.status, body(r).outcome]);
  const mimeRow = await scalar(pool, "SELECT mime FROM site_media WHERE sha256=$1", [svgSha]);
  const ok05 = res[0][1] === 413 && res[1][1] === 413 && res[2][1] === 201 && res[3][1] === 422 && res[4][1] === 400 && res[5][1] === 401 && res[6][1] === 401 && res[7][1] === 401 && res[8][1] === 401 && res[9][1] === 201 && res[10][1] === 200;
  rec("R05", "PUT média : bornes, hash, scopes, séparation de domaine, rejeu idempotent", ok05, res.map((x) => `${x[0]} -> ${x[1]} ${JSON.stringify(x[2])}`).concat([`svg stocké mime=${mimeRow}`]));
  await pool.end();
}

// ---------- R06 : interface BC4 — verrou partagé, lock_timeout, UNSAFE ----------
{
  await resetDb();
  const pool = newPool();
  const { base } = await activateBase(pool);
  const legit = loadCase("F_FULL_CORRUPT.legit_withdrawals_listed");
  const d = deps(pool, { now: legit.now, policy: legit.policy });
  await STAGE(d, legit); await putAllMedia(d, legit); await VERIFY(d, legit);
  const holder = await pool.connect();
  await holder.query("BEGIN");
  const seen = await siteDb.readActiveForUpdate(holder);
  const t0 = Date.now();
  let doneAt = null;
  const p = ACTIVATE(d, legit).then((r) => { doneAt = Date.now(); return r; });
  await new Promise((res) => setTimeout(res, 1500));
  const blocked = doneAt === null;
  await holder.query("COMMIT"); holder.release();
  const r = await p;
  rec("R06a", "readActiveForUpdate (FOR SHARE) retient l'ACTIVATE jusqu'au COMMIT de l'appelant", seen.catalogue_sequence === 10 && blocked && ok(r) === "ACTIVATED", `vu=s${seen.catalogue_sequence} bloqué_1.5s=${blocked} puis ${ok(r)} après ${doneAt - t0} ms`);

  // lock_timeout : un lecteur qui garde le verrou > 15 s
  await resetDb();
  const pool2 = newPool();
  await activateBase(pool2);
  const d2 = deps(pool2, { now: legit.now, policy: legit.policy });
  await STAGE(d2, legit); await putAllMedia(d2, legit); await VERIFY(d2, legit);
  const h2 = await pool2.connect();
  await h2.query("BEGIN"); await siteDb.readActiveForUpdate(h2);
  const t1 = Date.now();
  const r2 = await ACTIVATE(d2, legit);
  const dt = Date.now() - t1;
  await h2.query("ROLLBACK"); h2.release();
  const abort = (await pool2.query("SELECT detail FROM site_publication_log WHERE operation='ACTIVATE_ABORTED' ORDER BY id DESC LIMIT 1")).rows[0];
  rec("R06b", "verrou partagé tenu > 15 s -> ACTIVATE 503 ACTIVATION_ABORTED (lock_timeout), état inchangé",
    r2.status === 503 && (await pointer(pool2)).catalogue_sequence === "10", `${r2.status} ${body(r2).transport_error} après ${dt} ms ; journal=${JSON.stringify(abort)} ; ptr=s${(await pointer(pool2)).catalogue_sequence}`);

  // UNSAFE : octets du snapshot ACTIVE altérés (canonique conservé, contenu changé)
  const g0 = await siteDb.getActiveGeneration(pool2);
  await pool2.query("UPDATE site_generation SET snapshot_bytes = convert_to(replace(convert_from(snapshot_bytes,'UTF8'), '\"STAGING_FIXTURE\"', '\"PRODUCTION\"'),'UTF8') WHERE status='ACTIVE'");
  const g1 = await siteDb.getActiveGeneration(pool2);
  const after = await ACTIVATE(d2, legit);
  rec("R06c", "snapshot ACTIVE altéré en base -> UNSAFE ; activation suivante fail-closed",
    g0.status === "ACTIVE" && g1.status === "UNSAFE", `avant=${g0.status} après=${g1.status} snapshot_renvoyé=${g1.snapshot === null ? "null" : "document altéré (non null)"} ; ACTIVATE suivant=${after.status} ${ok(after) ?? JSON.stringify(body(after).error_codes)}`);
  await pool2.end(); await pool.end();
}

// ---------- R07 : configuration production ----------
{
  let e1 = null;
  try { config.loadReceiverConfig({ SITE_ENV: "production", SITE_KEYRING_PATH: new URL("../../../../../c0/fixtures/keys/test_keyring.json", import.meta.url).pathname, SITE_ACK_KEY_ID: "c0-test-ack-01", SITE_WITHDRAWAL_HOLD_POLICY: '{"max_withdrawals_without_release":null,"released_expected_withdrawals_digest":null}' }); } catch (e) { e1 = e.code; }
  let e2 = null;
  try { config.loadReceiverConfig({ SITE_ENV: "production", SITE_KEYRING_PATH: "/nonexistent", SITE_ACK_KEY_ID: "c0-test-ack-01", SITE_WITHDRAWAL_HOLD_POLICY: '{"max_withdrawals_without_release":5,"released_expected_withdrawals_digest":null}' }); } catch (e) { e2 = `${e.code} msg=${e.message}`; }
  let e3 = null;
  try { config.loadReceiverConfig({ SITE_ENV: "staging", SITE_KEYRING_PATH: new URL("../../../../../c0/fixtures/keys/test_keyring.json", import.meta.url).pathname, SITE_ACK_KEY_ID: "c0-test-publish-02", SITE_WITHDRAWAL_HOLD_POLICY: '{"max_withdrawals_without_release":null,"released_expected_withdrawals_digest":null}' }); } catch (e) { e3 = e.code; }
  await resetDb();
  const pool = newPool();
  const c = loadCase("F_SIMPLE_READY.activate_first");
  const dp = deps(pool, { now: c.now, env: "production", policy: { max_withdrawals_without_release: 5, released_expected_withdrawals_digest: null } });
  const s = await STAGE(dp, c);
  rec("R07", "production : politique null refusée ; trousseau illisible refusé sans chemin dans le message ; clé ACK hors scope refusée ; STAGING_FIXTURE refusé",
    e1 === "RECEIVER_CONFIG_INVALID" && e2?.startsWith("RECEIVER_CONFIG_INVALID") && !e2.includes("/nonexistent") && e3 === "RECEIVER_CONFIG_INVALID" && body(s).detail.rules[0] === "envelope.data_label_environment",
    `null_prod=${e1} ; keyring=${e2} ; ack_hors_scope=${e3} ; STAGE=${s.status} ${JSON.stringify(body(s).error_codes)} ${JSON.stringify(body(s).detail)} stage=${body(s).stage}`);
  await pool.end();
}
summary("adv_tx");
