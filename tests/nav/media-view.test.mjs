// Cercle 3 (3.3, 3.4, I10, I11, I14) — la vue d'une image d'un catalogue v2 : versions réduites, choix de la largeur, adresses lisibles. Fonctions pures, données fictives.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mediaViews, pickDerivative, mediaPath, srcSet, readableNameOk } from "../../lib/site-catalog/media-view.ts";

const sha = (n) => String(n).padStart(64, "0");
const derivative = (n, width) => ({ sha256: sha(n), width, height: Math.round(width * 0.75), mime: "image/webp", size: 1000 + width });
const doc = {
  contract_version: "site_snapshot.v2",
  media_refs: [
    { sha256: sha(1), mime: "image/jpeg", size: 3_000_000, alt: "Banc Léo, Chêne", public_name: "banc-leo-chene", derivatives: [derivative(14, 1600), derivative(11, 320), derivative(13, 1024), derivative(12, 640)] },
    { sha256: sha(2), mime: "image/png", size: 5000, alt: null, public_name: null, derivatives: [] },
  ],
};

test("seules les images qui ont des versions réduites ont une vue, rangées par largeur croissante", () => {
  const views = mediaViews(doc);
  assert.deepEqual([...views.keys()], [sha(1)]);
  assert.deepEqual(views.get(sha(1)).derivatives.map((d) => d.width), [320, 640, 1024, 1600]);
  assert.equal(views.get(sha(1)).alt, "Banc Léo, Chêne");
});

test("un catalogue v1 n'a aucune vue", () => {
  assert.equal(mediaViews({ ...doc, contract_version: "site_snapshot.v1" }).size, 0);
  assert.equal(mediaViews(null).size, 0);
});

test("la largeur demandée donne la plus petite version assez large, jamais d'agrandissement (I10, I11)", () => {
  const { derivatives } = mediaViews(doc).get(sha(1));
  assert.equal(pickDerivative(derivatives, 320).width, 320);
  assert.equal(pickDerivative(derivatives, 500).width, 640);
  assert.equal(pickDerivative(derivatives, 5000).width, 1600, "plus large que tout : la plus grande");
  assert.equal(pickDerivative(derivatives).width, 1600, "sans largeur : la plus grande");
  assert.equal(pickDerivative([], 320), null);
});

test("adresse /media/<empreinte>/<nom-lisible>.webp et srcset (I10, I14)", () => {
  const view = mediaViews(doc).get(sha(1));
  assert.equal(mediaPath(sha(11), view.publicName), `/media/${sha(11)}/banc-leo-chene.webp`);
  assert.equal(mediaPath(sha(11), null), `/media/${sha(11)}`);
  assert.equal(mediaPath(sha(11), "Nom Invalide"), `/media/${sha(11)}`);
  assert.equal(srcSet(view), [320, 640, 1024, 1600].map((w, i) => `/media/${sha(11 + i)}/banc-leo-chene.webp ${w}w`).join(", "));
});

test("tout nom lisible de la forme d'une adresse est accepté ; le reste est refusé", () => {
  assert.equal(readableNameOk("banc-leo.webp"), true);
  assert.equal(readableNameOk("autre-nom.webp"), true);
  for (const bad of ["banc leo.webp", "banc.jpg", "../x.webp", ".webp", "BANC.webp"]) assert.equal(readableNameOk(bad), false, bad);
});
