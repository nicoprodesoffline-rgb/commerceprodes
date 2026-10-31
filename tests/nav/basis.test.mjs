// S1-A I4 — le site n'affirme jamais une base fiscale que la génération ACTIVE ne déclare pas : « HT » seulement si TOUTES les fenêtres de prix le déclarent. Fonction pure.
import { test } from "node:test";
import assert from "node:assert/strict";
import { catalogBasis, NEUTRAL_BASIS_TEXT } from "../../lib/site-catalog/basis.ts";

const fam = (...bases) => ({ items: [{ windows: bases.map((b) => ({ tax_basis_or_status: b })) }] });

test("toutes les fenêtres déclarent HT : le site peut dire « Prix HT »", () => {
  assert.equal(catalogBasis([fam("HT", "HT"), fam("HT")]), "HT");
});

test("base « non précisée » (UNQUALIFIED) : jamais « Prix HT », formule neutre", () => {
  assert.equal(catalogBasis([fam("UNQUALIFIED"), fam("UNQUALIFIED")]), "NOT_DECLARED");
});

test("bases mêlées (une seule fenêtre non HT) : jamais « Prix HT »", () => {
  assert.equal(catalogBasis([fam("HT", "HT"), fam("HT", "UNQUALIFIED")]), "NOT_DECLARED");
  assert.equal(catalogBasis([fam("HT"), fam("TTC")]), "NOT_DECLARED");
});

test("aucun prix publié : on ne déclare rien", () => {
  assert.equal(catalogBasis([]), "NOT_DECLARED");
  assert.equal(catalogBasis([{ items: [{ windows: [] }] }]), "NOT_DECLARED");
});

test("la formule neutre ne nomme aucune base", () => {
  assert.equal(NEUTRAL_BASIS_TEXT, "Les prix et la base fiscale sont précisés sur le devis.");
  assert.doesNotMatch(NEUTRAL_BASIS_TEXT, /\bHT\b|hors taxes|TTC/);
});

test("le résultat est mémorisé par publication (même clé = même réponse sans relire les fenêtres)", () => {
  const key = "sha-test-1";
  assert.equal(catalogBasis([fam("HT")], key), "HT");
  assert.equal(catalogBasis([fam("UNQUALIFIED")], key), "HT");
});
