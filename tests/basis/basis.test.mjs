// Friction 14 — la règle du regroupement de la base fiscale (fonction pure) : node --test tests/basis/*.test.mjs (Node 22, types retirés à l'import).
import { test } from "node:test";
import assert from "node:assert/strict";
import { basisNoticeText, totalBasisLabel, uniformBasis } from "../../components/site/format.ts";

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

test("la base d'un TOTAL est toujours dite : unique → celle des lignes ; aucune ligne ne porte de base → « non précisée » ; plusieurs → les bases réellement présentes, nommées", () => {
  const NP = "(base fiscale non précisée)";
  assert.equal(totalBasisLabel([]), NP, "aucune ligne chiffrée");
  assert.equal(totalBasisLabel([null]), NP, "aucune base portée (null)");
  assert.equal(totalBasisLabel([undefined, ""]), NP, "aucune base portée (absente, vide)");
  assert.equal(totalBasisLabel(["HT", "HT"]), "HT");
  assert.equal(totalBasisLabel(["UNQUALIFIED", "UNQUALIFIED"]), NP);
  assert.equal(totalBasisLabel(["TTC"]), "(base inconnue)");
  assert.equal(totalBasisLabel(["HT", "UNQUALIFIED"]), "(bases fiscales différentes : HT et non précisée)");
  assert.equal(totalBasisLabel(["UNQUALIFIED", "HT"]), "(bases fiscales différentes : HT et non précisée)", "l'ordre des lignes ne change pas le libellé");
  assert.equal(totalBasisLabel(["HT", null]), "(bases fiscales différentes : HT et inconnue)", "le libellé ne prétend plus « HT et non précisée »");
  assert.equal(totalBasisLabel(["HT", "TTC"]), "(bases fiscales différentes : HT et inconnue)");
  assert.equal(totalBasisLabel(["UNQUALIFIED", null]), "(bases fiscales différentes : non précisée et inconnue)");
  assert.equal(totalBasisLabel(["HT", "UNQUALIFIED", "TTC"]), "(bases fiscales différentes : HT, non précisée et inconnue)");
});
