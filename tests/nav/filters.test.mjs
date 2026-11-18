import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { FILTER_SETTINGS, applyFilters, filterGroups, parseFilterChoice, valuesOf } from "../../lib/site-catalog/filters.ts";

const dir = new URL("../../lib/site-catalog/fixtures/site_filters_v1/", import.meta.url);
const regle = JSON.parse(readFileSync(new URL("regle.json", dir), "utf8"));

test("réglages : la constante du site égale reglages_par_defaut", () => {
  assert.deepEqual({ ...FILTER_SETTINGS }, regle.reglages_par_defaut);
});

test("règle : chaque cas du jeu d'essai commun", () => {
  assert.equal(regle.cases.length, 16);
  assert.equal(regle.source_coloris, "Pastille");
  for (const c of regle.cases) {
    const settings = { ...FILTER_SETTINGS, ...(c.reglages ?? {}) };
    const got = filterGroups(c.families, settings).map((g) => ({ label: g.label, options: g.options }));
    assert.deepEqual(got, c.expected, c.name);
  }
});

const fam = (coloris, type) => ({ characteristics: [...coloris.map((v) => ({ label: "Pastille", value: v })), ...type.map((v) => ({ label: "Type", value: v }))], items: [] });

test("combinaison : OU dans un filtre, ET entre filtres, choix inconnu ignoré", () => {
  const families = [fam(["Bleu"], ["Banc"]), fam(["Rouge"], ["Banc"]), fam(["Bleu"], ["Table"]), fam(["Vert"], ["Table"]), fam(["Rouge"], ["Chaise"])];
  const groups = filterGroups(families);
  assert.deepEqual(groups.map((g) => g.param), ["coloris", "type"]);
  const pick = (choice) => applyFilters(families, groups, choice).length;
  assert.equal(pick({}), 5);
  assert.equal(pick({ coloris: ["Bleu", "Rouge"] }), 4, "OU");
  assert.equal(pick({ coloris: ["Bleu", "Rouge"], type: ["Banc"] }), 2, "ET");
  assert.equal(pick({ coloris: ["bleu"] }), 5, "le site ne plie pas : « bleu » n'est pas une option, il est ignoré");
  assert.equal(pick({ coloris: ["Violet"] }), 5);
});

test("adresse : répétable, doublons et vides écartés", () => {
  assert.deepEqual(parseFilterChoice({ coloris: ["Bleu", "Rouge", "Bleu", ""], type: "Banc", matiere: undefined, autre: "x" }), { coloris: ["Bleu", "Rouge"], type: ["Banc"] });
});

test("valeurs d'une famille : les siennes et celles de ses variantes, sans doublon", () => {
  assert.deepEqual(valuesOf({ characteristics: [{ label: "Type", value: "A" }], items: [{ characteristics: [{ label: "Type", value: "A" }, { label: "Type", value: "B" }] }] }, "Type"), ["A", "B"]);
});

test("Coloris ne lit que « Pastille » : le texte de coloris, lui, ne fait jamais le filtre", () => {
  const texte = (v) => ({ characteristics: [{ label: "Coloris", value: v }], items: [] });
  assert.deepEqual(filterGroups([texte("Bleu"), texte("Rouge"), texte("Vert"), texte("Noir"), texte("Gris")]), []);
});

test("bicolore compté dans ses deux nuances ; Non précisé jamais une option ; Multicolore en est une ; une seule fois par famille", () => {
  const pastille = (v) => ({ characteristics: [{ label: "Pastille", value: v }], items: [] });
  const families = [pastille("Blanc / Noir"), pastille("Noir / Noir"), pastille("Multicolore"), pastille("Non précisé"), pastille("Blanc")];
  const [coloris] = filterGroups(families);
  assert.deepEqual(coloris.options, [{ value: "Blanc", families: 2 }, { value: "Noir", families: 2 }, { value: "Multicolore", families: 1 }]);
  assert.deepEqual(applyFilters(families, [coloris], { coloris: ["Noir"] }).length, 2);
  assert.equal(coloris.options.some((o) => o.value === "Non précisé"), false);
});

test("catalogue publié avant les nuances (aucune Pastille) : aucun filtre Coloris, aucune erreur", () => {
  const old = (v) => ({ characteristics: [{ label: "Coloris", value: v }, { label: "Type", value: v }], items: [{ characteristics: [{ label: "Coloris", value: "x" }] }] });
  const families = ["a", "b", "c", "d", "e"].map(old);
  assert.deepEqual(filterGroups(families).map((g) => g.label), ["Type"]);
  assert.deepEqual(filterGroups([{ items: [] }, { items: [] }, { items: [] }, { items: [] }, { items: [] }]), []);
  assert.deepEqual(applyFilters(families, filterGroups(families), { coloris: ["Bleu"] }).length, 5, "une ancienne adresse ?coloris=… est ignorée sans erreur");
});

test("« Pastille » n'est jamais une caractéristique : recherche et fiche", async () => {
  const { characteristicsText } = await import("../../lib/site-catalog/merchandising.ts");
  const family = { characteristics: [{ label: "Pastille", value: "Zebre" }, { label: "Matière", value: "Acier" }], items: [{ characteristics: [{ label: "pastille ", value: "Zebre" }, { label: "Type", value: "Banc" }] }] };
  const text = characteristicsText(family);
  assert.doesNotMatch(text, /Zebre|Pastille/i);
  assert.match(text, /Acier/);
  assert.match(text, /Banc/);
  const html = readFileSync(new URL("../../components/product/product-sections.tsx", import.meta.url), "utf8");
  assert.match(html, /isPastilleLabel/);
});
