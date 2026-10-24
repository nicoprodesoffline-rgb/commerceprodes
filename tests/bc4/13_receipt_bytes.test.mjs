// Review F-03 — le reçu d'un rejeu (séquentiel, concurrent, lignes réordonnées) et de la consultation est identique
// OCTET POUR OCTET à celui de la première réponse : octets canoniques (canonicalBytes C0) stockés dans
// site_idempotency.receipt_bytes (migration 016) et recopiés tels quels. Cas : F_QUOTE_ORDER.order_valid,
// order_double_post_same_key, order_replay_lines_reordered, quote_priced, quote_double_post.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { activate, barrier, businessCase, jsonc, newPool, receipt, receiptSlice, resetDb, submit } from "./helpers.mjs";

let pool;
before(async () => { await resetDb(); pool = newPool(10); await activate(pool, "F_SELL_WINDOWS.activate"); });
after(async () => { await pool.end(); });

const sha = (b) => createHash("sha256").update(b).digest("hex");

function sameBytes(a, b, what) {
  assert.ok(Buffer.from(a).equals(Buffer.from(b)), `${what} : octets différents\n${Buffer.from(a)}\n${Buffer.from(b)}`);
}

test("commande : création, rejeu, lignes réordonnées, rejeu tardif, consultation → même octets de reçu (canoniques, stockés)", async () => {
  const c = businessCase("F_QUOTE_ORDER.order_valid");
  const first = await submit(pool, "order", c.bytes, c.now);
  assert.equal(first.body.outcome, "RECEIVED");
  const bytes0 = receiptSlice(first.raw);
  assert.ok(jsonc.isCanonical(bytes0, jsonc.parseBytes(bytes0, 1 << 20)), "reçu en octets canoniques C0");
  assert.equal(first.headers["x-site-receipt-sha256"], sha(bytes0));
  const stored = (await pool.query("SELECT receipt_bytes FROM site_idempotency WHERE receipt_ref = $1", [first.body.receipt_ref])).rows[0].receipt_bytes;
  sameBytes(bytes0, stored, "stocké");

  const replays = [
    await submit(pool, "order", businessCase("F_QUOTE_ORDER.order_double_post_same_key").bytes, c.now),
    await submit(pool, "order", businessCase("F_QUOTE_ORDER.order_replay_lines_reordered").bytes, c.now),
    await submit(pool, "order", c.bytes, "2027-01-01T00:00:00Z"),
  ];
  for (const r of replays) {
    assert.equal(r.body.outcome, "REPLAY_SAME_RECEIPT");
    sameBytes(receiptSlice(r.raw), bytes0, "rejeu");
    assert.equal(r.headers["x-site-receipt-sha256"], sha(bytes0));
  }
  const look = await receipt.getReceipt({ pool }, new URLSearchParams({ ref: first.body.receipt_ref, access_token: first.body.access_token }));
  sameBytes(receiptSlice(new Uint8Array(look.body)), bytes0, "consultation");
  assert.equal(look.headers["x-site-receipt-sha256"], sha(bytes0));
});

test("première réponse et rejeu : corps identiques hors outcome, instant_utc et access_token", async () => {
  const c = businessCase("F_QUOTE_ORDER.quote_priced");
  const first = await submit(pool, "quote_request", c.bytes, c.now);
  const again = await submit(pool, "quote_request", businessCase("F_QUOTE_ORDER.quote_double_post").bytes, c.now);
  const strip = (b) => { const { outcome, instant_utc, access_token, ...rest } = b; return rest; };
  assert.deepEqual(strip(again.body), strip(first.body));
  sameBytes(receiptSlice(again.raw), receiptSlice(first.raw), "devis rejoué");
});

test("course CE-T03 (barrière) : gagnant et perdant renvoient les mêmes octets de reçu", async () => {
  const o = JSON.parse(Buffer.from(businessCase("F_QUOTE_ORDER.order_valid").bytes).toString("utf8"));
  o.idempotency_key = "order:bytes:race";
  const wait = barrier(2);
  const rs = await Promise.all([1, 2].map(() => submit(pool, "order", JSON.stringify(o), "2026-10-20T09:00:00Z", { afterValidate: wait })));
  assert.deepEqual(rs.map((r) => r.body.outcome).sort(), ["RECEIVED", "REPLAY_SAME_RECEIPT"]);
  sameBytes(receiptSlice(rs[0].raw), receiptSlice(rs[1].raw), "course");
});
