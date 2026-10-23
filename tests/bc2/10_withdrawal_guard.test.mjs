// Famille 10 — garde de retraits (C0 §8.4, R-11, DF-0090 : aucun seuil calibré ici, valeurs des fixtures seulement).
// Cas rejoués : F_FULL_CORRUPT.legit_withdrawals_listed (politique null en staging -> ACTIVATED),
// F_FULL_CORRUPT.massive_listed_over_policy (politique 5 sans libération -> STAGE_HOLD RELEASE_REQUIRED),
// F_FULL_CORRUPT.massive_listed_released (libération liée au digest -> ACTIVATED) ; null en production -> erreur de configuration.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { ACTIVATE, KEYRING_PATH, activateBase, body, config, deps, fullFlow, http, loadCase, newPool, outcomeOf, pointer, resetDb } from "./helpers.mjs";

let pool;
before(async () => { pool = newPool(); });
after(async () => { await pool.end(); });

test("F_FULL_CORRUPT.legit_withdrawals_listed : politique null en staging -> activation (fail-open explicite)", async () => {
  await resetDb();
  await activateBase(pool);
  const c = loadCase("F_FULL_CORRUPT.legit_withdrawals_listed");
  assert.equal(c.policy.max_withdrawals_without_release, null);
  const flow = await fullFlow(pool, c, { env: "staging" });
  assert.equal(flow.activated.headers["x-c0-outcome"], "ACTIVATED");
});

test("F_FULL_CORRUPT.massive_listed_over_policy puis massive_listed_released : RELEASE_REQUIRED, puis libération -> ACTIVATED", async () => {
  await resetDb();
  await activateBase(pool);
  const held = loadCase("F_FULL_CORRUPT.massive_listed_over_policy");
  assert.deepEqual(held.policy, { max_withdrawals_without_release: 5, released_expected_withdrawals_digest: null });
  const ptr = await pointer(pool);
  const flow = await fullFlow(pool, held);
  assert.equal(flow.activated.status, 202);
  assert.deepEqual(outcomeOf(flow.activated), { accepted: false, outcome: held.verdict.outcome, error_codes: held.verdict.error_codes });
  assert.equal(body(flow.activated).hold_reason, "RELEASE_REQUIRED");
  assert.deepEqual(await pointer(pool), ptr);

  // même génération, configuration receiver portant la libération du cas (digest des retraits attendus)
  const released = loadCase("F_FULL_CORRUPT.massive_listed_released");
  assert.equal(released.policy.released_expected_withdrawals_digest, held.doc.coverage.expected_withdrawals_digest);
  const res = await ACTIVATE(deps(pool, { now: released.now, policy: released.policy }), released);
  assert.equal(released.verdict.outcome, "ACTIVATED");
  assert.equal(res.headers["x-c0-outcome"], "ACTIVATED");
});

test("politique null en production -> erreur de configuration ; le receiver n'active rien", async () => {
  const env = {
    SITE_ENV: "production",
    SITE_KEYRING_PATH: KEYRING_PATH,
    SITE_ACK_KEY_ID: "c0-test-ack-01",
    SITE_WITHDRAWAL_HOLD_POLICY: JSON.stringify({ max_withdrawals_without_release: null, released_expected_withdrawals_digest: null }),
  };
  assert.throws(() => config.loadReceiverConfig(env), (e) => e instanceof config.ReceiverConfigError && /staging/.test(e.message));
  // absente / invalide = erreur aussi (C0 §15)
  assert.throws(() => config.loadReceiverConfig({ ...env, SITE_ENV: "staging", SITE_WITHDRAWAL_HOLD_POLICY: undefined }), config.ReceiverConfigError);
  assert.throws(() => config.loadReceiverConfig({ ...env, SITE_ENV: "staging", SITE_WITHDRAWAL_HOLD_POLICY: '{"max_withdrawals_without_release":-1,"released_expected_withdrawals_digest":null}' }), config.ReceiverConfigError);
  assert.throws(() => config.loadReceiverConfig({ ...env, SITE_ENV: "staging", SITE_KEYRING_PATH: undefined }), config.ReceiverConfigError);
  assert.throws(() => config.loadReceiverConfig({ ...env, SITE_ENV: "staging", SITE_ACK_KEY_ID: "c0-test-publish-02" }), config.ReceiverConfigError);
  // un entier en production est accepté (valeur de fixture, pas un seuil métier)
  assert.equal(config.loadReceiverConfig({ ...env, SITE_WITHDRAWAL_HOLD_POLICY: '{"max_withdrawals_without_release":5,"released_expected_withdrawals_digest":null}' }).env, "production");

  // Par la route : l'adaptateur HTTP refuse avant tout accès au receiver.
  const saved = { ...process.env };
  Object.assign(process.env, env, { SITE_DATABASE_URL: process.env.SITE_TEST_DATABASE_URL });
  try {
    let invoked = false;
    const res = await http.handle("ACTIVATE", async () => { invoked = true; throw new Error("ne doit pas être appelé"); });
    assert.equal(res.status, 503);
    assert.equal((await res.json()).transport_error, "RECEIVER_CONFIG_INVALID");
    assert.equal(invoked, false);
  } finally {
    for (const k of Object.keys(env).concat("SITE_DATABASE_URL")) delete process.env[k];
    Object.assign(process.env, saved);
  }
});
