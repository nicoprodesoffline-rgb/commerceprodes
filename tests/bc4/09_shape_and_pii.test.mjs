// Famille 9 — commande sans ligne / 201 lignes / clé de taxe → INVALID_DATA ; flottant → PAYLOAD_MALFORMED ;
// aucune clé de contact dans event_bytes (impossible par construction). Cas : F_QUOTE_ORDER.order_client_sets_tax,
// order_float_amount, order_invalid_email, order_sequence_boolean, order_unknown_version, quote_blank_organisation,
// order_duplicate_lines_ten_times_one ; dérivés de F_QUOTE_ORDER/order_valid.json (0 ligne, 201 lignes, port, statut).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { ZERO, activate, assertVerdict, businessCase, counts, docJson, newPool, resetDb, submit } from "./helpers.mjs";

let pool;
before(async () => { await resetDb(); pool = newPool(); await activate(pool, "F_SELL_WINDOWS.activate"); });
after(async () => { await pool.end(); });
const NOW = "2026-10-20T09:00:00Z";

for (const caseId of [
  "F_QUOTE_ORDER.order_client_sets_tax",
  "F_QUOTE_ORDER.order_float_amount",
  "F_QUOTE_ORDER.order_invalid_email",
  "F_QUOTE_ORDER.order_sequence_boolean",
  "F_QUOTE_ORDER.order_unknown_version",
  "F_QUOTE_ORDER.order_duplicate_lines_ten_times_one",
  "F_QUOTE_ORDER.quote_blank_organisation",
]) {
  test(`${caseId} → refus C0, 0 écriture`, async () => {
    const c = businessCase(caseId);
    const res = await submit(pool, c.kind, c.bytes, c.now);
    assertVerdict(res, caseId);
    assert.deepEqual(await counts(pool), ZERO);
  });
}

test("commande sans ligne / 201 lignes / tax_amount / shipping / status / payment → INVALID_DATA 422, 0 écriture", async () => {
  const base = docJson("F_QUOTE_ORDER/order_valid.json");
  const variants = {
    "0 ligne": { ...base, lines: [] },
    "201 lignes": { ...base, lines: Array.from({ length: 201 }, () => base.lines[0]) },
    tax_amount: { ...base, tax_amount: "2.20" },
    shipping_amount: { ...base, shipping_amount: "9.90" },
    status: { ...base, status: "PAID" },
    payment: { ...base, payment: { method: "card" } },
    "taxe sur une ligne": { ...base, lines: [{ ...base.lines[0], tax_amount: "2.20" }, base.lines[1]] },
  };
  for (const [name, body] of Object.entries(variants)) {
    const res = await submit(pool, "order", JSON.stringify(body), NOW);
    assert.equal(res.status, 422, name);
    assert.deepEqual(res.body.error_codes, ["INVALID_DATA"], name);
  }
  const quote = docJson("F_QUOTE_ORDER/quote_priced.json");
  for (const body of [{ ...quote, lines: [] }, { ...quote, tax_amount: "2.20" }]) {
    const res = await submit(pool, "quote_request", JSON.stringify(body), NOW);
    assert.deepEqual(res.body.error_codes, ["INVALID_DATA"]);
  }
  assert.deepEqual(await counts(pool), ZERO);
});

test("montants flottants, BOM, non-JSON, > 256 Kio → PAYLOAD_MALFORMED 400", async () => {
  const valid = Buffer.from(businessCase("F_QUOTE_ORDER.order_valid").bytes).toString("utf8");
  const bodies = [
    valid.replace('"quantity": 10', '"quantity": 10.0'),
    valid.replace('"catalogue_sequence": 7', '"catalogue_sequence": 7e0'),
    "﻿" + valid,
    "pas du JSON",
    valid.replace('"kind": "order"', '"kind": "order", "kind": "order"'),
    JSON.stringify({ ...JSON.parse(valid), pad: "x".repeat(262144) }),
  ];
  for (const b of bodies) {
    const res = await submit(pool, "order", b, NOW);
    assert.equal(res.status, 400, b.slice(0, 60));
    assert.deepEqual(res.body.error_codes, ["PAYLOAD_MALFORMED"]);
  }
  assert.deepEqual(await counts(pool), ZERO);
});

test("aucune donnée de contact dans event_bytes ni dans le payload (devis avec message, commande)", async () => {
  const order = businessCase("F_QUOTE_ORDER.order_valid");
  assertVerdict(await submit(pool, "order", order.bytes, order.now), order.caseId);
  const q = docJson("F_QUOTE_ORDER/quote_priced.json");
  q.message = "STAGING_FIXTURE message libre 06 12 34 56 78 achats@example.invalid";
  const quote = await submit(pool, "quote_request", JSON.stringify(q), NOW);
  assert.equal(quote.body.outcome, "RECEIVED");
  const { rows } = await pool.query("SELECT event_bytes, payload FROM site_outbox_event");
  assert.equal(rows.length, 2);
  for (const r of rows) {
    const text = Buffer.from(r.event_bytes).toString("utf8");
    for (const forbidden of ["contact", "email", "phone", "organisation_name", "contact_name", "message", "example.invalid", "STAGING_FIXTURE", "access_token"]) {
      assert.ok(!text.includes(forbidden), `event_bytes contient « ${forbidden} »`);
    }
    assert.deepEqual(JSON.parse(text).payload, r.payload);
  }
  // La PII n'est que dans l'objet (route scopée DEFERRED_FOR_PROD) : contact et message bien stockés côté SITE.
  const stored = (await pool.query("SELECT contact, message FROM site_quote_request")).rows[0];
  assert.equal(stored.contact.email, "achats@example.invalid");
  assert.match(stored.message, /message libre/);
  // Journal sans PII.
  const log = JSON.stringify((await pool.query("SELECT * FROM site_transaction_log")).rows);
  assert.ok(!/example\.invalid|STAGING_FIXTURE|message libre/.test(log));
});

test("schéma : aucune colonne taxe / port / paiement / statut client dans les tables BC4", async () => {
  const { rows } = await pool.query(`SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name IN ('site_quote_request','site_quote_line','site_order','site_order_line','site_idempotency','site_outbox_event','site_event_cursor','site_transaction_log')`);
  const bad = rows.filter((r) => /tax_amount|vat|tva|ttc|shipping|port|freight|payment|paid|invoice|customer_status|client_status/i.test(r.column_name));
  assert.deepEqual(bad, []);
  const numeric = (await pool.query(`SELECT table_name, column_name, data_type FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name LIKE 'site_%' AND data_type IN ('real','double precision','numeric')`)).rows;
  assert.deepEqual(numeric, [], "aucun flottant ni numeric pour un montant");
});
