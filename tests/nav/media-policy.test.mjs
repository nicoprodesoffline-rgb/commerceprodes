// Recette E2E (issue #89) — l'interrupteur d'images de la recette : désactivé par défaut, jamais hors staging, sans effet sur les autres étiquettes. Fonction pure.
import { test } from "node:test";
import assert from "node:assert/strict";
import { imagesAllowed, recetteShowsStagingImages } from "../../lib/site-catalog/media-policy.ts";

test("par défaut, une génération STAGING_FIXTURE ne montre aucune image", () => {
  assert.equal(imagesAllowed("STAGING_FIXTURE", {}), false);
  assert.equal(imagesAllowed("STAGING_FIXTURE", { SITE_ENV: "staging" }), false);
});

test("l'interrupteur de recette montre les images en staging seulement", () => {
  assert.equal(imagesAllowed("STAGING_FIXTURE", { SITE_ENV: "staging", SITE_RECETTE_SHOW_STAGING_IMAGES: "1" }), true);
  assert.equal(imagesAllowed("STAGING_FIXTURE", { SITE_ENV: "production", SITE_RECETTE_SHOW_STAGING_IMAGES: "1" }), false);
  assert.equal(imagesAllowed("STAGING_FIXTURE", { SITE_RECETTE_SHOW_STAGING_IMAGES: "1" }), false);
  assert.equal(recetteShowsStagingImages({ SITE_ENV: "staging", SITE_RECETTE_SHOW_STAGING_IMAGES: "true" }), false, "seule la valeur 1 l'active");
});

test("les autres étiquettes gardent leur comportement, une étiquette absente ne montre rien", () => {
  assert.equal(imagesAllowed("PRODUCTION", {}), true);
  assert.equal(imagesAllowed(undefined, { SITE_ENV: "staging", SITE_RECETTE_SHOW_STAGING_IMAGES: "1" }), false);
  assert.equal(imagesAllowed(null, {}), false);
});
