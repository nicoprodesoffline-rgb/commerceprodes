// CA-3 (cercle A, Owner A.6-d1) — ce que le SITE affiche d'un texte libre : des paragraphes, et des liens vers les pages du site. Jeu fictif.
// La lecture (paragraphes, liens) est celle du contrat (c0v2, jeux d'essai V2_RICHTEXT) ; ces tests prouvent le SITE : ce qu'il en dessine, et qu'il n'écrit jamais de HTML.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { richTextParagraphs } from "./rich-text-loader.mjs";

const text = (value) => ({ kind: "text", text: value });
const link = (label, href) => ({ kind: "link", label, href });

test("un texte sans ligne vide ni lien reste un seul paragraphe, tel qu'avant CA-3 (le retour à la ligne est gardé)", () => {
  assert.deepEqual(richTextParagraphs("Ligne un.\nLigne deux."), [[text("Ligne un.\nLigne deux.")]]);
});

test("une ligne vide sépare deux paragraphes ; un navigateur envoie CRLF, le résultat est le même", () => {
  assert.deepEqual(richTextParagraphs("Un.\n\nDeux."), [[text("Un.")], [text("Deux.")]]);
  assert.deepEqual(richTextParagraphs("Un.\r\n\r\nDeux."), [[text("Un.")], [text("Deux.")]]);
});

test("[texte](/page) est un lien vers une page du site, au milieu d'une phrase", () => {
  assert.deepEqual(richTextParagraphs("Voir nos [conditions de vente](/conditions-generales-de-vente) avant de commander."),
    [[text("Voir nos "), link("conditions de vente", "/conditions-generales-de-vente"), text(" avant de commander.")]]);
});

test("un lien qui sortirait du site reste du texte : jamais un lien, jamais une adresse externe, jamais un schéma", () => {
  for (const bad of ["https://exemple.invalid/a", "//exemple.invalid/a", "javascript:alert", "livraison"]) {
    const [[...segments]] = richTextParagraphs(`Voir [ceci](${bad}).`);
    assert.ok(segments.every((segment) => segment.kind === "text"), bad);
    assert.equal(segments.map((segment) => segment.text).join(""), `Voir [ceci](${bad}).`, "le texte tapé est gardé tel quel");
  }
});

test("le HTML tapé reste du texte : le site n'en écrit jamais", () => {
  const [[...segments]] = richTextParagraphs('<script>alert(1)</script> [x](/a)');
  assert.deepEqual(segments, [text("<script>alert(1)</script> "), link("x", "/a")]);
});

test("l'affichage passe par des liens du site et n'injecte aucun HTML", () => {
  const section = readFileSync(new URL("../../components/content/sections.tsx", import.meta.url), "utf8");
  const rich = section.slice(section.indexOf("export function RichTextSection"), section.indexOf("export function PageSections"));
  assert.match(rich, /richTextParagraphs\(/);
  assert.match(rich, /<Link /);
  assert.doesNotMatch(rich, /dangerouslySetInnerHTML|<a /);
});
