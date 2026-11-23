// Circle 7, line 7.9 (issue #131): a family has as many axes as it has. TypeScript twin of tests/contracts/test_c0_axes_without_maximum.py.

import { test } from "node:test";
import * as assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Json, JsonObject, parseBytes } from "../src/jsonc";
import { Snapshot, semanticFindings, shapeProblem } from "../src/snapshot";
import { FIXTURES, FIXTURE_MAX_BYTES } from "../src/runner";

const base = parseBytes(readFileSync(join(FIXTURES, "documents", "F_GMCE_VARIANTS", "snapshot_s1.json")), FIXTURE_MAX_BYTES) as JsonObject;

/** The first family with at least two items, given `count` axes: the first axis tells the items apart. */
function widened(count: number): JsonObject {
  const doc = JSON.parse(JSON.stringify(base)) as JsonObject;
  const family = (doc["families"] as JsonObject[]).find((f) => (f["items"] as Json[]).length >= 2) as JsonObject;
  const keys = Array.from({ length: count }, (_, n) => `axe_${n + 1}`);
  family["axes"] = keys.map((key, n) => ({ axis_key: key, label: `Axe ${n + 1}` }));
  (family["items"] as JsonObject[]).forEach((item, index) => {
    item["variant_axes"] = Object.fromEntries(keys.map((key, n) => [key, n === 0 ? `valeur ${index}` : "commune"]));
  });
  return doc;
}

function familyOf(doc: JsonObject, count: number): JsonObject {
  return (doc["families"] as JsonObject[]).find((f) => (f["axes"] as Json[]).length === count) as JsonObject;
}

test("a family of 8, 9 and 12 axes passes the shape and the semantic checks", () => {
  for (const count of [8, 9, 12]) {
    const doc = widened(count);
    assert.equal(shapeProblem(doc), null, `${count} axes`);
    assert.deepEqual(semanticFindings(doc as unknown as Snapshot), [[], []], `${count} axes`);
  }
});

test("the other checks of an axis still refuse", () => {
  const badKey = widened(9);
  (familyOf(badKey, 9)["axes"] as JsonObject[])[4]!["axis_key"] = "Axe 5";
  assert.equal(shapeProblem(badKey), "family.axes");

  const twice = widened(9);
  const axes = familyOf(twice, 9)["axes"] as JsonObject[];
  axes[8]!["axis_key"] = axes[0]!["axis_key"] as string;
  assert.ok(semanticFindings(twice as unknown as Snapshot)[1].includes("family.axes_unique"));

  const lacking = widened(12);
  delete ((familyOf(lacking, 12)["items"] as JsonObject[])[0]!["variant_axes"] as JsonObject)["axe_12"];
  assert.ok(semanticFindings(lacking as unknown as Snapshot)[1].includes("item.axes_match_family"));

  const same = widened(9);
  const items = familyOf(same, 9)["items"] as JsonObject[];
  items[1]!["variant_axes"] = { ...(items[0]!["variant_axes"] as JsonObject) };
  assert.ok(semanticFindings(same as unknown as Snapshot)[1].includes("family.combination_unique"));
});
