// Cercle 4, 4.11 — cache mémoire borné des médias : plafond, éviction du plus ancien (LRU), media plus gros que le plafond jamais gardé.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { cachedMedia, mediaCacheLimitBytes, mediaCacheStats, rememberMedia, resetMediaCache } from "../../lib/site-catalog/media-cache.ts";

const media = (n) => ({ bytes: new Uint8Array(n), mime: "image/png" });
beforeEach(() => resetMediaCache());

test("plafond petit, trois médias : le premier est évincé, sa demande suivante ne trouve plus rien en mémoire (donc relit la base)", () => {
  rememberMedia("a", media(40), 100);
  rememberMedia("b", media(40), 100);
  rememberMedia("c", media(40), 100);
  assert.equal(cachedMedia("a"), null, "le plus ancien est évincé");
  assert.notEqual(cachedMedia("b"), null);
  assert.notEqual(cachedMedia("c"), null);
  assert.deepEqual(mediaCacheStats(), { entries: 2, bytes: 80 });
});

test("LRU : un média redemandé devient le plus récent et survit à l'éviction suivante", () => {
  rememberMedia("a", media(40), 100);
  rememberMedia("b", media(40), 100);
  assert.notEqual(cachedMedia("a"), null);   // a redevient le plus récent
  rememberMedia("c", media(40), 100);        // b est évincé
  assert.equal(cachedMedia("b"), null);
  assert.notEqual(cachedMedia("a"), null);
});

test("un média plus gros que le plafond n'est pas gardé, plafond 0 = aucun cache", () => {
  rememberMedia("big", media(200), 100);
  assert.equal(cachedMedia("big"), null);
  rememberMedia("a", media(10), 0);
  assert.equal(cachedMedia("a"), null);
});

test("plafond lu dans SITE_MEDIA_CACHE_MB : 256 Mo par défaut, 0 admis, valeur illisible = défaut", () => {
  assert.equal(mediaCacheLimitBytes({}), 256 * 1024 * 1024);
  assert.equal(mediaCacheLimitBytes({ SITE_MEDIA_CACHE_MB: "0" }), 0);
  assert.equal(mediaCacheLimitBytes({ SITE_MEDIA_CACHE_MB: "8" }), 8 * 1024 * 1024);
  assert.equal(mediaCacheLimitBytes({ SITE_MEDIA_CACHE_MB: "beaucoup" }), 256 * 1024 * 1024);
});
