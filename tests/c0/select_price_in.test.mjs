// W6-P (levée ciblée du gel C0, Owner A14) : `selectPriceIn(new Generation(g), …)` DOIT rendre exactement ce que rend
// `selectPrice(g, …)`, sur tous les documents de fixtures C0, tous les Items, tous les paliers, des instants aux
// frontières de chaque fenêtre, et des arguments invalides ; mêmes exceptions pour une génération invalide.
// Prérequis : `npm run c0:build` (c0/ts/dist).
import { test } from "node:test";
import * as assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);
const DIST = join(ROOT, "c0", "ts", "dist", "src");
assert.ok(existsSync(join(DIST, "business.js")), "c0/ts/dist absent : lancer `npm run c0:build` d'abord");
const { Generation, selectPrice, selectPriceIn } = require(join(DIST, "business.js"));
const { parseBytes } = require(join(DIST, "jsonc.js"));
const { shapeOk } = require(join(DIST, "snapshot.js"));

function* documents() {
  const base = join(ROOT, "c0", "fixtures", "documents");
  for (const scenario of readdirSync(base)) {
    for (const name of readdirSync(join(base, scenario))) {
      if (!name.endsWith(".json")) continue;
      let doc;
      try { doc = parseBytes(new Uint8Array(readFileSync(join(base, scenario, name))), 64 << 20); } catch { continue; }
      if (doc && typeof doc === "object" && doc.contract_version === "site_snapshot.v1" && shapeOk(doc)) yield [`${scenario}/${name}`, doc];
    }
  }
}

function instantsOf(item) {
  const out = new Set(["2000-01-01T00:00:00Z", "2099-12-31T23:59:59Z", "2026-10-27T10:00:00Z"]);
  const shift = (utc, s) => new Date(Date.parse(utc) + s * 1000).toISOString().replace(".000Z", "Z");
  for (const w of item.public_sell_price_windows) {
    for (const edge of [w.valid_from_utc, w.valid_until_utc]) if (edge) for (const d of [-1, 0, 1]) out.add(shift(edge, d));
  }
  return [...out];
}

test("selectPriceIn(new Generation(g)) == selectPrice(g) sur tous les documents, Items, paliers et instants de fixtures", () => {
  let docs = 0;
  let calls = 0;
  for (const [label, doc] of documents()) {
    docs += 1;
    for (const status of ["ACTIVE", "UNSAFE"]) {
      const g = { snapshot: doc, status };
      const built = new Generation(g);
      for (const family of doc.families) {
        for (const item of family.items) {
          const tiers = new Set([1, 2, 1000, 0, 100000001]);
          for (const w of item.public_sell_price_windows) { tiers.add(w.quantity_min); if (w.quantity_max !== null) tiers.add(w.quantity_max + 1); }
          for (const quantity of tiers) {
            for (const instant of instantsOf(item)) {
              const direct = selectPrice(g, item.public_item_key, item.variant_axes, quantity, instant);
              const viaIn = selectPriceIn(built, item.public_item_key, item.variant_axes, quantity, instant);
              assert.deepEqual(viaIn, direct, `${label} ${status} ${item.public_item_key} q=${quantity} @${instant}`);
              calls += 1;
            }
          }
        }
      }
      // Arguments invalides et Items inconnus / retirés : mêmes verdicts.
      const bad = [["PI-INCONNU", {}, 1, "2026-10-27T10:00:00Z"], ["PI-00000000X", { x: 1 }, 1, "2026-10-27T10:00:00Z"], [42, {}, 1, "2026-10-27T10:00:00Z"],
        ["PI-00000000X", {}, 1, "pas-un-instant"], ["PI-00000000X", {}, 1.5, "2026-10-27T10:00:00Z"]];
      for (const [k, a, q, t] of bad) {
        assert.deepEqual(selectPriceIn(built, k, a, q, t), selectPrice(g, k, a, q, t), `${label} ${status} invalide ${JSON.stringify([k, a, q, t])}`);
        calls += 1;
      }
      for (const entry of doc.identity_registry) {
        assert.deepEqual(selectPriceIn(built, entry.public_item_key, {}, 1, "2026-10-27T10:00:00Z"), selectPrice(g, entry.public_item_key, {}, 1, "2026-10-27T10:00:00Z"));
        calls += 1;
      }
    }
  }
  assert.ok(docs >= 1, "aucun document de fixture exploité : le test ne prouve rien");
  assert.ok(calls > 200, `trop peu de comparaisons (${calls}) : le test ne prouve rien`);
});

test("génération invalide : mêmes exceptions par selectPrice et par new Generation", () => {
  for (const g of [null, {}, { snapshot: {}, status: "ACTIVE" }, { snapshot: null, status: "ACTIVE" }, { snapshot: {}, status: "AUTRE" }]) {
    let direct;
    let built;
    try { selectPrice(g, "PI-00000000X", {}, 1, "2026-10-27T10:00:00Z"); } catch (e) { direct = e.message; }
    try { new Generation(g); } catch (e) { built = e.message; }
    assert.ok(direct !== undefined, "selectPrice doit lever sur une génération invalide");
    assert.equal(built, direct);
  }
});
