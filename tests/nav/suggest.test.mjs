// S1-A I2 — suggestions de la recherche instantanée : au plus 8, prix formaté par le serveur, « Sur devis » sans prix retenu. Fonction pure.
import { test } from "node:test";
import assert from "node:assert/strict";
import { suggestionsOf, SUGGEST_MAX, SUGGEST_MIN } from "../../lib/site-catalog/suggest.ts";

const fam = (n) => ({ slug: `f${n}`, name: `Famille ${n}`, image_main_sha256: n % 2 ? "a".repeat(64) : "" });
const text = (p) => (p === null ? "Sur devis" : `À partir de ${p.amount} ${p.basis}`);

test("au plus 8 suggestions, dans l'ordre reçu", () => {
  const out = suggestionsOf(Array.from({ length: 20 }, (_, i) => fam(i)), text, () => "Cat", () => null);
  assert.equal(SUGGEST_MAX, 8);
  assert.equal(out.length, 8);
  assert.deepEqual(out.map((s) => s.slug), ["f0", "f1", "f2", "f3", "f4", "f5", "f6", "f7"]);
});

test("le texte de prix vient du serveur ; sans prix retenu : « Sur devis »", () => {
  const out = suggestionsOf([fam(1), fam(2)], text, () => null, (f) => (f.slug === "f1" ? { amount: "12.50", basis: "HT" } : null));
  assert.equal(out[0].priceText, "À partir de 12.50 HT");
  assert.equal(out[1].priceText, "Sur devis");
});

test("une image absente donne null (le composant affiche un cadre neutre), la catégorie absente aussi", () => {
  const out = suggestionsOf([fam(2)], text, () => null, () => null);
  assert.equal(out[0].imageSha, null);
  assert.equal(out[0].category, null);
  assert.equal(SUGGEST_MIN, 2);
});
