import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { descriptionRest } from "../../lib/site-catalog/description.ts";

test("long = court : l'onglet Description n'a rien à ajouter (le texte reste une seule fois, sous le prix)", () => {
  assert.equal(descriptionRest("panneau médium mélaminé, livré monté.", "panneau médium mélaminé, livré monté."), "");
  assert.equal(descriptionRest("  Même   texte. ", "Même texte."), "", "espaces et retours normalisés");
});

test("le long qui commence par le court ne garde que la suite ; un paragraphe identique au court est retiré", () => {
  assert.equal(descriptionRest("Banc 160 cm.", "Banc 160 cm.\n\nPieds acier, assise bois."), "Pieds acier, assise bois.");
  assert.equal(descriptionRest("Banc 160 cm.", "Banc 160 cm. Pieds acier."), "Pieds acier.");
  assert.equal(descriptionRest("Banc", "Pieds acier.\n\nBanc\n\nAssise bois."), "Pieds acier.\n\nAssise bois.");
});

test("un texte long différent est conservé tel quel ; le court ne coupe pas un mot (« Banc » ≠ « Bancs »)", () => {
  assert.equal(descriptionRest("Banc", "Bancs publics en acier."), "Bancs publics en acier.");
  assert.equal(descriptionRest("Texte court", "Texte long distinct."), "Texte long distinct.");
  assert.equal(descriptionRest("", "Seulement le long."), "Seulement le long.");
  assert.equal(descriptionRest("Court", ""), "");
});

test("les trois rangées de la fiche (complémentaires, montée en gamme, similaires) passent par le même cadre défilant, contenu dans son cadre", () => {
  const row = readFileSync(new URL("../../components/site/carousel-row.tsx", import.meta.url), "utf8");
  // `relative` : les éléments en position absolue des cartes (texte masqué des boutons) restent clippés par le cadre au lieu d'élargir la page.
  assert.match(row, /className="relative w-full min-w-0 snap-x snap-mandatory overflow-x-auto/);
  const sections = readFileSync(new URL("../../components/product/product-sections.tsx", import.meta.url), "utf8");
  assert.equal((sections.match(/<CarouselRow/g) ?? []).length, 1, "les deux sections liées partagent UNE rangée (ProductRow)");
  assert.match(sections, /const sectionClass = "mt-12 min-w-0 /);
  const page = readFileSync(new URL("../../app/famille/[slug]/page.tsx", import.meta.url), "utf8");
  assert.match(page, /<section aria-labelledby="similar-h" className="mt-12 min-w-0 /);
  assert.match(page, /<CarouselRow label="Produits similaires">/);
});
