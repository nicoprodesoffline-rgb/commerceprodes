// Review BC4 — clé retirée seule (410), clé supplantée seule (409 + canonique), NUL dans le texte, sur gen_c (F_IDENTITY).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FIXTURES, activate, c0business, counts, newPool, resetDb, siteDb, submit } from "../../../../../tests/bc4/helpers.mjs";
const NOW = "2026-10-22T12:00:00Z";
const enc = (o) => new TextEncoder().encode(typeof o === "string" ? o : JSON.stringify(o));
const BASE = JSON.parse(readFileSync(join(FIXTURES, "documents/F_IDENTITY/order_old_cart_tombstoned_keys.json"), "utf8"));
let pool;
before(async () => { await resetDb(); pool = newPool(); for (const c of ["F_IDENTITY.activate_gen_a", "F_IDENTITY.activate_gen_b_same_keys", "F_IDENTITY.activate_gen_c_tombstones"]) await activate(pool, c); });
after(async () => pool.end());
test("ADV-I1 clé RETIRED seule → 410 ITEM_RETIRED ; clé SUPERSEDED seule → 409 ITEM_SUPERSEDED + superseded_by ; 0 écriture", async () => {
  const g = await siteDb.getActiveGeneration(pool); const gen = { snapshot: g.snapshot, status: g.status };
  const before = await counts(pool);
  const out = [];
  for (const [label, key, axes] of [["retired", "PI-000000JSY", { modele: "A" }], ["superseded", "PI-000000JW3", { modele: "D" }]]) {
    const line = BASE.lines.find((l) => l.public_item_key === key) ?? { public_item_key: key, variant_axes: axes, quantity: 1, rate_id: "R-X", unit_amount: "1.00", line_total: "1.00" };
    const req = { ...BASE, idempotency_key: `order:rv:${label}`, catalogue_sequence: g.catalogue_sequence, lines: [line], total_amount: line.line_total };
    const r = await submit(pool, "order", enc(req), NOW);
    const oracle = c0business.validateOrderSubmit(enc(req), gen, [], NOW);
    out.push(`${label}=${r.status}:${r.body.error_codes.join("+")}:${JSON.stringify(r.body.superseded_by)}`);
    assert.deepEqual(r.body.error_codes, oracle.error_codes);
    assert.deepEqual(r.body.superseded_by, JSON.parse(JSON.stringify(oracle.superseded_by)));
  }
  console.log("# ADV-I1", out.join(" "));
  assert.match(out[0], /^retired=410:ITEM_RETIRED/);
  assert.match(out[1], /^superseded=409:ITEM_SUPERSEDED:\{"PI-000000JW3":"PI-/);
  assert.deepEqual(await counts(pool), before);
});
test("ADV-I2 caractère NUL / contrôle dans message ou contact : refus C0 (pas un 503 PostgreSQL)", async () => {
  const g = await siteDb.getActiveGeneration(pool);
  const it = g.snapshot.families[0].items[0];
  const out = [];
  for (const [label, mut] of [["nul_message", (q) => (q.message = "a\u0000b")], ["nul_org", (q) => (q.contact.organisation_name = "Org\u0000")], ["bell_msg", (q) => (q.message = "a\u0007b")], ["u2028", (q) => (q.message = "a b")]]) {
    const q = { contract_version: "site_business.v1", kind: "quote_request", idempotency_key: `quote:rv:${label}`, catalogue_sequence: null, contact: { ...BASE.contact }, message: null,
      lines: [{ public_item_key: it.public_item_key, variant_axes: it.variant_axes, quantity: 1, displayed: null }] };
    mut(q);
    const r = await submit(pool, "quote_request", enc(q), NOW);
    out.push(`${label}=${r.status}:${r.body.outcome}:${r.body.error_codes.join("+")}`);
    assert.notEqual(r.status, 503, label);
  }
  console.log("# ADV-I2", out.join(" "));
});
