// Cercle 5, 5.5 : le bloc des totaux du panier. Un panier de lignes « sur devis » seulement ne montre AUCUN montant (ni 0,00 €, ni total à zéro) ; un panier mixte garde la mention « hors lignes sur devis ».
import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "./load-ts.mjs";

const { TaxTotals } = load("components/cart/tax-totals.tsx");
const commerce = { ready: true, sequence: 1, tax_rate: "20.00", delivery: { label: "Livraison sur rendez-vous", amount_ht: "20.00" }, payment: {}, privacy: { version: "m1", text: "x" }, cgv_version: "c1" };
const line = (priced, quantity = 2, unit = "10.00") => ({ public_item_key: "PI-000000CHJ", variant_axes: {}, quantity, accepted: priced, error_codes: priced ? [] : ["QUOTE_ONLY"], superseded_by: {}, selection: priced ? { rate_id: "R-1", unit_amount: unit, currency: "EUR", tax_basis_or_status: "HT", valid_until_utc: null } : null, line_total: null });
const render = (lines, option) => renderToStaticMarkup(React.createElement(TaxTotals, { preview: { lines }, commerce, ...(option ? { option } : {}) }));

test("que des lignes sur devis : aucun montant, jamais 0,00 €, seulement la demande de devis", () => {
  const html = render([line(false), line(false, 5)]);
  assert.match(html, /data-testid="tax-totals-quote-only"/);
  assert.match(html, /Prix sur devis/);
  assert.doesNotMatch(html, /0,00|€|TVA|toutes taxes comprises|tax-totals"/);
  assert.doesNotMatch(render([line(false)], "rendez_vous"), /€|20,00/, "même avec la livraison sur rendez-vous : rien à totaliser");
});

test("panier mixte : les totaux des lignes chiffrées et la mention « hors lignes sur devis »", () => {
  const html = render([line(true), line(false)]);
  assert.match(html, /data-testid="tax-totals"/);
  assert.match(html, /20,00\s€/);   // 2 × 10,00 HT
  assert.match(html, /4,00\s€/);    // TVA 20 %
  assert.match(html, /24,00\s€ TTC/);
  assert.match(html, /Hors lignes sur devis/);
});

test("panier chiffré : totaux sans mention « hors lignes sur devis »", () => {
  const html = render([line(true), line(true, 1, "5.00")]);
  assert.match(html, /25,00\s€/);
  assert.match(html, /30,00\s€ TTC/);
  assert.doesNotMatch(html, /Hors lignes sur devis/);
});
