// Famille 11 — clés : hors scope (activation_ack, site_events.read) -> SIGNATURE_INVALID 401 ; RETIRED -> idem ;
// VERIFY_ONLY -> acceptée. Cas rejoués : F_SIMPLE_READY.signature_wrong_scope (c0-test-ack-01),
// F_SIMPLE_READY.signature_retired_key (c0-test-publish-00), F_SIMPLE_READY.rotation_verify_only_key (c0-test-publish-01),
// F_SIMPLE_READY.signature_unknown_key_id, signature_missing, signature_altered ; plus c0-test-events-01 (même règle §7).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { ACTIVATE, KEYRING, STAGE, VERIFY, body, deps, fullFlow, headersFor, jsonc, loadCase, newPool, outcomeOf, receiver, resetDb, scalar } from "./helpers.mjs";

let pool;
before(async () => { await resetDb(); pool = newPool(); });
after(async () => { await pool.end(); });

for (const caseId of [
  "F_SIMPLE_READY.signature_wrong_scope",
  "F_SIMPLE_READY.signature_retired_key",
  "F_SIMPLE_READY.signature_unknown_key_id",
  "F_SIMPLE_READY.signature_missing",
  "F_SIMPLE_READY.signature_altered",
]) {
  test(`${caseId} : STAGE -> SIGNATURE_INVALID 401, rien persisté`, async () => {
    const c = loadCase(caseId);
    const res = await STAGE(deps(pool, { now: c.now, policy: c.policy }), c);
    assert.equal(res.status, 401);
    assert.deepEqual(outcomeOf(res), { accepted: false, outcome: c.verdict.outcome, error_codes: c.verdict.error_codes });
    assert.equal(body(res).stage, "signature");
    assert.equal(await scalar(pool, "SELECT count(*)::int FROM site_generation"), 0);
  });
}

test("clé c0-test-events-01 (site_events.read) sur STAGE -> SIGNATURE_INVALID 401 (règle de F_SIMPLE_READY.signature_wrong_scope)", async () => {
  const c = loadCase("F_SIMPLE_READY.signature_wrong_scope");
  const res = await STAGE(deps(pool, { now: c.now, policy: c.policy }), { ...c, transport: { key_id: "c0-test-events-01", signature: c.transport.signature } });
  assert.equal(res.status, 401);
  assert.deepEqual(body(res).error_codes, ["SIGNATURE_INVALID"]);
});

test("F_SIMPLE_READY.rotation_verify_only_key : clé VERIFY_ONLY acceptée jusqu'à l'ACK", async () => {
  const c = loadCase("F_SIMPLE_READY.rotation_verify_only_key");
  assert.equal(c.transport.key_id, "c0-test-publish-01");
  assert.equal(c.verdict.outcome, "ACTIVATED");
  const flow = await fullFlow(pool, c);
  assert.equal(body(flow.staged).outcome, "STAGED");
  assert.equal(flow.activated.headers["x-c0-outcome"], "ACTIVATED");
});

test("clés hors scope sur MEDIA, VERIFY_MEDIA, ACTIVATE et STATUS -> SIGNATURE_INVALID 401", async () => {
  await resetDb();
  const c = loadCase("F_SIMPLE_READY.activate_first");
  const d = deps(pool, { now: c.now, policy: c.policy });
  await STAGE(d, c);
  const media = c.media[0];
  for (const keyId of ["c0-test-ack-01", "c0-test-events-01", "c0-test-publish-00"]) {
    const bad = headersFor({ key_id: keyId, signature: c.transport.signature });
    const put = await receiver.putMedia(d, media.sha256, media.bytes, bad, "image/png");
    assert.equal(put.status, 401, `PUT ${keyId}`);
    const v = await VERIFY(d, c, { key_id: keyId, signature: c.transport.signature });
    assert.equal(v.status, 401, `VERIFY ${keyId}`);
    const a = await ACTIVATE(d, c, { key_id: keyId, signature: c.transport.signature });
    assert.equal(a.status, 401, `ACTIVATE ${keyId}`);
    assert.deepEqual(body(a).error_codes, ["SIGNATURE_INVALID"]);
    const s = await receiver.status(d, c.doc.publication_id, String(c.doc.catalogue_sequence), bad);
    assert.equal(s.status, 401, `STATUS ${keyId}`);
  }
  // signature média calculée avec la clé ACK : refusée elle aussi (scope)
  // (HMAC calculé à la main : signing.sign refuse lui-même de signer hors scope)
  const ackSecret = KEYRING.keys.find((k) => k.key_id === "c0-test-ack-01").secret_utf8;
  const ctx = jsonc.canonicalBytes({ sha256: media.sha256, size: media.bytes.length });
  const mac = createHmac("sha256", Buffer.from(ackSecret, "utf8"))
    .update(Buffer.concat([Buffer.from(receiver.MEDIA_TRANSPORT_DOMAIN, "utf8"), Buffer.from([0]), Buffer.from(ctx)])).digest("hex");
  const ackSigned = await receiver.putMedia(d, media.sha256, media.bytes, headersFor({ key_id: "c0-test-ack-01", signature: mac }), "image/png");
  assert.equal(ackSigned.status, 401);
  assert.equal(await scalar(pool, "SELECT count(*)::int FROM site_media"), 0);
  assert.equal(await scalar(pool, "SELECT status FROM site_generation"), "STAGED", "aucun refus de signature ne change l'état");
  // STATUS signé correctement : état sans octets
  const ok = await receiver.status(d, c.doc.publication_id, String(c.doc.catalogue_sequence), headersFor(c.transport));
  assert.equal(ok.status, 200);
  const g = body(ok).generation;
  assert.equal(g.status, "STAGED");
  assert.equal("snapshot_bytes" in g || "snapshot" in g || "ack" in g, false);
});
