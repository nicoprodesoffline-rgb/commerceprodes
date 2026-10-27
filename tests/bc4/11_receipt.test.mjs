// Famille 11 — consultation : bon jeton → reçu ; jeton absent → 401 UNAUTHORIZED ; faux jeton → 404 NOT_FOUND ;
// référence inconnue → 404 strictement identique. Cas C0 : F_QUOTE_ORDER.lookup_found, lookup_no_token,
// lookup_token_key_absent, lookup_wrong_token, lookup_unknown_ref (+ reçu issu de F_QUOTE_ORDER.order_valid / quote_priced).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { VERDICTS, activate, businessCase, newPool, receipt, resetDb, submit } from "./helpers.mjs";

let pool;
let order;
let quote;
before(async () => {
  await resetDb();
  pool = newPool();
  await activate(pool, "F_SELL_WINDOWS.activate");
  const o = businessCase("F_QUOTE_ORDER.order_valid");
  order = (await submit(pool, "order", o.bytes, o.now)).body;
  const q = businessCase("F_QUOTE_ORDER.quote_priced");
  quote = (await submit(pool, "quote_request", q.bytes, q.now)).body;
});
after(async () => { await pool.end(); });

async function lookup(query) {
  const r = await receipt.getReceipt({ pool }, new URLSearchParams(query));
  return { status: r.status, text: Buffer.from(r.body).toString("utf8"), body: JSON.parse(Buffer.from(r.body).toString("utf8")) };
}

test("bon jeton → 200 FOUND, reçu d'origine (commande et devis) — F_QUOTE_ORDER.lookup_found", async () => {
  assert.equal(VERDICTS["F_QUOTE_ORDER.lookup_found"].outcome, "FOUND");
  for (const created of [order, quote]) {
    const r = await lookup({ ref: created.receipt_ref, access_token: created.access_token });
    assert.equal(r.status, 200);
    assert.equal(r.body.outcome, "FOUND");
    assert.deepEqual(r.body.receipt, created.receipt);
    assert.equal(r.body.status, "RECEIVED");
    assert.ok(!r.text.includes("example.invalid"), "pas de PII dans le reçu");
    assert.ok(!r.text.includes(created.access_token), "le jeton n'est jamais renvoyé par la consultation");
  }
});

test("jeton absent (clé omise), vide → 401 UNAUTHORIZED — lookup_token_key_absent, lookup_no_token", async () => {
  for (const q of [{ ref: order.receipt_ref }, { ref: order.receipt_ref, access_token: "" }]) {
    const r = await lookup(q);
    assert.equal(r.status, 401);
    assert.deepEqual(r.body.error_codes, ["UNAUTHORIZED"]);
  }
  assert.deepEqual(VERDICTS["F_QUOTE_ORDER.lookup_token_key_absent"].error_codes, ["UNAUTHORIZED"]);
  assert.deepEqual(VERDICTS["F_QUOTE_ORDER.lookup_no_token"].error_codes, ["UNAUTHORIZED"]);
});

test("faux jeton, jeton d'un autre reçu, réf inconnue, réf mal formée → 404 NOT_FOUND aux octets identiques — lookup_wrong_token, lookup_unknown_ref", async () => {
  const cases = [
    { ref: order.receipt_ref, access_token: "faux-jeton" },
    { ref: order.receipt_ref, access_token: quote.access_token },
    { ref: "ORD-00000000000000000000000000000000", access_token: order.access_token },
    { ref: "pas une ref !", access_token: order.access_token },
    { access_token: order.access_token },
  ];
  const texts = new Set();
  for (const q of cases) {
    const r = await lookup(q);
    assert.equal(r.status, 404, JSON.stringify(q));
    texts.add(r.text);
  }
  assert.equal(texts.size, 1, "réponses indiscernables");
  assert.deepEqual(VERDICTS["F_QUOTE_ORDER.lookup_wrong_token"].error_codes, ["NOT_FOUND"]);
  assert.deepEqual(VERDICTS["F_QUOTE_ORDER.lookup_unknown_ref"].error_codes, ["NOT_FOUND"]);
});

test("le jeton n'existe en base que haché (SHA-256), jamais en clair", async () => {
  const { rows } = await pool.query("SELECT access_token_sha256 FROM site_order UNION ALL SELECT access_token_sha256 FROM site_quote_request");
  const dump = JSON.stringify((await pool.query("SELECT * FROM site_idempotency")).rows) + JSON.stringify((await pool.query("SELECT * FROM site_transaction_log")).rows);
  assert.ok(!dump.includes(order.access_token) && !dump.includes(quote.access_token));
  const { createHash } = await import("node:crypto");
  assert.deepEqual(rows.map((r) => r.access_token_sha256).sort(), [order.access_token, quote.access_token].map((t) => createHash("sha256").update(t).digest("hex")).sort());
});
