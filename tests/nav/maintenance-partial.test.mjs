// CA-2 (cercle A, A.5-d1) — le mode maintenance partiel du SITE : ce que la maintenance ferme, ce qu'elle laisse ouvert, et le corps de la réponse.
import { test } from "node:test";
import assert from "node:assert/strict";
import { CLOSED_BY_MAINTENANCE, maintenanceRefusalBody } from "../../lib/site-shop/maintenance.ts";

test("CA-2 : la maintenance ferme le devis, la commande et le message, et rien d'autre", () => {
  assert.deepEqual([...CLOSED_BY_MAINTENANCE].sort(), ["/api/site/message", "/api/site/order", "/api/site/quote"]);
  for (const open of ["/api/site/cart/preview", "/api/site/search", "/api/site/health", "/api/site/publish/stage", "/api/site/receipt"]) assert.ok(!CLOSED_BY_MAINTENANCE.has(open), `${open} reste ouverte`);
});

test("CA-2 : le corps du refus porte le code, le message tel quel, et dit que rien n'est enregistré", () => {
  const body = maintenanceRefusalBody("Retour à 14 h.");
  assert.equal(body.site_status, "SITE_MAINTENANCE");
  assert.equal(body.message, "Retour à 14 h.");
  assert.equal(body.persistence, "NONE");
  assert.equal(body.durable, false);
  assert.equal(body.verdict, null);
});
