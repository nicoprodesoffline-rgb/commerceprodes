// S1-A I1 — garde de la coque : aucun lien en dur vers une page qui n'existe pas, aucune coordonnée écrite en dur, aucun loading.tsx racine.
// (Un loading.tsx à la racine diffuse la page avant que le 404 soit connu : statut 200 au lieu de 404 — commit a894404b.)
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const shellFiles = ["components/layout/utility-bar.tsx", "components/layout/site-header.tsx", "components/layout/footer.tsx", "components/layout/mobile-bottom-nav.tsx", "app/not-found.tsx"];
const routeExists = (href) => {
  if (href === "/") return fs.existsSync(path.join(root, "app/page.tsx"));
  const segment = href.split("?")[0].replace(/^\//, "");
  return fs.existsSync(path.join(root, "app", segment, "page.tsx"));
};

test("chaque lien en dur de la coque mène à une page qui existe", () => {
  for (const file of shellFiles) {
    const source = fs.readFileSync(path.join(root, file), "utf8");
    for (const [, href] of source.matchAll(/(?:href|action)="(\/[^"$]*)"/g)) {
      assert.ok(routeExists(href), `${file} : ${href} n'a pas de page`);
    }
  }
});

test("la coque n'écrit en dur ni téléphone ni adresse e-mail (coordonnées pilotées par la Factory, S4)", () => {
  for (const file of shellFiles) {
    const source = fs.readFileSync(path.join(root, file), "utf8");
    assert.doesNotMatch(source, /\b0\d(?:[ .]?\d{2}){4}\b/, `${file} : numéro de téléphone`);
    assert.doesNotMatch(source, /[\w.-]+@[\w-]+\.[a-z]{2,}/i, `${file} : adresse e-mail`);
    assert.doesNotMatch(source, /tel:|mailto:/, `${file} : lien de contact en dur`);
  }
});

test("pas de loading.tsx à la racine (un vrai 404 exige que la page ne soit pas diffusée avant de savoir)", () => {
  const forbidden = ["app/loading.tsx"];
  for (const segment of ["famille", "categorie", "article", "p"]) {
    const dir = path.join(root, "app", segment);
    if (fs.existsSync(dir)) {
      for (const file of fs.readdirSync(dir, { recursive: true })) {
        if (path.basename(file) === "loading.tsx") forbidden.push(`app/${segment}/${file}`);
      }
    }
  }
  for (const file of forbidden) assert.equal(fs.existsSync(path.join(root, file)), false, file);
});

test("les textes validés par le propriétaire sont présents : horaires (C5) et livraison incluse (C1)", () => {
  const bar = fs.readFileSync(path.join(root, "components/layout/utility-bar.tsx"), "utf8");
  assert.match(bar, /Lun–Sam 8h30–19h/);
  assert.match(bar, /Livraison incluse sur tout le catalogue/);
  const footer = fs.readFileSync(path.join(root, "components/layout/footer.tsx"), "utf8");
  assert.match(footer, /Lun–Sam 8h30–19h/);
  assert.match(footer, /Prix HT/);
});
