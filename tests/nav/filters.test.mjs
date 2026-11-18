import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fold } from "../../lib/site-catalog/folding.ts";
import { FILTER_SETTINGS, applyFilters, filterGroups, parseFilterChoice, valuesOf } from "../../lib/site-catalog/filters.ts";

const dir = new URL("../../lib/site-catalog/fixtures/site_filters_v1/", import.meta.url);
const pli = JSON.parse(readFileSync(new URL("pli.json", dir), "utf8"));
const regle = JSON.parse(readFileSync(new URL("regle.json", dir), "utf8"));

test("pli : chaque cas du jeu d'essai commun", () => {
  assert.equal(pli.version, "site_filters.v1");
  assert.ok(pli.cases.length >= 30);
  for (const c of pli.cases) assert.equal(fold(c.in), c.out, JSON.stringify(c.in));
});

test("réglages : la constante du site égale reglages_par_defaut", () => {
  assert.deepEqual({ ...FILTER_SETTINGS }, regle.reglages_par_defaut);
});

test("règle : chaque cas du jeu d'essai commun", () => {
  for (const c of regle.cases) {
    const settings = { ...FILTER_SETTINGS, ...(c.reglages ?? {}) };
    const got = filterGroups(c.families, settings).map((g) => ({ label: g.label, options: g.options }));
    assert.deepEqual(got, c.expected, c.name);
  }
});

const fam = (coloris, type) => ({ characteristics: [...coloris.map((v) => ({ label: "Coloris", value: v })), ...type.map((v) => ({ label: "Type", value: v }))], items: [] });

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
  assert.deepEqual(valuesOf({ characteristics: [{ label: "Coloris", value: "A" }], items: [{ characteristics: [{ label: "Coloris", value: "A" }, { label: "Coloris", value: "B" }] }] }, "Coloris"), ["A", "B"]);
});
