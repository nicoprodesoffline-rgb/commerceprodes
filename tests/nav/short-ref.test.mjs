import { test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { makeKey, decodeSequence, isKey } from "../../c0/ts/src/identity.ts";

const hooks = registerHooks({ resolve(specifier, context, next) {
  return next(specifier === "@/c0/ts/src/identity" ? new URL("../../c0/ts/src/identity.ts", import.meta.url).href : specifier, context);
} });
const { shortRef, itemKeyFromInput } = await import("../../lib/site-catalog/short-ref.ts");
hooks.deregister();

// Vecteurs de la règle D6 : P est le nombre que code la clé publique C0 (8 symboles Crockford base32, poids fort d'abord) ; affichage « PI- » + P décimal sur 6 chiffres minimum.
const VECTORS = [
  [1, "PI-000001"],
  [1001, "PI-001001"],
  [999_999, "PI-999999"],
  [1_000_000, "PI-1000000"],
  [11_727, "PI-011727"],
];

test("la clé de P=1 est celle des fixtures C0 (PI-00000001R)", () => {
  assert.equal(makeKey("item", 1), "PI-00000001R");
});

test("décodage : P = 1, 1001 et 999 999 se retrouvent depuis la clé longue", () => {
  for (const p of [1, 1001, 999_999]) {
    const key = makeKey("item", p);
    assert.equal(decodeSequence(key, "item"), p);
    assert.match(key, /^PI-[0-9A-HJKMNP-TV-Z]{9}$/);
  }
});

test("affichage : « PI- » + P sur 6 chiffres, jamais tronqué au-delà", () => {
  for (const [p, shown] of VECTORS) assert.equal(shortRef(makeKey("item", p)), shown, `P=${p}`);
});

test("une valeur qui n'est pas une clé d'Item valide est rendue telle quelle (aucune référence inventée)", () => {
  for (const v of ["", "PI-000000CHK" /* contrôle faux */, "PF-000000CHM" /* clé Famille */, "n'importe quoi", "pi-000000chj"]) assert.equal(shortRef(v), v);
});

test("saisie : la forme courte et la clé longue donnent la même clé longue", () => {
  for (const [p, shown] of VECTORS) {
    const key = makeKey("item", p);
    assert.equal(itemKeyFromInput(shown), key, shown);
    assert.equal(itemKeyFromInput(key), key, key);
  }
  const key = makeKey("item", 401);
  for (const v of ["PI-000401", "pi-000401", " PI-000401 ", "PI000401", "PI-401", "PI-0 00401"]) assert.equal(itemKeyFromInput(v), key, v);
  assert.equal(itemKeyFromInput(key.toLowerCase()), key);
});

test("saisie refusée : vide, sans chiffres, nombre nul, hors plage, clé longue à contrôle faux, autre espace de noms", () => {
  for (const v of ["", "PI-", "PI-abc", "PI-0", "PI-000000", "PI-12.5", "PI--5", "PF-000000CHM", "PI-000000CHK", "chaise", "PI-99999999999999", "PI-1099511627776" /* 32^8 */])
    assert.equal(itemKeyFromInput(v), null, v);
});

test("aller-retour sur un échantillon dense (tout le catalogue réel tient en 1..11 727)", () => {
  for (let p = 1; p <= 12_000; p += 7) {
    const key = makeKey("item", p);
    assert.ok(isKey(key, "item"));
    assert.equal(itemKeyFromInput(shortRef(key)), key);
  }
});

test("la clé longue prime sur la lecture décimale d'une saisie de 9 caractères valide", () => {
  const key = makeKey("item", 1);
  assert.equal(itemKeyFromInput(key), key);
});
