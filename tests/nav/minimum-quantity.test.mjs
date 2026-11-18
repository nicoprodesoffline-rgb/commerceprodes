import { test } from "node:test";
import assert from "node:assert/strict";
import { minimumQuantity } from "../../components/product/minimum-quantity.ts";

test("le minimum est le plus petit palier publié, même sans prix sélectionné", () => {
  assert.equal(minimumQuantity([{ tier_quantity: 24 }, { tier_quantity: 6 }, { tier_quantity: 12 }]), 6);
  assert.equal(minimumQuantity([{ tier_quantity: 8, selected: false }]), 8);
  assert.equal(minimumQuantity([{ tier_quantity: 5 }, { tier_quantity: 1 }]), 1);
});

test("sans palier exploitable le minimum reste 1 ; les lignes ne sont pas modifiées", () => {
  assert.equal(minimumQuantity([]), 1);
  assert.equal(minimumQuantity([{ tier_quantity: 0 }, { tier_quantity: -2 }, { tier_quantity: NaN }, { tier_quantity: 1.5 }]), 1);
  const rows = Object.freeze([Object.freeze({ tier_quantity: 10 }), Object.freeze({ tier_quantity: 3 })]);
  assert.equal(minimumQuantity(rows), 3);
});
