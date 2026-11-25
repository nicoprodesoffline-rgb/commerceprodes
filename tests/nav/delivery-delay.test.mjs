// 49e série (Owner, 25/11) — le délai de livraison du fournisseur, C0 v2 `family.delivery_delay`. Fonction pure, jeu fictif.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { deliveryDelayText } from "../../lib/site-catalog/merchandising.ts";

const family = (extra = {}) => ({ public_family_key: "PF-d", slug: "d", name: "d", primary_category_key: "bancs", secondary_category_keys: [], items: [], ...extra });

test("un délai de la Factory s'affiche tel quel, précédé de ses mots", () => {
  assert.equal(deliveryDelayText(family({ delivery_delay: "Expédition d'essai sous dix jours" })), "Délai de livraison : Expédition d'essai sous dix jours");
});

test("rien quand la Factory n'a pas UN délai (null), qu'il manque (catalogue v1) ou qu'il est blanc : jamais de délai par défaut", () => {
  for (const extra of [{ delivery_delay: null }, {}, { delivery_delay: "   " }]) assert.equal(deliveryDelayText(family(extra)), null);
});

test("la fiche affiche la ligne seulement quand elle existe", () => {
  const page = readFileSync(new URL("../../app/famille/[slug]/page.tsx", import.meta.url), "utf8");
  assert.match(page, /\{delivery && <p [^>]*data-testid="delivery-delay">\{delivery\}<\/p>\}/);
});
