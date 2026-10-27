// W6-P : `selectPriceOnServed` rend EXACTEMENT ce que rend `selectPrice` de C0, avec ou sans Generation réutilisée ;
// seul un document vérifié par site-db (gelé, SHA contrôlé) peut réutiliser une Generation ; tout autre document
// repasse par `selectPrice` (jamais de résultat périmé après modification d'un objet non vérifié).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { join } from "node:path";
import { ROOT, activateBase, newPool, resetDb, siteDb } from "./helpers.mjs";

const require = createRequire(import.meta.url);
const served = require(join(ROOT, ".bc2-build", "lib", "site-db", "select-price.js"));
const verified = require(join(ROOT, ".bc2-build", "lib", "site-db", "verified.js"));
const c0 = require(join(ROOT, ".bc2-build", "c0", "ts", "src", "business.js"));

let pool;
before(async () => { await resetDb(); pool = newPool(); await activateBase(pool); siteDb.resetGenerationCache(); });
after(async () => { await pool.end(); });

function allCalls(doc) {
  const calls = [];
  for (const f of doc.families) for (const item of f.items) {
    const qs = new Set([1, 2, 1000]);
    for (const w of item.public_sell_price_windows) qs.add(w.quantity_min);
    for (const q of qs) for (const t of ["2026-10-27T10:00:00Z", "2000-01-01T00:00:00Z", "2099-12-31T23:59:59Z"]) calls.push([item.public_item_key, item.variant_axes, q, t]);
  }
  calls.push(["PI-INCONNU", {}, 1, "2026-10-27T10:00:00Z"], ["PI-00000000X", {}, 0, "2026-10-27T10:00:00Z"]);
  return calls;
}

test("document vérifié : même résultat que selectPrice de C0, Generation réutilisée", async () => {
  const active = await siteDb.getActiveGeneration(pool);
  assert.equal(verified.isVerified(active.snapshot), true, "le document rendu par site-db est enregistré comme vérifié");
  const g = { snapshot: active.snapshot, status: "ACTIVE" };
  const calls = allCalls(active.snapshot);
  assert.ok(calls.length > 10);
  for (let round = 0; round < 2; round += 1) {
    for (const [k, a, q, t] of calls) assert.deepEqual(served.selectPriceOnServed(g, k, a, q, t), c0.selectPrice(g, k, a, q, t), `tour ${round} ${k} q=${q} @${t}`);
  }
});

test("document NON vérifié (copie) : repasse par selectPrice, jamais de résultat périmé après modification", async () => {
  const active = await siteDb.getActiveGeneration(pool);
  const copy = JSON.parse(JSON.stringify(active.snapshot));
  assert.equal(verified.isVerified(copy), false);
  const item = copy.families[0].items[0];
  const args = [item.public_item_key, item.variant_axes, item.public_sell_price_windows[0].quantity_min, "2026-10-27T10:00:00Z"];
  const g = { snapshot: copy, status: "ACTIVE" };
  const before = served.selectPriceOnServed(g, ...args);
  item.public_sell_price_windows[0].unit_amount = "0.01";
  const afterEdit = served.selectPriceOnServed(g, ...args);
  assert.deepEqual(afterEdit, c0.selectPrice(g, ...args));
  assert.notDeepEqual(afterEdit, before, "la modification de l'objet non vérifié est vue (pas de Generation mémorisée)");
});

test("UNSAFE et document vérifié : mêmes verdicts que selectPrice", async () => {
  const active = await siteDb.getActiveGeneration(pool);
  const g = { snapshot: active.snapshot, status: "UNSAFE" };
  const item = active.snapshot.families[0].items[0];
  const args = [item.public_item_key, item.variant_axes, 1, "2026-10-27T10:00:00Z"];
  assert.deepEqual(served.selectPriceOnServed(g, ...args), c0.selectPrice(g, ...args));
  assert.deepEqual(served.selectPriceOnServed(g, ...args).error_codes, ["CATALOG_UNSAFE"]);
});
