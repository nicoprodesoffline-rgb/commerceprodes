// Famille 6 — devis non chiffré (lignes sans `displayed`) → RECEIVED, priced:false, aucun montant reconduit.
// Cas : F_QUOTE_ORDER.quote_unpriced_no_window (document quote_unpriced.json), puis F_QUOTE_ORDER.quote_priced.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { activate, assertVerdict, businessCase, c0events, newPool, resetDb, submit } from "./helpers.mjs";

let pool;
before(async () => { await resetDb(); pool = newPool(); await activate(pool, "F_SELL_WINDOWS.activate"); });
after(async () => { await pool.end(); });

test("devis non chiffré → RECEIVED, lignes priced:false sans aucun montant, événement sans prix — F_QUOTE_ORDER.quote_unpriced_no_window", async () => {
  const c = businessCase("F_QUOTE_ORDER.quote_unpriced_no_window");
  const res = await submit(pool, "quote_request", c.bytes, c.now);
  assertVerdict(res, c.caseId);
  assert.equal(res.body.receipt.lines[0].priced, false);
  assert.equal(res.body.receipt.catalogue_sequence, null);
  assert.match(res.body.receipt_ref, /^QR-[0-9a-f]{32}$/);
  const q = (await pool.query("SELECT * FROM site_quote_request")).rows[0];
  assert.equal(q.catalogue_sequence, null);
  assert.equal(q.status, "RECEIVED");
  const lines = (await pool.query("SELECT * FROM site_quote_line")).rows;
  assert.equal(lines.length, 1);
  const l = lines[0];
  assert.deepEqual([l.priced, l.rate_id, l.unit_amount, l.currency, l.tax_basis_or_status, l.offer_price_version_public, l.catalogue_sequence], [false, null, null, null, null, null, null]);
  const ev = (await pool.query("SELECT * FROM site_outbox_event")).rows[0];
  assert.equal(ev.event_type, "quote.requested");
  assert.equal(ev.catalogue_sequence, null);
  assert.equal(c0events.validateEvent(new Uint8Array(ev.event_bytes), []).outcome, "APPLY");
  assert.deepEqual(ev.payload.lines, [{ public_item_key: "PI-000000CJS", variant_axes: {}, quantity: 5, rate_id: null, unit_amount: null }]);
});

test("devis chiffré → lignes priced:true avec prix et version d'offre relus par selectPrice C0 — F_QUOTE_ORDER.quote_priced", async () => {
  const c = businessCase("F_QUOTE_ORDER.quote_priced");
  const res = await submit(pool, "quote_request", c.bytes, c.now);
  assertVerdict(res, c.caseId);
  const l = (await pool.query("SELECT l.* FROM site_quote_line l JOIN site_quote_request q ON q.id = l.quote_id WHERE q.quote_ref = $1", [res.body.receipt_ref])).rows[0];
  assert.deepEqual([l.priced, l.rate_id, l.unit_amount, l.currency, l.tax_basis_or_status, l.catalogue_sequence], [true, "R-401-T10", "11.00", "EUR", "HT", "7"]);
  assert.equal(typeof l.offer_price_version_public, "string");
});

test("base : une ligne non chiffrée portant un montant est refusée par CHECK (jamais un ancien montant reconduit)", async () => {
  const q = (await pool.query("SELECT id FROM site_quote_request LIMIT 1")).rows[0];
  await assert.rejects(
    pool.query("INSERT INTO site_quote_line (quote_id, line_no, public_item_key, variant_axes, quantity, priced, unit_amount) VALUES ($1, 99, 'PI-000000CJS', '{\"x\":\"y\"}', 1, false, '5.25')", [q.id]),
    (e) => e.code === "23514",
  );
});
