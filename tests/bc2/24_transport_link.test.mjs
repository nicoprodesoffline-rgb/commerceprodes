// Cercle 4, lot T (4.2 à 4.5) — transport de la liaison côté SITE, sur PostgreSQL réel (docs/contracts/c0_transport_v1.md).
// Anti-rejeu daté (L15, L16, nonces gardés en base), clé inconnue (L10), deux clés actives (L09), réponses signées (4.5),
// sonde (S03, L17, L25), médias manquants (4.3), générateur de trousseau (4.2). Tout est fictif.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { KEYRING, KEYRING_PATH, ROOT, activateBase, config, datedHeaders, gate, http, link, loadCase, newPool, putAllMedia, deps, resetDb, signing, testDatabaseUrl } from "./helpers.mjs";
import { main as keyringMain, makeKeyring } from "../../scripts/keyring-create.mjs";

let pool;
before(async () => { await resetDb(); pool = newPool(); });
after(async () => { await pool.end(); });

const PUBLISH = "c0-test-publish-02";
const PROBE = "/api/site/link/probe";

function withEnv(fn, extra = {}) {
  const env = {
    SITE_ENV: "staging", SITE_KEYRING_PATH: KEYRING_PATH, SITE_ACK_KEY_ID: "c0-test-ack-01",
    SITE_WITHDRAWAL_HOLD_POLICY: '{"max_withdrawals_without_release":null,"released_expected_withdrawals_digest":null}',
    SITE_DATABASE_URL: testDatabaseUrl(), SITE_COMMIT: "abc1234", ...extra,
  };
  const saved = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));
  Object.assign(process.env, env);
  return fn().finally(() => { for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });
}

async function probe(headers) {
  const request = new Request(`http://local${PROBE}`, { method: "GET", headers });
  const response = await http.handleTransport("LINK_PROBE", request, 0, (d, _b, stale) =>
    link.probe(d.pool, request.headers.get("x-c0-key-id"), request.headers.get("x-c0-nonce"), stale), { answerStale: true });
  const bytes = new Uint8Array(await response.arrayBuffer());
  return { status: response.status, headers: response.headers, bytes, json: JSON.parse(Buffer.from(bytes).toString("utf8")) };
}

async function missing(body, headers) {
  const request = new Request("http://local/api/site/publish/media/missing", { method: "POST", body, headers });
  const response = await http.handleTransport("MEDIA_MISSING", request, link.MAX_MISSING_BYTES, (d, b) => link.missingMedia(d.pool, b));
  return { status: response.status, json: await response.json(), headers: response.headers };
}

const responseSigned = (r, nonce, keyring = KEYRING) =>
  signing.verify(keyring, r.headers.get("x-c0-response-key-id"), r.headers.get("x-c0-response-signature"), signing.SCOPE_ACK, gate.RESPONSE_DOMAIN,
    { request_nonce: nonce, http_status: r.status, body_sha256: gate.sha256Hex(r.bytes) });

test("L25, S03, 4.5 : la sonde dit version, génération, base, disque, heure ; sa réponse est signée par la clé d'accusé", async () => {
  await activateBase(pool);
  await withEnv(async () => {
    const h = datedHeaders(PUBLISH, "GET", PROBE);
    const r = await probe(h);
    assert.equal(r.status, 200);
    assert.equal(r.json.probe_version, "prodes.site_link_probe.v1");
    assert.equal(r.json.outcome, "OK");
    assert.equal(r.json.request_nonce, h["x-c0-nonce"]);
    assert.equal(r.json.key_id_seen, PUBLISH);
    assert.equal(r.json.site.commit, "abc1234");
    assert.equal(typeof r.json.site.db_bytes, "number");
    assert.ok(r.json.site.disk_total_bytes > 0);
    assert.ok(r.json.site.active_publication.catalogue_sequence >= 1);
    assert.ok(Math.abs(Date.parse(r.json.server_time_utc) - Date.now()) < 5000);
    assert.equal(r.headers.get("x-c0-response-key-id"), "c0-test-ack-01");
    assert.ok(responseSigned(r, h["x-c0-nonce"]), "réponse signée par la clé d'accusé, liée au nonce de la requête");
    assert.equal(responseSigned(r, "f".repeat(32)), false, "une autre requête ne peut pas reprendre cette réponse");
  });
});

test("L15 : une requête rejouée à l'identique dans la fenêtre est refusée, y compris après un redémarrage", async () => {
  await withEnv(async () => {
    const h = datedHeaders(PUBLISH, "GET", PROBE);
    assert.equal((await probe(h)).status, 200);
    const again = await probe(h);
    assert.equal(again.status, 401);
    assert.equal(again.json.transport_error, "REQUEST_REPLAYED");
    assert.ok(responseSigned(again, h["x-c0-nonce"]), "le refus est signé lui aussi");
    // « Redémarrage » : un autre pool, la même base ; le nonce est en base, pas en mémoire (DF-0115).
    const other = newPool(2);
    try {
      const { rows } = await other.query("SELECT count(*)::int AS n FROM site_request_nonce WHERE nonce = $1", [h["x-c0-nonce"]]);
      assert.equal(rows[0].n, 1);
    } finally {
      await other.end();
    }
    assert.equal((await probe(h)).json.transport_error, "REQUEST_REPLAYED");
  });
});

