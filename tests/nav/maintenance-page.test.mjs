// Cercle 3, 3.23 (B08) — la lecture des réglages ne casse jamais une page.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SHOP, readShop } from "../../lib/site-shop/settings.ts";

test("aucun lecteur branché : les valeurs d'avant le lot", async () => {
  assert.deepEqual(await readShop(null), DEFAULT_SHOP);
});

test("un lecteur qui échoue ne casse rien : les valeurs d'avant", async () => {
  assert.deepEqual(await readShop(async () => { throw new Error("source indisponible"); }), DEFAULT_SHOP);
});

test("un lecteur branché fournit les réglages publiés", async () => {
  const s = await readShop(async () => ({ shop: { phone: "01 00 00 00 00" }, maintenance: { active: true, message: "Retour à 14 h." } }));
  assert.equal(s.phone, "01 00 00 00 00");
  assert.equal(s.maintenance.active, true);
});
