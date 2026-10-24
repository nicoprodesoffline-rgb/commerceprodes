// Famille 2 — FULL amputé auto-cohérent -> STAGE_HOLD ; retraits légitimes listés -> activés.
// Cas rejoués : F_FULL_CORRUPT.activate_base, F_FULL_CORRUPT.full_amputated_self_consistent (STAGE_HOLD),
//               F_FULL_CORRUPT.legit_withdrawals_listed (ACTIVATED).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { ACTIVATE, activateBase, body, fullFlow, loadCase, newPool, outcomeOf, pointer, resetDb, siteDb } from "./helpers.mjs";

let pool;
before(async () => { await resetDb(); pool = newPool(); });
after(async () => { await pool.end(); });

test("F_FULL_CORRUPT.full_amputated_self_consistent : STAGE_HOLD UNEXPLAINED_WITHDRAWALS, ancienne génération servie", async () => {
  const { base } = await activateBase(pool);
  const before = await pointer(pool);
  const c = loadCase("F_FULL_CORRUPT.full_amputated_self_consistent");
  const flow = await fullFlow(pool, c);
  assert.equal(body(flow.staged).outcome, "STAGED");
  assert.equal(flow.activated.status, 202);
  const b = body(flow.activated);
  assert.deepEqual(outcomeOf(flow.activated), { accepted: c.verdict.accepted, outcome: c.verdict.outcome, error_codes: c.verdict.error_codes });
  assert.equal(b.hold_reason, "UNEXPLAINED_WITHDRAWALS");
  assert.equal(b.stage, "hold");
  assert.equal(flow.activated.headers["x-c0-outcome"], undefined, "aucun ACK sur STAGE_HOLD");
  assert.deepEqual(await pointer(pool), before, "pointeur inchangé");
  const active = await siteDb.getActiveGeneration(pool);
  assert.equal(active.payload_sha256, base.doc.payload_sha256, "l'ancienne génération reste servie");
  const { rows } = await pool.query("SELECT status, ack_json FROM site_generation WHERE payload_sha256 = $1", [c.doc.payload_sha256]);
  assert.equal(rows[0].status, "HOLD");
  assert.equal(rows[0].ack_json, null);
});

test("F_FULL_CORRUPT.legit_withdrawals_listed : retraits listés -> ACTIVATED, ancienne génération SUPERSEDED", async () => {
  const c = loadCase("F_FULL_CORRUPT.legit_withdrawals_listed");
  assert.equal(c.verdict.outcome, "ACTIVATED");
  const flow = await fullFlow(pool, c);
  assert.equal(flow.activated.status, 200);
  assert.equal(flow.activated.headers["x-c0-outcome"], "ACTIVATED");
  const active = await siteDb.getActiveGeneration(pool);
  assert.equal(active.payload_sha256, c.doc.payload_sha256);
  assert.equal(active.status, "ACTIVE");
  const { rows } = await pool.query("SELECT status, count(*)::int AS n FROM site_generation GROUP BY status ORDER BY status");
  assert.deepEqual(rows, [{ status: "ACTIVE", n: 1 }, { status: "HOLD", n: 1 }, { status: "SUPERSEDED", n: 1 }]);
  assert.equal(c.doc.coverage.expected_withdrawals.length > 0, true, "le cas porte bien des retraits");
  // un second ACTIVATE de la génération tenue après la bascule : jamais activée en douce. Même séquence que
  // l'ACTIVE (autre SHA) -> SEQUENCE_COLLISION par la fonction pure, consignée REJECTED.
  const amputated = loadCase("F_FULL_CORRUPT.full_amputated_self_consistent");
  assert.equal(amputated.doc.catalogue_sequence, c.doc.catalogue_sequence);
  const again = await ACTIVATE(flow.d, amputated);
  assert.equal(again.headers["x-c0-outcome"], undefined);
  assert.deepEqual(outcomeOf(again), { accepted: false, outcome: "REJECTED", error_codes: ["SEQUENCE_COLLISION"] });
  const st = await pool.query("SELECT status FROM site_generation WHERE payload_sha256 = $1", [amputated.doc.payload_sha256]);
  assert.equal(st.rows[0].status, "REJECTED");
});
