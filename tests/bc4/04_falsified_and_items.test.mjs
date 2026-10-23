// Famille 4 — CE-T16 : montants falsifiés (unit_amount, rate_id, line_total, total_amount) → PRICE_CHANGED, 0 Order ;
// variante interdite → INVALID_VARIANT ; Item non publié → ITEM_NOT_PUBLISHED ; clé supplantée → ITEM_SUPERSEDED + canonique.
// Cas : F_QUOTE_ORDER.order_falsified_amount, order_tier_crossed, order_line_total_not_unit_times_quantity, order_total_mismatch,
// order_item_not_published, order_invalid_variant (F_SELL_WINDOWS.activate) ; F_ESUNNY_FORBIDDEN.order_forbidden_combination,
// order_allowed_combination (F_ESUNNY_FORBIDDEN.activate) ; F_IDENTITY.order_with_tombstoned_keys (F_IDENTITY.activate_gen_a → b → c).
import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import { ZERO, activate, assertVerdict, businessCase, counts, docJson, newPool, resetDb, submit } from "./helpers.mjs";

async function refusedWithoutWrite(pool, caseId) {
  const before = await counts(pool);
  const c = businessCase(caseId);
  const res = await submit(pool, c.kind, c.bytes, c.now);
  assertVerdict(res, caseId);
  assert.equal(res.body.durable, false);
  assert.equal(res.body.receipt_ref, undefined);
  assert.equal(res.body.access_token, undefined);
  assert.deepEqual(await counts(pool), before, `${caseId} : aucune ligne écrite`);
  return res;
}

describe("génération F_SELL_WINDOWS s7", () => {
  let pool;
  before(async () => { await resetDb(); pool = newPool(); await activate(pool, "F_SELL_WINDOWS.activate"); });
  after(async () => { await pool.end(); });

  for (const caseId of [
    "F_QUOTE_ORDER.order_falsified_amount",
    "F_QUOTE_ORDER.order_tier_crossed",
    "F_QUOTE_ORDER.order_line_total_not_unit_times_quantity",
    "F_QUOTE_ORDER.order_total_mismatch",
    "F_QUOTE_ORDER.order_item_not_published",
    "F_QUOTE_ORDER.order_invalid_variant",
    "F_QUOTE_ORDER.order_same_key_other_axes",
    "F_QUOTE_ORDER.order_future_window",
    "F_QUOTE_ORDER.order_duplicate_lines_tier_bypass",
    "F_QUOTE_ORDER.quote_displayed_price_changed",
  ]) {
    test(`${caseId} → refus C0, 0 écriture`, async () => { await refusedWithoutWrite(pool, caseId); });
  }

  test("CE-T16 : chaque champ prix falsifié isolément (rate_id, unit_amount, line_total, total_amount) → PRICE_CHANGED 409, 0 Order", async () => {
    const base = docJson("F_QUOTE_ORDER/order_valid.json");
    const forged = [
      (o) => { o.lines[0].rate_id = "R-401-B1"; },
      (o) => { o.lines[0].unit_amount = "10.00"; o.lines[0].line_total = "100.00"; o.total_amount = "115.75"; },
      (o) => { o.lines[1].line_total = "15.70"; o.total_amount = "125.70"; },
      (o) => { o.total_amount = "125.74"; },
    ];
    for (const [i, f] of forged.entries()) {
      const o = structuredClone(base);
      o.idempotency_key = `order:forged:000${i}`;
      f(o);
      const res = await submit(pool, "order", JSON.stringify(o), "2026-10-20T09:00:00Z");
      assert.equal(res.status, 409, JSON.stringify(res.body));
      assert.deepEqual(res.body.error_codes, ["PRICE_CHANGED"]);
    }
    assert.deepEqual(await counts(pool), ZERO);
  });

  test("ITEM_NOT_PUBLISHED → HTTP 404 (C0 §13)", async () => {
    const c = businessCase("F_QUOTE_ORDER.order_item_not_published");
    assert.equal((await submit(pool, "order", c.bytes, c.now)).status, 404);
  });
});

describe("génération F_ESUNNY_FORBIDDEN s1", () => {
  let pool;
  before(async () => { await resetDb(); pool = newPool(); await activate(pool, "F_ESUNNY_FORBIDDEN.activate"); });
  after(async () => { await pool.end(); });

  test("variante interdite → INVALID_VARIANT 422, 0 écriture — F_ESUNNY_FORBIDDEN.order_forbidden_combination", async () => {
    const res = await refusedWithoutWrite(pool, "F_ESUNNY_FORBIDDEN.order_forbidden_combination");
    assert.equal(res.status, 422);
  });

  test("variante publiée → RECEIVED — F_ESUNNY_FORBIDDEN.order_allowed_combination", async () => {
    const c = businessCase("F_ESUNNY_FORBIDDEN.order_allowed_combination");
    const res = await submit(pool, "order", c.bytes, c.now);
    assertVerdict(res, c.caseId);
    const n = await counts(pool);
    assert.equal(n.site_order, 1);
  });
});

describe("générations F_IDENTITY a → b → c (tombstones)", () => {
  let pool;
  before(async () => {
    await resetDb();
    pool = newPool();
    await activate(pool, "F_IDENTITY.activate_gen_a");
    await activate(pool, "F_IDENTITY.activate_gen_b_same_keys");
    await activate(pool, "F_IDENTITY.activate_gen_c_tombstones");
  });
  after(async () => { await pool.end(); });

  test("clé supplantée + clé retirée → ITEM_RETIRED + ITEM_SUPERSEDED, canonique donnée, 0 écriture — F_IDENTITY.order_with_tombstoned_keys", async () => {
    const res = await refusedWithoutWrite(pool, "F_IDENTITY.order_with_tombstoned_keys");
    assert.equal(res.body.superseded_by["PI-000000JW3"], "PI-000000JVF");
    assert.equal(res.status, 409, "codes de statuts différents (409 et 410) → 409");
  });
});
