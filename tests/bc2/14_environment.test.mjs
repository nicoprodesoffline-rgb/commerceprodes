// Contrôle receiver data_label (C0 §15, mandat BC2) : staging refuse PRODUCTION, production refuse STAGING_FIXTURE,
// SNAPSHOT_INVALID detail.rules ["envelope.data_label_environment"], appliqué APRÈS shape et AVANT semantic.
// Cas rejoués : F_SIMPLE_READY.activate_first (s1), F_SIMPLE_READY.buy_price_leak (shape),
// F_FULL_CORRUPT.category_unknown (semantic) ; document PRODUCTION dérivé de s1 (octets canoniques recalculés).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { STAGE, body, deps, jsonc, loadCase, newPool, outcomeOf, resetDb, scalar } from "./helpers.mjs";

let pool;
before(async () => { await resetDb(); pool = newPool(); });
after(async () => { await pool.end(); });

const PROD_POLICY = { max_withdrawals_without_release: 5, released_expected_withdrawals_digest: null }; // valeur de fixture

test("staging : un snapshot étiqueté PRODUCTION -> SNAPSHOT_INVALID envelope.data_label_environment", async () => {
  const c = loadCase("F_SIMPLE_READY.activate_first");
  const doc = structuredClone(c.doc);
  doc.data_label = "PRODUCTION";
  const res = await STAGE(deps(pool, { now: c.now, policy: c.policy, env: "staging" }), { ...c, bytes: jsonc.canonicalBytes(doc), doc });
  assert.equal(res.status, 422);
  assert.deepEqual(outcomeOf(res), { accepted: false, outcome: "REJECTED", error_codes: ["SNAPSHOT_INVALID"] });
  assert.deepEqual(body(res).detail.rules, ["envelope.data_label_environment"]);
  assert.equal(body(res).stage, "environment");
});

test("production : F_SIMPLE_READY.activate_first (STAGING_FIXTURE) -> SNAPSHOT_INVALID envelope.data_label_environment, rien persisté", async () => {
  const c = loadCase("F_SIMPLE_READY.activate_first");
  const res = await STAGE(deps(pool, { now: c.now, policy: PROD_POLICY, env: "production" }), c);
  assert.deepEqual(body(res).detail.rules, ["envelope.data_label_environment"]);
  assert.equal(await scalar(pool, "SELECT count(*)::int FROM site_generation"), 0);
});

test("ordre : une faute de forme (F_SIMPLE_READY.buy_price_leak) prime ; une faute sémantique (F_FULL_CORRUPT.category_unknown) ne passe pas avant", async () => {
  const shape = loadCase("F_SIMPLE_READY.buy_price_leak");
  const r1 = await STAGE(deps(pool, { now: shape.now, policy: PROD_POLICY, env: "production" }), shape);
  assert.deepEqual(body(r1).detail.rules, shape.verdict.expect["detail.rules"]);
  assert.equal(body(r1).stage, "shape");
  const sem = loadCase("F_FULL_CORRUPT.category_unknown");
  const r2 = await STAGE(deps(pool, { now: sem.now, policy: PROD_POLICY, env: "production" }), sem);
  assert.deepEqual(body(r2).detail.rules, ["envelope.data_label_environment"]);
  // en staging, le même document donne bien le verdict C0 de la fixture
  const r3 = await STAGE(deps(pool, { now: sem.now, policy: sem.policy, env: "staging" }), sem);
  assert.deepEqual(outcomeOf(r3), { accepted: false, outcome: sem.verdict.outcome, error_codes: sem.verdict.error_codes });
});
