// CAT-07 — navigation des catégories : 3 niveaux max, rattachement du niveau 4+, rubriques vides masquées.
// Fonction pure (aucune base, aucun serveur) : node --test tests/nav/*.test.mjs (Node 22, types retirés à l'import).
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildNavigation, MAX_NAV_LEVEL } from "../../lib/site-catalog/navigation.ts";

const cat = (key, parent = null) => ({ category_key: key, name: `N-${key}`, parent_category_key: parent });
const fam = (slug, primary, secondary = []) => ({ slug, primary_category_key: primary, secondary_category_keys: secondary });

// Arbre de 4 niveaux : a > b > c > d > e, plus une racine x (2 niveaux) et une racine vide v.
const CATS = [cat("a"), cat("b", "a"), cat("c", "b"), cat("d", "c"), cat("e", "d"), cat("v"), cat("x"), cat("x1", "x")];

test("le maximum est 3 niveaux", () => assert.equal(MAX_NAV_LEVEL, 3));

test("2 niveaux : menu racine > enfant, niveaux 1 et 2, ordre du DTO", () => {
  const nav = buildNavigation([cat("m"), cat("m-1", "m"), cat("m-2", "m"), cat("s")], [fam("f1", "m-1"), fam("f2", "m-2"), fam("f3", "s")]);
  assert.deepEqual(nav.menu.map((n) => n.key), ["m", "s"]);
  assert.deepEqual(nav.menu[0].children.map((n) => [n.key, n.level]), [["m-1", 2], ["m-2", 2]]);
  assert.equal(nav.node("m").level, 1);
  assert.deepEqual(nav.chain("m-2").map((n) => n.key), ["m", "m-2"]);
});

test("3 niveaux : menu complet, fil d'Ariane de 3 maillons", () => {
  const nav = buildNavigation(CATS, [fam("f", "c")]);
  assert.deepEqual(nav.menu.map((n) => n.key), ["a"]);
  const a = nav.menu[0];
  assert.deepEqual([a.level, a.children[0].level, a.children[0].children[0].level], [1, 2, 3]);
  assert.deepEqual(nav.chain("c").map((n) => n.key), ["a", "b", "c"]);
  assert.deepEqual(nav.node("c").children, [], "le niveau 3 n'a aucun enfant navigable");
});

test("un 4e niveau est impossible : ni nœud, ni page, ni maillon ; ses familles sont rattachées au niveau 3", () => {
  const nav = buildNavigation(CATS, [fam("fd", "d"), fam("fe", "e"), fam("fc", "c")]);
  assert.equal(nav.node("d"), null);
  assert.equal(nav.node("e"), null);
  assert.deepEqual(nav.chain("d"), []);
  assert.equal(nav.anchor("d"), "c");
  assert.equal(nav.anchor("e"), "c", "le niveau 5 se rattache aussi au niveau 3, pas au niveau 4");
  assert.deepEqual(nav.familySlugs("c"), ["fd", "fe", "fc"], "ordre du DTO");
  assert.deepEqual(nav.familySlugs("d"), []);
  const depth = (n) => 1 + Math.max(0, ...n.children.map(depth));
  assert.ok(nav.menu.every((n) => depth(n) <= 3), "aucune branche du menu ne dépasse 3 niveaux");
  const names = JSON.stringify(nav.menu);
  assert.ok(!names.includes('"d"') && !names.includes('"e"'), "aucune clé de niveau 4+ dans le menu");
});

test("famille classée en niveau 4 en secondaire : rattachée au niveau 3, sans doublon", () => {
  const nav = buildNavigation(CATS, [fam("f", "x1", ["d", "c"])]);
  assert.deepEqual(nav.familySlugs("c"), ["f"], "d et c pointent vers c : une seule fois");
  assert.equal(nav.node("c").ownFamilyCount, 1);
});

test("une rubrique sans famille dans son sous-arbre est masquée du menu mais résolue", () => {
  const nav = buildNavigation(CATS, [fam("f", "x1")]);
  assert.deepEqual(nav.menu.map((n) => n.key), ["x"], "a (vide), v (vide) masquées");
  assert.notEqual(nav.node("v"), null, "la page d'une rubrique vide répond");
  assert.deepEqual(nav.familySlugs("v"), []);
  assert.notEqual(nav.node("a"), null);
});

test("un parent reste visible grâce à un descendant non vide ; un enfant vide est masqué", () => {
  const nav = buildNavigation([cat("p"), cat("full", "p"), cat("empty", "p")], [fam("f", "full")]);
  assert.deepEqual(nav.menu[0].children.map((n) => n.key), ["full"]);
  assert.deepEqual(nav.visibleChildren("p").map((n) => n.key), ["full"]);
  assert.equal(nav.node("p").children.length, 2, "node() garde tous les enfants, le menu non");
  assert.equal(nav.node("p").subtreeFamilyCount, 1);
  assert.equal(nav.node("p").ownFamilyCount, 0);
});

test("une famille principale + secondaire dans la même rubrique compte une fois", () => {
  const nav = buildNavigation([cat("p")], [fam("f", "p", ["p"])]);
  assert.deepEqual(nav.familySlugs("p"), ["f"]);
  assert.equal(nav.node("p").subtreeFamilyCount, 1);
});

test("catégorie inconnue, parent absent ou cycle : non placée, jamais dans le menu", () => {
  const nav = buildNavigation([cat("orph", "ghost"), cat("c1", "c2"), cat("c2", "c1"), cat("ok")], [fam("f1", "orph"), fam("f2", "c1"), fam("f3", "ok"), fam("f4", "nulle-part")]);
  assert.deepEqual(nav.menu.map((n) => n.key), ["ok"]);
  assert.equal(nav.node("orph"), null);
  assert.equal(nav.anchor("orph"), null);
  assert.equal(nav.node("c1"), null);
  assert.equal(nav.anchor("nulle-part"), null);
  assert.deepEqual(nav.familySlugs("ok"), ["f3"]);
});

test("une rubrique absente du DTO (non validée côté Factory) n'existe pas dans la navigation", () => {
  // « non-validee » n'est pas dans `categories` : même une famille qui la nomme ne la fait pas apparaître.
  const nav = buildNavigation([cat("ok")], [fam("f", "ok", ["non-validee"])]);
  assert.equal(nav.node("non-validee"), null);
  assert.ok(!JSON.stringify(nav.menu).includes("non-validee"));
  assert.deepEqual(nav.familySlugs("ok"), ["f"]);
});
