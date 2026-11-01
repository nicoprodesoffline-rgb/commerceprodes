// Famille 17 — « Prix sur devis » (fenêtre `rq-`, montant de convention 0.01) : jamais commandable en ligne.
// C0 valide une commande forgée à 0,01 € ; le SITE la refuse (QUOTE_ONLY, 0 écriture). Le devis non chiffré (displayed: null) reste accepté.
// Génération ACTIVE : F_SELL_WINDOWS.activate dont la fenêtre R-402-A est réécrite en `rq-402-A` / 0.01 (document recanonisé, SHA recalculé).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { ZERO, activate, businessCase, c0business, counts, jsonc, newPool, resetDb, submit } from "./helpers.mjs";
import { snapshot } from "../bc2/helpers.mjs";

let pool;
before(async () => { await resetDb(); pool = newPool(); await activate(pool, "F_SELL_WINDOWS.activate"); });
after(async () => { await pool.end(); });

async function setCjsWindow(rateId, amount) {
  const row = (await pool.query("SELECT id, snapshot_bytes FROM site_generation WHERE status='ACTIVE'")).rows[0];
  const doc = jsonc.parseBytes(new Uint8Array(row.snapshot_bytes), 1 << 24);
  const w = doc.families[1].items[0].public_sell_price_windows[0];
  w.rate_id = rateId;
  w.unit_amount = amount;
  doc.payload_sha256 = snapshot.payloadSha256(doc);
  const bytes = Buffer.from(jsonc.canonicalBytes(doc));
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET CONSTRAINTS ALL DEFERRED");
    // Base de TEST uniquement : le garde d'immutabilité est suspendu le temps de cette transaction (réactivé avant COMMIT), pour poser une fenêtre « rq- » sans publication signée.
    await client.query("ALTER TABLE site_generation DISABLE TRIGGER site_generation_immutable");
    await client.query("UPDATE site_generation SET snapshot_bytes = $1, snapshot_json = $2::jsonb, payload_sha256 = $3 WHERE id = $4", [bytes, JSON.stringify(doc), doc.payload_sha256, row.id]);
    await client.query("UPDATE site_active_pointer SET payload_sha256 = $1 WHERE singleton = 1", [doc.payload_sha256]);
    await client.query("ALTER TABLE site_generation ENABLE TRIGGER site_generation_immutable");
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/** Commande valide F_QUOTE_ORDER.order_valid dont la ligne 2 (PI-000000CJS × 3) est forgée au montant de convention. */
function forgedOrder(c) {
  const request = JSON.parse(Buffer.from(c.bytes).toString("utf8"));
  const forged = request.lines[1];
  assert.equal(forged.public_item_key, "PI-000000CJS");
  forged.rate_id = "rq-402-A";
  forged.unit_amount = "0.01";
  forged.line_total = "0.03";
  request.total_amount = "110.03";
  return new TextEncoder().encode(JSON.stringify(request));
}

test("commande forgée à 0,01 € sur une ligne « rq- » : C0 l'accepterait, le SITE la refuse (QUOTE_ONLY), rien d'écrit", async () => {
  await setCjsWindow("rq-402-A", "0.01");
  const c = businessCase("F_QUOTE_ORDER.order_valid");
  const bytes = forgedOrder(c);
  const gen = (await pool.query("SELECT snapshot_json FROM site_generation WHERE status='ACTIVE'")).rows[0].snapshot_json;
  const oracle = c0business.validateOrderSubmit(bytes, { snapshot: gen, status: "ACTIVE" }, [], c.now);
  assert.equal(oracle.accepted, true, "preuve : sans le refus du SITE, la validation C0 laisserait passer cette commande");
  assert.equal(oracle.outcome, "RECEIVED");

  const res = await submit(pool, "order", bytes, c.now);
  assert.equal(res.status, 409);
  assert.equal(res.body.accepted, false);
  assert.equal(res.body.durable, false);
  assert.equal(res.body.outcome, "REJECTED");
  assert.deepEqual(res.body.error_codes, ["QUOTE_ONLY"]);
  assert.equal(res.body.receipt_ref, undefined);
  assert.equal(res.body.access_token, undefined);
  assert.deepEqual(await counts(pool), ZERO, "aucune commande, ligne, idempotence ni événement");
  const log = (await pool.query("SELECT operation, outcome, error_codes FROM site_transaction_log ORDER BY id DESC LIMIT 1")).rows[0];
  assert.deepEqual([log.operation, log.outcome, log.error_codes], ["ORDER", "REJECTED", ["QUOTE_ONLY"]]);
});

test("la même commande est refusée à chaque envoi (aucun reçu mémorisé qui la ferait passer au rejeu)", async () => {
  const c = businessCase("F_QUOTE_ORDER.order_valid");
  const again = await submit(pool, "order", forgedOrder(c), c.now);
  assert.equal(again.status, 409);
  assert.deepEqual(again.body.error_codes, ["QUOTE_ONLY"]);
  assert.deepEqual(await counts(pool), ZERO);
});

test("une commande sur une ligne normale reste acceptée dans la même génération (le refus ne vise que « rq- »)", async () => {
  const c = businessCase("F_QUOTE_ORDER.order_valid");
  const request = JSON.parse(Buffer.from(c.bytes).toString("utf8"));
  request.lines = [request.lines[0]];
  request.total_amount = request.lines[0].line_total;
  request.idempotency_key = "qo-normal-line-0001";
  const res = await submit(pool, "order", new TextEncoder().encode(JSON.stringify(request)), c.now);
  assert.equal(res.status, 200, JSON.stringify(res.body).slice(0, 300));
  assert.equal(res.body.accepted, true);
  assert.equal(res.body.receipt.lines[0].rate_id, "R-401-T10");
  assert.equal((await counts(pool)).site_order, 1);
});

test("devis non chiffré (displayed: null) sur la ligne « rq- » → RECEIVED, aucune donnée de prix enregistrée", async () => {
  const c = businessCase("F_QUOTE_ORDER.quote_unpriced_no_window");
  const request = JSON.parse(Buffer.from(c.bytes).toString("utf8"));
  assert.equal(request.lines[0].public_item_key, "PI-000000CJS");
  assert.equal(request.lines[0].displayed, null);
  request.idempotency_key = "qo-quote-unpriced-0001";
  const res = await submit(pool, "quote_request", new TextEncoder().encode(JSON.stringify(request)), c.now);
  assert.equal(res.status, 200, JSON.stringify(res.body).slice(0, 300));
  assert.equal(res.body.receipt.lines[0].priced, false);
  assert.equal(res.body.receipt.lines[0].unit_amount, null);
  assert.equal(res.body.receipt.lines[0].rate_id, null);
  assert.doesNotMatch(JSON.stringify(res.body), /0\.01|rq-/);
});

test("réversible : fenêtre rétablie en R-402-A / 5.25, la commande à 5.25 passe de nouveau", async () => {
  await setCjsWindow("R-402-A", "5.25");
  const c = businessCase("F_QUOTE_ORDER.order_valid");
  const request = JSON.parse(Buffer.from(c.bytes).toString("utf8"));
  request.idempotency_key = "qo-reversible-0001";
  const res = await submit(pool, "order", new TextEncoder().encode(JSON.stringify(request)), c.now);
  assert.equal(res.status, 200, JSON.stringify(res.body).slice(0, 300));
  assert.equal(res.body.receipt.total_amount, "125.75");
});
