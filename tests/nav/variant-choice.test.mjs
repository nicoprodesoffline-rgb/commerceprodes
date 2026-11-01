import { test } from "node:test";
import assert from "node:assert/strict";
import { adjustments, click, compatible, orderAxes } from "../../lib/site-catalog/variant-choice.ts";

// Catalogue publié (3 axes) : toutes les combinaisons ne sont PAS publiées.
const mk = (n, couleur, taille, matiere) => ({ public_item_key: `K${n}`, variant_axes: { couleur, taille, matiere } });
const ITEMS = [
  mk(1, "rouge", "S", "bois"), mk(2, "rouge", "M", "bois"), mk(3, "bleu", "S", "acier"), mk(4, "vert", "L", "acier"), mk(5, "rouge", "L", "acier"),
];
const keyOf = (state) => state.key;
const start = (key = "K1") => ({ key, pinned: {} });

test("sans choix épinglé, toute valeur qui existe est compatible (la sélection initiale n'est pas un choix)", () => {
  for (const [axis, value] of [["couleur", "bleu"], ["couleur", "vert"], ["taille", "L"], ["matiere", "acier"]]) assert.equal(compatible(ITEMS, {}, axis, value), true, `${axis}=${value}`);
  assert.equal(compatible(ITEMS, {}, "couleur", "jaune"), false, "une valeur qui n'existe pas ne l'est jamais");
  assert.equal(compatible(ITEMS, {}, "couleur", ""), false);
});

test("avec un choix épinglé, seules les valeurs portées par une variante publiée avec ce choix restent compatibles ; l'axe lui-même reste libre", () => {
  const pinned = { couleur: "bleu" };
  assert.equal(compatible(ITEMS, pinned, "taille", "S"), true);
  assert.equal(compatible(ITEMS, pinned, "taille", "M"), false);
  assert.equal(compatible(ITEMS, pinned, "taille", "L"), false);
  assert.equal(compatible(ITEMS, pinned, "matiere", "acier"), true);
  assert.equal(compatible(ITEMS, pinned, "matiere", "bois"), false);
  assert.equal(compatible(ITEMS, pinned, "couleur", "vert"), true, "l'axe choisi reste libre : on peut en changer");
});

test("clic : la combinaison voulue existe → elle est retenue, rien d'autre ne bouge", () => {
  const next = click(ITEMS, start("K1"), "taille", "M");
  assert.equal(keyOf(next), "K2");
  assert.deepEqual(next.pinned, { taille: "M" });
});

test("clic sur une valeur incompatible : recalage sur une variante publiée RÉELLE, jamais une combinaison inventée ; le choix est épinglé", () => {
  const next = click(ITEMS, start("K1"), "couleur", "bleu"); // bleu + S + bois n'existe pas
  assert.equal(keyOf(next), "K3");
  assert.deepEqual(next.pinned, { couleur: "bleu" });
  assert.ok(ITEMS.some((i) => i.public_item_key === next.key));
  assert.deepEqual(adjustments(ITEMS, "K1", "K3", "couleur"), [{ axis: "matiere", from: "bois", to: "acier" }]);
});

test("le recalage respecte TOUS les choix épinglés et se rapproche le plus de la sélection courante", () => {
  // Choix : matière acier. Puis couleur rouge : rouge+acier existe (K5, taille L) ; K2 (rouge, M, bois) ne respecte pas « acier ».
  let state = click(ITEMS, start("K1"), "matiere", "acier");
  assert.equal(keyOf(state), "K3", "acier + même couleur/taille n'existe pas → la plus proche portant acier");
  state = click(ITEMS, state, "couleur", "rouge");
  assert.equal(keyOf(state), "K5");
  assert.deepEqual(state.pinned, { matiere: "acier", couleur: "rouge" });
});

test("un choix qu'un recalage défait n'est plus épinglé ; les choix qui tiennent le restent", () => {
  let state = click(ITEMS, start("K1"), "taille", "M"); // K2, épinglé : taille M
  state = click(ITEMS, state, "couleur", "bleu"); // aucun bleu en M : taille M ne tient plus
  assert.equal(keyOf(state), "K3");
  assert.deepEqual(state.pinned, { couleur: "bleu" }, "taille=M n'est plus un choix : elle a été ajustée");
});

test("recliquer un choix épinglé le retire : la variante affichée ne bouge pas, l'axe redevient libre", () => {
  let state = click(ITEMS, start("K1"), "couleur", "bleu");
  assert.deepEqual(state.pinned, { couleur: "bleu" });
  const key = state.key;
  state = click(ITEMS, state, "couleur", "bleu");
  assert.equal(state.key, key);
  assert.deepEqual(state.pinned, {});
  for (const value of ["rouge", "bleu", "vert"]) assert.equal(compatible(ITEMS, state.pinned, "couleur", value), true);
  assert.equal(compatible(ITEMS, state.pinned, "taille", "M"), true, "sans choix, tout ce qui existe est de nouveau disponible");
});

test("propriété : après tout clic, la variante retenue est un Item publié qui porte la valeur cliquée ; le choix cliqué est épinglé", () => {
  const axes = ["couleur", "taille", "matiere"];
  for (const startKey of ITEMS.map((i) => i.public_item_key)) {
    for (const axis of axes) {
      for (const value of new Set(ITEMS.map((i) => i.variant_axes[axis]))) {
        const state = click(ITEMS, start(startKey), axis, value);
        const item = ITEMS.find((i) => i.public_item_key === state.key);
        assert.ok(item, `${startKey} ${axis}=${value}`);
        assert.equal(item.variant_axes[axis], value);
        assert.equal(state.pinned[axis], value);
        for (const [k, v] of Object.entries(state.pinned)) assert.equal(item.variant_axes[k], v, "tout choix épinglé est tenu par la variante retenue");
      }
    }
  }
});

test("propriété : jamais bloqué — chaque valeur publiée est atteignable depuis n'importe quelle variante, avec ou sans choix épinglés", () => {
  for (const startItem of ITEMS) {
    for (const pinnedAxis of ["couleur", "taille", "matiere"]) {
      const first = click(ITEMS, start(startItem.public_item_key), pinnedAxis, startItem.variant_axes[pinnedAxis]);
      for (const axis of ["couleur", "taille", "matiere"]) {
        for (const value of new Set(ITEMS.map((i) => i.variant_axes[axis]))) {
          const after = click(ITEMS, first, axis, value);
          assert.equal(ITEMS.find((i) => i.public_item_key === after.key).variant_axes[axis], value);
        }
      }
    }
  }
});

test("axes « type » en premier (casse et accents ignorés), ordre des autres inchangé", () => {
  const options = [{ axis: "couleur", label: "Couleur" }, { axis: "type_assise", label: "Type de siège" }, { axis: "taille", label: "Taille" }, { axis: "x", label: "Type" }];
  assert.deepEqual(orderAxes(options).map((o) => o.axis), ["type_assise", "x", "couleur", "taille"]);
  assert.deepEqual(orderAxes([{ axis: "a", label: "Typé" }, { axis: "b", label: "B" }]).map((o) => o.axis), ["a", "b"]);
  assert.deepEqual(orderAxes([]), []);
});

test("une clé inconnue ne change rien ; une valeur sans variante ne change rien", () => {
  const unknown = { key: "ZZ", pinned: {} };
  assert.equal(click(ITEMS, unknown, "couleur", "bleu"), unknown);
  const s = start();
  assert.equal(click(ITEMS, s, "couleur", "jaune"), s);
});
