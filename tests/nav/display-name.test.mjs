import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { displayName } from "../../lib/site-catalog/display-name.ts";
import { count } from "../../components/site/format.ts";

test("nom ENTIÈREMENT en capitales : casse de phrase, seule la première lettre en majuscule", () => {
  assert.equal(displayName("TENTE DE JARDIN"), "Tente de jardin");
  assert.equal(displayName("GAMME ÉTÉ-24"), "Gamme été-24", "mêmes mots que la Factory : le tiret sépare « ÉTÉ » (voyelles, minuscules) de « 24 » (chiffre, inchangé)");
  assert.equal(displayName("ÉTAGÈRE MURALE"), "Étagère murale");
  assert.equal(displayName("TABLE-BANC ENFANT"), "Table-banc enfant");
  assert.equal(displayName("L'ABRI VÉLOS"), "L'abri vélos");
});

test("règle des sigles : mots à chiffres, ABS et sigles de 2 à 4 lettres sans voyelle restent en capitales", () => {
  assert.equal(displayName("RAMPE PMR EN ABS"), "Rampe PMR en ABS");
  assert.equal(displayName("CABINE WC PMR"), "Cabine WC PMR");
  assert.equal(displayName("POTEAU 4X4 ACIER"), "Poteau 4X4 acier");
  assert.equal(displayName("PLAQUE IP65 ET REF-12A"), "Plaque IP65 et ref-12A", "un mot qui porte un chiffre reste tel quel ; REF (3 lettres, voyelle E) passe en minuscules");
  assert.equal(displayName("PANNEAU NF EN 1176"), "Panneau NF en 1176", "« EN » a une voyelle : minuscules ; « NF » (2 lettres sans voyelle) et « 1176 » (chiffres) restent");
  assert.equal(displayName("PVC ET ABS"), "PVC et ABS", "premier mot sigle : il reste en capitales, pas de majuscule de plus");
  assert.equal(displayName("KIT 12 PIÈCES"), "Kit 12 pièces");
});

test("5 lettres sans voyelle ne sont pas un sigle ; Y compte comme voyelle ; sigle accentué impossible", () => {
  assert.equal(displayName("SCHTRK ROUGE"), "Schtrk rouge");
  assert.equal(displayName("GYM TABLE"), "Gym table");
});

test("un nom qui contient déjà une minuscule, ou sans lettre, est rendu tel quel (jamais retouché)", () => {
  for (const name of ["Banc ÉCOLIERS", "fauteuil 402", "Gamme Hiver", "", "123", "—"]) assert.equal(displayName(name), name);
});

test("idempotent : appliquer deux fois donne le même texte", () => {
  for (const name of ["TENTE DE JARDIN", "GAMME ÉTÉ-24", "RAMPE PMR EN ABS", "TABLE-BANC ENFANT"]) assert.equal(displayName(displayName(name)), displayName(name));
});

test("le nom du DTO n'est jamais modifié : seul l'objet d'affichage du catalogue passe par displayName", () => {
  const source = readFileSync(new URL("../../lib/site-catalog/catalog.ts", import.meta.url), "utf8");
  assert.match(source, /name: displayName\(f\.name\)/);
  assert.match(source, /c0Generation: \{ snapshot: served\.snapshot/, "le document C0 servi reste celui d'origine");
});

test("séparateur de milliers fr-FR : 8329 → « 8 329 » (espace fine insécable), petits nombres inchangés", () => {
  assert.match(count(8329), /^8[\u202f\u00a0 ]329$/);
  assert.match(count(1070), /^1[\u202f\u00a0 ]070$/);
  assert.match(count(1234567), /^1[\u202f\u00a0 ]234[\u202f\u00a0 ]567$/);
  for (const [n, text] of [[0, "0"], [7, "7"], [415, "415"], [999, "999"]]) assert.equal(count(n), text);
});

test("tous les nombres de catalogue affichés passent par count() : références, familles, variantes, résultats", () => {
  const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
  assert.match(read("components/home/hero.tsx"), /\{count\(references\)\}/);
  assert.match(read("components/home/category-grid.tsx"), /\{count\(c\.familyCount\)\}/);
  assert.match(read("components/home/family-card.tsx"), /count\(data\.variantCount\)/);
  assert.equal((read("components/catalog/category-sidebar.tsx").match(/count\((r|c)\.subtreeFamilyCount\)/g) ?? []).length, 3);
  assert.equal((read("app/recherche/page.tsx").match(/count\(listing\.total\)/g) ?? []).length, 2);
  assert.match(read("app/categorie/[key]/page.tsx"), /count\(listing\.total\)/);
  assert.match(read("components/layout/live-search.tsx"), /count\(answer\.total\)/);
});

test("fiche mobile : l'espace en bas de page couvre la barre collante (48 px à 72 px du bas) et la barre de navigation", () => {
  const page = readFileSync(new URL("../../app/famille/[slug]/page.tsx", import.meta.url), "utf8");
  assert.match(page, /<div className="min-w-0 pb-40 lg:pb-0">/, "pb-40 = 160 px ≥ 72 + 48 + marge");
  const box = readFileSync(new URL("../../components/product/family-buy-box.tsx", import.meta.url), "utf8");
  assert.match(box, /fixed inset-x-4 bottom-\[72px\]/);
});
