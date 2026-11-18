import { test } from "node:test";
import assert from "node:assert/strict";
import { addWishlistToCart } from "../../components/site/wishlist-cart.ts";

const family = (slug, single = true) => ({ slug, name: slug, single: single ? { public_item_key: `PI-${slug}`, variant_axes: { size: "L" }, axes: [{ label: "Taille", value: "L" }] } : null });
const response = (accepted = true, codes = []) => ({ status: 200, network: false, json: { catalogue_sequence: 7, lines: [{ public_item_key: "PI-a", quantity: 1, accepted, selection: accepted ? { unit_amount: "12.00" } : null, error_codes: codes }] } });

test("seules les familles à variante unique sont vérifiées puis ajoutées une fois à quantité 1, sans annonce", async () => {
  const asked = [], added = [];
  const result = await addWishlistToCart([family("a"), family("b", false)], async (lines) => { asked.push(lines); return response(); }, (...args) => added.push(args));
  assert.deepEqual(asked, [[{ public_item_key: "PI-a", variant_axes: { size: "L" }, quantity: 1 }]]);
  assert.deepEqual(added, [[{ public_item_key: "PI-a", variant_axes: { size: "L" }, quantity: 1, family_name: "a", family_slug: "a", axes: [{ label: "Taille", value: "L" }] }, 7, { announce: false }]]);
  assert.equal(result.added, 1);
  assert.deepEqual(result.choose.map((f) => f.slug), ["b"]);
  assert.deepEqual(result.refused, []);
});

test("les refus serveur gardent leur cause et n'empêchent pas les ajouts suivants", async () => {
  const added = [];
  const result = await addWishlistToCart([family("bad"), family("a")], async ([line]) => line.public_item_key === "PI-bad" ? response(false, ["ITEM_RETIRED"]) : response(), (...args) => added.push(args));
  assert.equal(result.added, 1);
  assert.equal(added.length, 1);
  assert.deepEqual(result.refused.map(({ family, codes }) => [family.slug, codes]), [["bad", ["ITEM_RETIRED"]]]);
});

test("comme sur la fiche, une fenêtre de prix indisponible permet seulement un ajout sans prix signalé", async () => {
  const added = [];
  const result = await addWishlistToCart([family("a")], async () => response(false, ["PRICE_WINDOW_UNAVAILABLE"]), (...args) => added.push(args));
  assert.equal(result.added, 1);
  assert.equal(result.unpriced, 1);
  assert.equal(added.length, 1);
  assert.deepEqual(result.refused, []);
});

test("une panne réseau est distinguée d'un refus du serveur et la boucle continue", async () => {
  let count = 0;
  const result = await addWishlistToCart([family("x"), family("y"), family("a")], async () => {
    count++;
    if (count === 1) return { status: 0, json: null, network: true };
    if (count === 2) throw new Error("transport");
    return response();
  }, () => {});
  assert.equal(result.added, 1);
  assert.deepEqual(result.failed.map((f) => f.slug), ["x", "y"]);
  assert.deepEqual(result.refused, []);
});

test("réponse absente, HTTP non 200 ou ligne d'une autre demande : aucun ajout", async () => {
  for (const r of [
    { status: 503, network: false, json: { error_codes: ["CATALOG_UNAVAILABLE"] } },
    { status: 200, network: false, json: null },
    { ...response(), json: { ...response().json, lines: [{ ...response().json.lines[0], public_item_key: "PI-other" }] } },
    { ...response(), json: { ...response().json, lines: [{ ...response().json.lines[0], quantity: 2 }] } },
  ]) {
    const result = await addWishlistToCart([family("a")], async () => r, () => assert.fail("pas d'ajout"));
    assert.equal(result.added, 0);
    assert.equal(result.refused.length, 1);
    assert.ok(result.refused[0].codes.length);
  }
});
