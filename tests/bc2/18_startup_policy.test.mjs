// Famille 18 — DF-0090 : `max_withdrawals_without_release = null` hors staging refuse le DÉMARRAGE du serveur
// (instrumentation.ts -> enforceStartupPolicy), en plus du 503 par requête (famille 10). Aucun seuil inventé :
// les entiers ci-dessous sont des valeurs de test, la valeur réelle est une décision propriétaire.
import { test } from "node:test";
import assert from "node:assert/strict";
import { config } from "./helpers.mjs";

const NULL_POLICY = JSON.stringify({ max_withdrawals_without_release: null, released_expected_withdrawals_digest: null });
const INT_POLICY = JSON.stringify({ max_withdrawals_without_release: 5, released_expected_withdrawals_digest: null }); // valeur de fixture

test("null hors staging (production, absent, vide, inconnu) : démarrage refusé avec un message clair", () => {
  for (const siteEnv of ["production", undefined, "", "prod", "STAGING"]) {
    const refusal = config.startupPolicyRefusal({ SITE_ENV: siteEnv, SITE_WITHDRAWAL_HOLD_POLICY: NULL_POLICY });
    assert.notEqual(refusal, null, `SITE_ENV=${siteEnv}`);
    assert.match(refusal, /max_withdrawals_without_release=null refusé/);
    assert.match(refusal, /qu'en staging/);
    assert.match(refusal, /DF-0090/);
    assert.match(refusal, /aucune valeur par défaut/);
  }
  const logs = [];
  const exits = [];
  const started = config.enforceStartupPolicy({ SITE_ENV: "production", SITE_WITHDRAWAL_HOLD_POLICY: NULL_POLICY }, (m) => logs.push(m), (c) => exits.push(c));
  assert.equal(started, false);
  assert.deepEqual(exits, [1]);
  assert.equal(logs.length, 1);
  assert.match(logs[0], /^\[site-publish\] DÉMARRAGE REFUSÉ : /);
});

test("null en staging, entier en production, politique absente : le démarrage n'est pas bloqué par ce contrôle", () => {
  const exits = [];
  const run = (env) => config.enforceStartupPolicy(env, () => undefined, (c) => exits.push(c));
  assert.equal(run({ SITE_ENV: "staging", SITE_WITHDRAWAL_HOLD_POLICY: NULL_POLICY }), true);
  assert.equal(run({ SITE_ENV: "production", SITE_WITHDRAWAL_HOLD_POLICY: INT_POLICY }), true);
  assert.equal(run({ SITE_ENV: "production", SITE_WITHDRAWAL_HOLD_POLICY: JSON.stringify({ max_withdrawals_without_release: 0, released_expected_withdrawals_digest: null }) }), true);
  // Vitrine sans receiver configuré : rien à juger ici (le receiver répondrait 503 par requête).
  assert.equal(run({ SITE_ENV: "production" }), true);
  // Politique mal formée : refusée par requête (RECEIVER_CONFIG_INVALID, famille 10), pas au démarrage.
  assert.equal(run({ SITE_ENV: "production", SITE_WITHDRAWAL_HOLD_POLICY: "{not json" }), true);
  assert.deepEqual(exits, []);
  // Cohérence avec le contrôle par requête : ce que le démarrage refuse, loadReceiverConfig le refuse aussi.
  assert.throws(() => config.parsePolicy(NULL_POLICY, "production"), config.ReceiverConfigError);
});