test("L16, L17 : une requête datée de plus de 300 s est refusée avec l'heure du site ; la sonde répond l'écart sans garder le nonce", async () => {
  await withEnv(async () => {
    const old = new Date(Date.now() - 301_000);
    const body = new TextEncoder().encode('{"media":[]}');
    const stale = await missing(body, { ...datedHeaders(PUBLISH, "POST", "/api/site/publish/media/missing", body, { issuedAt: old }), "content-type": "application/json" });
    assert.equal(stale.status, 401);
    assert.equal(stale.json.transport_error, "REQUEST_STALE");
    assert.ok(Math.abs(Date.parse(stale.json.server_time_utc) - Date.now()) < 5000);
    const skewed = datedHeaders(PUBLISH, "GET", PROBE, undefined, { issuedAt: new Date(Date.now() - 600_000) });
    for (let i = 0; i < 2; i += 1) {
      const r = await probe(skewed);
      assert.equal(r.status, 200);
      assert.equal(r.json.outcome, "CLOCK_SKEW");
      assert.equal(r.json.site, undefined, "hors fenêtre : l'heure seule");
      assert.ok(responseSigned(r, skewed["x-c0-nonce"]));
    }
    const fresh = datedHeaders(PUBLISH, "GET", PROBE, undefined, { issuedAt: new Date(Date.now() - 290_000) });
    assert.equal((await probe(fresh)).json.outcome, "OK");
  });
});

test("4.4 : sans date, signature fausse, chemin ou corps changés -> refusé avant tout effet", async () => {
  await withEnv(async () => {
    const body = new TextEncoder().encode('{"media":[]}');
    const good = datedHeaders(PUBLISH, "POST", "/api/site/publish/media/missing", body);
    assert.equal((await missing(body, { "x-c0-key-id": PUBLISH })).json.transport_error, "REQUEST_UNDATED");
    assert.equal((await missing(body, { ...good, "x-c0-request-signature": "0".repeat(64) })).json.transport_error, "REQUEST_SIGNATURE_INVALID");
    assert.equal((await missing(new TextEncoder().encode('{"media":[ ]}'), good)).json.transport_error, "REQUEST_SIGNATURE_INVALID");
    const elsewhere = datedHeaders(PUBLISH, "POST", "/api/site/publish/activate", body);
    assert.equal((await missing(body, elsewhere)).json.transport_error, "REQUEST_SIGNATURE_INVALID");
    // La clé d'accusé ne peut pas parler pour la Factory sur ces routes.
    assert.equal((await missing(body, datedHeaders("c0-test-ack-01", "POST", "/api/site/publish/media/missing", body))).json.transport_error, "KEY_UNKNOWN");
  });
});

