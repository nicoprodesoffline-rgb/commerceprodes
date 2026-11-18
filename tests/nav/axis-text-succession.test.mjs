// 4.27 (demande du mastermind) : une valeur d'axe publiée qui passe de « 700 mm » à « 70 cm » (lot U de la Factory) alors que les clés ne changent pas.
// Test de caractérisation : il fixe le comportement d'aujourd'hui sans rien corriger (décision du mastermind, option C).
// Deux catalogues qui ne diffèrent que par ce texte. Prérequis : `npm run c0:build`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { click, compatible } from "../../lib/site-catalog/variant-choice.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);
const DIST = join(ROOT, "c0", "ts", "dist", "src");
const { selectPrice } = require(join(DIST, "business.js"));
const { parseBytes } = require(join(DIST, "jsonc.js"));
const { shapeOk } = require(join(DIST, "snapshot.js"));

function document() {
  const base = join(ROOT, "c0", "fixtures", "documents");
  for (const scenario of readdirSync(base)) for (const name of readdirSync(join(base, scenario))) {
    if (!name.endsWith(".json")) continue;
    let doc; try { doc = parseBytes(new Uint8Array(readFileSync(join(base, scenario, name))), 64 << 20); } catch { continue; }
    if (doc?.contract_version === "site_snapshot.v1" && shapeOk(doc) && doc.families.some((f) => f.items.length >= 2 && f.axes.length > 0)) return doc;
  }
  throw new Error("aucun document de fixtures utilisable");
}

test("« 700 mm » devient « 70 cm » : variante, ligne de panier existante, ancienne adresse", () => {
  const before = structuredClone(document());
  const family = before.families.find((f) => f.items.length >= 2 && f.axes.length > 0);
  const axis = family.axes[0].axis_key;
  const [first, second] = family.items;
  first.variant_axes[axis] = "700 mm";
  second.variant_axes[axis] = "800 mm";
  const after = structuredClone(before);
  const same = after.families.find((f) => f.public_family_key === family.public_family_key);
  same.items[0].variant_axes[axis] = "70 cm";
  assert.deepEqual(JSON.parse(JSON.stringify(after, (k, v) => (k === axis && v === "70 cm" ? "700 mm" : v))), before, "les deux catalogues ne diffèrent que par ce texte");

  // 1. Le choix de variante raisonne sur les clés d'article : il donne les mêmes clés avant et après.
  const view = (doc) => doc.families.find((f) => f.public_family_key === family.public_family_key).items.map((i) => ({ public_item_key: i.public_item_key, variant_axes: i.variant_axes }));
  const a = view(before), b = view(after);
  const target = a[1].variant_axes[axis];
  assert.equal(click(a, { key: a[0].public_item_key, pinned: {} }, axis, target).key, click(b, { key: b[0].public_item_key, pinned: {} }, axis, target).key);
  assert.equal(compatible(b, {}, axis, "70 cm"), true);
  assert.equal(compatible(b, {}, axis, "700 mm"), false);

  // 2. Une ligne de panier enregistrée AVANT : clé d'article + texte d'axe d'avant, contre le catalogue d'après.
  const line = { key: first.public_item_key, axes: { ...first.variant_axes } };
  const instant = "2026-10-27T10:00:00Z";
  const old = selectPrice({ snapshot: before, status: "ACTIVE" }, line.key, line.axes, 1, instant);
  const next = selectPrice({ snapshot: after, status: "ACTIVE" }, line.key, line.axes, 1, instant);
  assert.equal(old.outcome, "SELECTED");
  // CONSTAT (4.27, preuve demandée par le mastermind) : la ligne d'avant n'est plus acceptée, C0 §8 compare le texte de l'axe à l'octet.
  assert.match(readFileSync(join(ROOT, "components/site/codes.ts"), "utf8"), /INVALID_VARIANT: "Cette combinaison d'options n'est pas proposée\."/, "le message affiché à l'acheteur");
  assert.deepEqual([next.accepted, next.outcome, next.error_codes], [false, "REJECTED", ["INVALID_VARIANT"]]);
});
