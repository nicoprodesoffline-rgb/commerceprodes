// W6-P : `selectPriceOnServed` rend EXACTEMENT ce que rend `selectPrice` de C0, avec ou sans Generation réutilisée ;
// seul un document vérifié par site-db (gelé, SHA contrôlé) peut réutiliser une Generation ; tout autre document
// repasse par `selectPrice` (jamais de résultat périmé après modification d'un objet non vérifié).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, rmSync } from "node:fs";
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

// Relecture 8f [RV-P6] : le test « copie modifiée » ci-dessus ne distingue pas un registre contourné (une modification en
// place est vue parce que la Generation garde des références vers les mêmes objets). Ici : changement STRUCTUREL
// (retrait au registre d'identité), invisible d'une Generation mémorisée pour un document qui ne serait pas vérifié.
function structuralScenario(selectPriceOnServed, active) {
  const copy = JSON.parse(JSON.stringify(active.snapshot));
  const item = copy.families[0].items[0];
  const args = [item.public_item_key, item.variant_axes, item.public_sell_price_windows[0].quantity_min, "2026-10-27T10:00:00Z"];
  const g = { snapshot: copy, status: "ACTIVE" };
  assert.equal(selectPriceOnServed(g, ...args).accepted, true);
  copy.identity_registry.push({ public_item_key: item.public_item_key, status: "RETIRED", superseded_by: null });
  assert.equal(selectPriceOnServed(g, ...args).accepted, false, "un Item retiré au registre ne doit plus être vendu (pas de Generation périmée réutilisée)");
}

test("[RV-P6] document non vérifié modifié STRUCTURELLEMENT (retrait au registre) : jamais de prix périmé", async () => {
  structuralScenario(served.selectPriceOnServed, await siteDb.getActiveGeneration(pool));
});

test("garde-fou discriminant : le mutant « isVerified toujours vrai » est refusé par RV-P6 (rouge) alors que l'original passe (vert)", async () => {
  const dir = join(ROOT, ".bc2-build", "lib", "site-db");
  const mutVerified = join(dir, "verified.rv6.js");
  const mutServed = join(dir, "select-price.rv6.js");
  const vSrc = readFileSync(join(dir, "verified.js"), "utf8");
  assert.ok(vSrc.includes("verified.has(doc)"), "repère du registre dans le JS compilé");
  writeFileSync(mutVerified, vSrc.replace(/function isVerified\(doc\) \{[\s\S]*?\n\}/, "function isVerified(doc) { return true; }"));
  const sSrc = readFileSync(join(dir, "select-price.js"), "utf8");
  assert.ok(sSrc.includes('require("./verified")'), "import du registre repéré");
  writeFileSync(mutServed, sSrc.replace('require("./verified")', 'require("./verified.rv6")'));
  try {
    delete require.cache[mutServed];
    const mutant = require(mutServed);
    const live = await siteDb.getActiveGeneration(pool);
    assert.throws(() => structuralScenario(mutant.selectPriceOnServed, live), assert.AssertionError, "le mutant doit échouer à RV-P6");
  } finally {
    rmSync(mutVerified, { force: true });
    rmSync(mutServed, { force: true });
    delete require.cache[mutServed];
    delete require.cache[mutVerified];
  }
  structuralScenario(served.selectPriceOnServed, await siteDb.getActiveGeneration(pool)); // original : vert
});

test("isVerified exige aussi le gel : objet inscrit mais non gelé -> non vérifié", async () => {
  const obj = { a: { b: 1 } };
  verified.markVerified(obj);
  assert.equal(verified.isVerified(obj), false, "inscrit mais non gelé");
  Object.freeze(obj);
  assert.equal(verified.isVerified(obj), true, "inscrit et gelé");
  assert.equal(verified.isVerified(Object.freeze({})), false, "gelé mais jamais inscrit");
  const active = await siteDb.getActiveGeneration(pool);
  assert.equal(verified.isVerified(active.snapshot), true);
});
