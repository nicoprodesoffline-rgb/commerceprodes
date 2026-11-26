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

test("53e série (Owner, 25/11) : sur le jeu C0 v2 commun, écrit par la Factory, une famille à null n'affiche rien, celle qui a UN délai l'affiche", () => {
  // Le pack, et la famille vendue par deux fournisseurs aux délais différents, arrivent de la Factory avec `delivery_delay` = null.
  const doc = JSON.parse(readFileSync(new URL("../../c0v2/fixtures/documents/V2_CATALOGUE/snapshot_v2_ready.json", import.meta.url), "utf8"));
  const withNull = doc.families.filter((f) => f.delivery_delay === null);
  const withText = doc.families.filter((f) => typeof f.delivery_delay === "string");
  assert.ok(withNull.length >= 1 && withText.length >= 1, "le jeu porte les deux cas");
  for (const f of withNull) assert.equal(deliveryDelayText(family({ delivery_delay: f.delivery_delay })), null, f.public_family_key);
  for (const f of withText) assert.equal(deliveryDelayText(family({ delivery_delay: f.delivery_delay })), `Délai de livraison : ${f.delivery_delay}`);
  // Le lecteur du catalogue garde null tel quel (jamais un texte par défaut) : la fiche ne reçoit donc rien à afficher.
  const reader = readFileSync(new URL("../../lib/site-catalog/catalog.ts", import.meta.url), "utf8");
  assert.match(reader, /f\["delivery_delay"\] === null\) out\.delivery_delay = f\["delivery_delay"\] as string \| null;/);
});
