// Friction 14 — la règle du regroupement de la base fiscale (fonction pure) : node --test tests/basis/*.test.mjs (Node 22, types retirés à l'import).
import { test } from "node:test";
import assert from "node:assert/strict";
import { basisNoticeText, uniformBasis } from "../../components/site/format.ts";

test("toutes les lignes « non précisée » : regroupées, dites une fois", () => {
  assert.deepEqual(uniformBasis(["UNQUALIFIED", "UNQUALIFIED", "UNQUALIFIED"]), { uniform: true, basis: "UNQUALIFIED" });
  assert.deepEqual(uniformBasis(["UNQUALIFIED"]), { uniform: true, basis: "UNQUALIFIED" });
});

test("jamais de regroupement pour une base qualifiée, inconnue, mêlée ou absente : chaque ligne garde la sienne", () => {
  for (const bases of [["HT", "HT"], ["HT"], [null], [undefined], [""], ["UNQUALIFIED", "HT"], ["UNQUALIFIED", null], ["UNQUALIFIED", "TTC"], []]) {
    assert.deepEqual(uniformBasis(bases), { uniform: false }, JSON.stringify(bases));
  }
});

test("le bandeau dit ce que la publication dit : non précisée, ni HT ni TTC, taxes et port non calculés", () => {
  const text = basisNoticeText();
  assert.match(text, /non précisée/);
  assert.match(text, /ni HT ni TTC/);
  assert.match(text, /non calculés/);
});