test("L09, L10 : deux clés de publication actives à la fois ; une clé retirée ou absente est inconnue du site", async () => {
  const folder = mkdtempSync(join(tmpdir(), "c4t-"));
  try {
    const first = makeKeyring({ nature: "test", prefix: "essai-" });
    const rotated = makeKeyring({ nature: "test", prefix: "essai-", base: first, rotate: ["publish"] });
    const path = join(folder, "trousseau.json");
    writeFileSync(path, JSON.stringify(rotated));
    await withEnv(async () => {
      for (const keyId of ["essai-publish-01", "essai-publish-02"]) {
        const r = await probe(datedHeaders(keyId, "GET", PROBE, undefined, { keyring: rotated }));
        assert.equal(r.status, 200, keyId);
        assert.equal(r.json.key_id_seen, keyId);
        assert.ok(responseSigned(r, r.json.request_nonce, rotated));
      }
    }, { SITE_KEYRING_PATH: path, SITE_ACK_KEY_ID: "essai-ack-01" });
    const retired = makeKeyring({ nature: "test", prefix: "essai-", base: rotated, retire: ["essai-publish-01"] });
    writeFileSync(path, JSON.stringify(retired));
    await withEnv(async () => {
      const r = await probe(datedHeaders("essai-publish-01", "GET", PROBE, undefined, { keyring: rotated }));
      assert.equal(r.json.transport_error, "KEY_UNKNOWN");
      assert.equal(r.status, 401);
      // Une route de publication dit aussi KEY_UNKNOWN à côté du refus C0 habituel.
      const request = new Request("http://local/api/site/publish/stage", { method: "POST", body: "{}", headers: { "x-c0-key-id": "essai-publish-01", "x-c0-signature": "a".repeat(64) } });
      const stage = await http.handleWithBody("STAGE", request, 1 << 20, async () => { throw new Error("non appelé"); });
      const refused = await stage.json();
      assert.deepEqual([stage.status, refused.error_codes, refused.transport_error], [401, ["SIGNATURE_INVALID"], "KEY_UNKNOWN"]);
    }, { SITE_KEYRING_PATH: path, SITE_ACK_KEY_ID: "essai-ack-01" });
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

test("4.3 : le site dit quels médias lui manquent, dans l'ordre demandé, sans rien écrire", async () => {
  await resetDb();
  const c = loadCase("F_SIMPLE_READY.activate_first");
  await putAllMedia(deps(pool, { now: c.now, policy: c.policy }), c);
  const present = c.media.map((m) => m.sha256);
  const absent = ["e".repeat(64), "d".repeat(64)];
  await withEnv(async () => {
    const body = new TextEncoder().encode(JSON.stringify({ media: [absent[0], ...present, absent[1], absent[0]].map((sha256) => ({ sha256, size: 1 })) }));
    const r = await missing(body, datedHeaders(PUBLISH, "POST", "/api/site/publish/media/missing", body));
    assert.equal(r.status, 200);
    assert.deepEqual(r.json, { outcome: "MEDIA_MISSING", missing: absent });
    assert.equal(r.headers.get("x-c0-response-key-id"), "c0-test-ack-01");
    for (const bad of ['{"media":[{"sha256":"zz"}]}', '{"media":{}}', "pas du json", JSON.stringify({ media: Array.from({ length: link.MAX_MISSING_ENTRIES + 1 }, () => ({ sha256: "e".repeat(64), size: 1 })) })]) {
      const bytes = new TextEncoder().encode(bad);
      const refused = await missing(bytes, datedHeaders(PUBLISH, "POST", "/api/site/publish/media/missing", bytes));
      assert.deepEqual([refused.status, refused.json.transport_error], [400, "REQUEST_INVALID"], bad.slice(0, 30));
    }
    const { rows } = await pool.query("SELECT count(*)::int AS n FROM site_media");
    assert.equal(rows[0].n, present.length);
  });
});

test("4.2 : le générateur fabrique un secret par usage, n'écrase rien, n'affiche aucune valeur, écrit en 0600 ; la rotation garde la nature", async () => {
  const folder = mkdtempSync(join(tmpdir(), "c4t-"));
  try {
    const out = join(folder, "k.json");
    let printed = "";
    const sink = { write: (text) => { printed += text; } };
    assert.equal(keyringMain(["--nature", "real", "--prefix", "tampon-", "--out", out], sink), 0);
    const made = JSON.parse(readFileSync(out, "utf8"));
    assert.equal(made.keyring_version, "prodes.site_keyring.v1");
    assert.equal(made.nature, "real");
    assert.deepEqual(made.keys.map((k) => [k.key_id, k.scope, k.status]), [
      ["tampon-publish-01", "site_snapshot.publish", "ACTIVE"], ["tampon-ack-01", "activation_ack", "ACTIVE"], ["tampon-events-01", "site_events.read", "ACTIVE"]]);
    assert.equal(new Set(made.keys.map((k) => k.secret_utf8)).size, 3);
    for (const key of made.keys) {
      assert.match(key.secret_utf8, /^[0-9a-f]{64}$/);
      assert.ok(!printed.includes(key.secret_utf8), "aucune valeur affichée");
    }
    if (process.platform !== "win32") assert.equal(statSync(out).mode & 0o777, 0o600);
    assert.throws(() => keyringMain(["--nature", "real", "--prefix", "tampon-", "--out", out], sink), /existe déjà/);
    assert.throws(() => keyringMain(["--nature", "test", "--prefix", "tampon-", "--out", out, "--from", out, "--rotate", "ack"], sink), /nature/);
    keyringMain(["--nature", "real", "--prefix", "tampon-", "--out", out, "--from", out, "--rotate", "ack"], sink);
    const rotated = JSON.parse(readFileSync(out, "utf8"));
    assert.deepEqual(rotated.keys.filter((k) => k.scope === "activation_ack").map((k) => [k.key_id, k.status]), [["tampon-ack-01", "ACTIVE"], ["tampon-ack-02", "ACTIVE"]]);
    // Accepté par le receveur du SITE tel quel.
    const loaded = config.loadReceiverConfig({ SITE_ENV: "staging", SITE_KEYRING_PATH: out, SITE_ACK_KEY_ID: "tampon-ack-02",
      SITE_WITHDRAWAL_HOLD_POLICY: '{"max_withdrawals_without_release":null,"released_expected_withdrawals_digest":null}' });
    assert.equal(loaded.ackKeyId, "tampon-ack-02");
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

test("4.2, test croisé : un trousseau d'essai fabriqué par la Factory (site_keyring make) est accepté par le SITE", async () => {
  const path = join(ROOT, "tests", "fixtures", "c4", "keyring_from_factory.json");
  const keyring = JSON.parse(readFileSync(path, "utf8"));
  assert.equal(keyring.nature, "test");
  const loaded = config.loadReceiverConfig({ SITE_ENV: "staging", SITE_KEYRING_PATH: path, SITE_ACK_KEY_ID: "essai-factory-ack-01",
    SITE_WITHDRAWAL_HOLD_POLICY: '{"max_withdrawals_without_release":null,"released_expected_withdrawals_digest":null}' });
  assert.ok(gate.keyKnown(loaded.keyring, "essai-factory-publish-01"));
  assert.ok(signing.keyHasScope(loaded.keyring, "essai-factory-events-01", signing.SCOPE_EVENTS_READ));
});
