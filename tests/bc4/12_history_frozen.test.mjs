// Famille 12 — historique figé : une nouvelle génération ACTIVE après une commande ne change ni les lignes figées,
// ni le reçu ; le rejeu de la même requête rend le reçu d'origine (idempotence avant génération) ; une nouvelle
// commande sur l'ancienne séquence est CART_STALE. Générations : F_IDENTITY.activate_gen_a → activate_gen_b_same_keys
// → activate_gen_c_tombstones (receiver BC2). Commande construite depuis selectPrice C0 sur gen_a (aucun prix inventé).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { activate, c0business, newPool, receipt, resetDb, siteDb, submit } from "./helpers.mjs";

let pool;
let created;
let request;
let snapshotLines;
const NOW_A = "2026-10-20T12:00:00Z";
const CONTACT = { organisation_name: "STAGING_FIXTURE Organisation", contact_name: "STAGING_FIXTURE Contact", email: "achats@example.invalid", phone: null };

async function frozen() {
  return (await pool.query("SELECT l.* FROM site_order_line l JOIN site_order o ON o.id = l.order_id WHERE o.order_ref = $1 ORDER BY line_no", [created.receipt_ref])).rows;
}

before(async () => {
  await resetDb();
  pool = newPool();
  await activate(pool, "F_IDENTITY.activate_gen_a");
  const gen = await siteDb.getActiveGeneration(pool);
  const generation = { snapshot: gen.snapshot, status: gen.status };
  const lines = [];
  let total = 0n;
  for (const family of gen.snapshot.families) {
    for (const item of family.items) {
      const sel = c0business.selectPrice(generation, item.public_item_key, item.variant_axes, 2, NOW_A);
      if (!sel.accepted) continue;
      const unit = BigInt(sel.selection.unit_amount.replace(".", ""));
      const lt = unit * 2n;
      total += lt;
      const money = (c) => `${c / 100n}.${String(c % 100n).padStart(2, "0")}`;
      lines.push({ public_item_key: item.public_item_key, variant_axes: item.variant_axes, quantity: 2, rate_id: sel.selection.rate_id, unit_amount: sel.selection.unit_amount, line_total: money(lt) });
      if (lines.length === 2) break;
    }
    if (lines.length === 2) break;
  }
  assert.ok(lines.length >= 1, "gen_a doit offrir au moins un Item chiffrable à l'instant choisi");
  const money = (c) => `${c / 100n}.${String(c % 100n).padStart(2, "0")}`;
  request = { contract_version: "site_business.v1", kind: "order", idempotency_key: "order:history:0001", catalogue_sequence: gen.catalogue_sequence, contact: CONTACT, currency: "EUR", total_amount: money(total), lines };
  const res = await submit(pool, "order", JSON.stringify(request), NOW_A);
  assert.equal(res.body.outcome, "RECEIVED", JSON.stringify(res.body));
  created = res.body;
  snapshotLines = await frozen();
});
after(async () => { await pool.end(); });

test("activations gen_b puis gen_c → lignes figées, reçu et total inchangés à la relecture", async () => {
  const seqBefore = (await siteDb.getActiveGeneration(pool)).catalogue_sequence;
  await activate(pool, "F_IDENTITY.activate_gen_b_same_keys");
  await activate(pool, "F_IDENTITY.activate_gen_c_tombstones");
  const seqAfter = (await siteDb.getActiveGeneration(pool)).catalogue_sequence;
  assert.ok(seqAfter > seqBefore, "la génération ACTIVE a bien changé");
  assert.deepEqual(await frozen(), snapshotLines, "lignes (prix, rate_id, version, quantité, séquence) inchangées");
  assert.ok(snapshotLines.every((l) => Number(l.catalogue_sequence) === seqBefore));
  const r = await receipt.getReceipt({ pool }, new URLSearchParams({ ref: created.receipt_ref, access_token: created.access_token }));
  const body = JSON.parse(Buffer.from(r.body).toString("utf8"));
  assert.equal(r.status, 200);
  assert.deepEqual(body.receipt, created.receipt);
  const ev = (await pool.query("SELECT catalogue_sequence FROM site_outbox_event WHERE object_ref = $1", [created.receipt_ref])).rows[0];
  assert.equal(Number(ev.catalogue_sequence), seqBefore);
});

test("rejeu de la même requête après la nouvelle activation → REPLAY_SAME_RECEIPT (reçu d'origine), pas CART_STALE", async () => {
  const res = await submit(pool, "order", JSON.stringify(request), "2026-10-22T12:00:00Z");
  assert.equal(res.body.outcome, "REPLAY_SAME_RECEIPT");
  assert.deepEqual(res.body.receipt, created.receipt);
});

test("nouvelle commande sur l'ancienne séquence → CART_STALE 409, 0 écriture", async () => {
  const before = (await pool.query("SELECT count(*)::int AS n FROM site_order")).rows[0].n;
  const res = await submit(pool, "order", JSON.stringify({ ...request, idempotency_key: "order:history:0002" }), "2026-10-22T12:00:00Z");
  assert.equal(res.status, 409);
  assert.deepEqual(res.body.error_codes, ["CART_STALE"]);
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM site_order")).rows[0].n, before);
});
