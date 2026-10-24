// Famille 1 — commande valide : 1 site_order, N lignes figées, 1 idempotence, 1 événement order.received
// dont les octets passent validateEvent(bytes, []) → APPLY ; total_cents exact.
// Génération ACTIVE : F_SELL_WINDOWS.activate (snapshot_s7) ; requête : F_QUOTE_ORDER.order_valid.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { ZERO, activate, assertVerdict, businessCase, c0business, c0events, counts, newPool, resetDb, submit } from "./helpers.mjs";

let pool;
before(async () => { await resetDb(); pool = newPool(); await activate(pool, "F_SELL_WINDOWS.activate"); });
after(async () => { await pool.end(); });

test("F_QUOTE_ORDER.order_valid → RECEIVED durable, lignes figées C0, outbox APPLY, total_cents = Σ", async () => {
  assert.deepEqual(await counts(pool), ZERO);
  const c = businessCase("F_QUOTE_ORDER.order_valid");
  const res = await submit(pool, "order", c.bytes, c.now);
  assertVerdict(res, c.caseId);
  assert.equal(res.body.persistence, "POSTGRESQL_SITE_LOCAL");
  assert.equal(res.body.durable, true);
  assert.match(res.body.receipt_ref, /^ORD-[0-9a-f]{32}$/);
  assert.match(res.body.access_token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(res.body.receipt.total_amount, "125.75");
  assert.equal(res.body.receipt.status, "RECEIVED");

  // Les lignes renvoyées = celles que C0 renvoie pour les mêmes entrées (oracle : le C0 vendu lui-même).
  const gen = { snapshot: JSON.parse(Buffer.from((await pool.query("SELECT snapshot_bytes FROM site_generation WHERE status='ACTIVE'")).rows[0].snapshot_bytes).toString("utf8")), status: "ACTIVE" };
  const oracle = c0business.validateOrderSubmit(c.bytes, gen, [], c.now);
  assert.deepEqual(res.body.lines, JSON.parse(JSON.stringify(oracle.receipt.lines)));
  assert.equal(res.body.request_fingerprint, oracle.receipt.request_fingerprint);

  assert.deepEqual(await counts(pool), { ...ZERO, site_order: 1, site_order_line: 2, site_idempotency: 1, site_outbox_event: 1 });
  const order = (await pool.query("SELECT * FROM site_order")).rows[0];
  assert.equal(order.order_ref, res.body.receipt_ref);
  assert.equal(order.total_amount, "125.75");
  assert.equal(order.total_cents, "12575");
  assert.equal(order.status, "RECEIVED");
  assert.equal(order.catalogue_sequence, "7");
  assert.match(order.access_token_sha256, /^[0-9a-f]{64}$/);
  assert.notEqual(order.access_token_sha256, res.body.access_token, "jeton stocké haché, jamais en clair");
  const lines = (await pool.query("SELECT * FROM site_order_line ORDER BY line_no")).rows;
  assert.deepEqual(lines.map((l) => [l.public_item_key, l.quantity, l.rate_id, l.unit_amount, l.unit_cents, l.line_total, l.line_total_cents, l.tax_basis_or_status, l.catalogue_sequence]), [
    ["PI-000000CHJ", 10, "R-401-T10", "11.00", "1100", "110.00", "11000", "HT", "7"],
    ["PI-000000CJS", 3, "R-402-A", "5.25", "525", "15.75", "1575", "UNQUALIFIED", "7"],
  ]);
  assert.ok(lines.every((l) => typeof l.offer_price_version_public === "string" && l.offer_price_version_public.length > 0));
  assert.equal(lines.reduce((s, l) => s + BigInt(l.line_total_cents), 0n), BigInt(order.total_cents));

  const ev = (await pool.query("SELECT * FROM site_outbox_event")).rows[0];
  assert.equal(ev.event_type, "order.received");
  assert.equal(ev.status, "PENDING");
  assert.equal(ev.object_ref, res.body.receipt_ref);
  const bytes = new Uint8Array(ev.event_bytes);
  const v = c0events.validateEvent(bytes, []);
  assert.equal(v.outcome, "APPLY", JSON.stringify(v));
  assert.equal(v.record.payload_digest, ev.payload_digest);
  assert.equal(c0events.payloadDigest(ev.payload), ev.payload_digest);
  const event = JSON.parse(Buffer.from(bytes).toString("utf8"));
  assert.equal(event.payload.total_amount, "125.75");
  assert.equal(event.catalogue_sequence, 7);

  const idem = (await pool.query("SELECT * FROM site_idempotency")).rows[0];
  assert.deepEqual([idem.kind, idem.idempotency_key, idem.request_fingerprint, idem.receipt_ref], ["order", "order:qo:0001", res.body.request_fingerprint, res.body.receipt_ref]);
  assert.deepEqual(idem.receipt_json, res.body.receipt);
});

test("journal BC4 : une ligne RECEIVED sans PII ni jeton", async () => {
  const { rows } = await pool.query("SELECT operation, outcome, object_ref, detail, error_codes FROM site_transaction_log ORDER BY id");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].operation, "ORDER");
  assert.equal(rows[0].outcome, "RECEIVED");
  const text = JSON.stringify(rows);
  assert.doesNotMatch(text, /example\.invalid|STAGING_FIXTURE Contact|Mairie|order:qo:0001/);
});
