// Cercle 9, 9.8 — le minimum de commande nommé dans le panier. Fonctions pures, jeu fictif.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cartMinimum, lineMessages, minimumText } from "../../lib/site-business/cart-minimum.ts";

const codeMessage = (code) => `message:${code}`;
const refused = (quantity, minimum) => ({ quantity, minimum_quantity: minimum, error_codes: ["PRICE_WINDOW_UNAVAILABLE"] });

test("le plus petit palier publié dépasse 1 et la quantité est en dessous : « minimum : N pièces »", () => {
  assert.equal(cartMinimum([74, 37, 148]), 37);
  assert.equal(minimumText(37), "minimum : 37 pièces");
  assert.deepEqual(lineMessages(refused(20, cartMinimum([37, 74, 148])), codeMessage), ["minimum : 37 pièces"]);
});

test("le plus petit palier vaut 1, ou aucun palier : pas de minimum_quantity", () => {
  assert.equal(cartMinimum([1, 40, 90]), undefined);
  assert.equal(cartMinimum([]), undefined);
  assert.deepEqual(lineMessages({ quantity: 20, error_codes: ["PRICE_WINDOW_UNAVAILABLE"] }, codeMessage), ["message:PRICE_WINDOW_UNAVAILABLE"]);
});

test("la quantité est au minimum ou au-dessus : aucun message de minimum", () => {
  for (const quantity of [37, 38, 500]) {
    assert.ok(!lineMessages(refused(quantity, 37), codeMessage).some((m) => m.startsWith("minimum")), String(quantity));
  }
  assert.deepEqual(lineMessages({ quantity: 37, minimum_quantity: 37, error_codes: [] }, codeMessage), []);
  // Un autre refus garde son propre message, même sous le minimum : seul « prix indisponible » est remplacé.
  assert.deepEqual(lineMessages({ quantity: 20, minimum_quantity: 37, error_codes: ["QUOTE_ONLY"] }, codeMessage), ["message:QUOTE_ONLY"]);
});

test("l'aperçu du panier et la ligne du panier passent par ces deux fonctions", () => {
  const route = readFileSync(new URL("../../app/api/site/cart/preview/route.ts", import.meta.url), "utf8");
  assert.match(route, /cartMinimum\(hit\.item\.windows\.map\(\(w\) => w\.quantity_min\)\)/);
  assert.match(route, /minimum !== undefined \? \{ \.\.\.line, minimum_quantity: minimum \} : line/);
  const summary = readFileSync(new URL("../../components/cart/cart-summary.tsx", import.meta.url), "utf8");
  assert.match(summary, /const messages = lineMessages\(pl, codeMessage\);/);
  assert.match(summary, /\{messages\.join\(" "\)\}/);
});
