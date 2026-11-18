// S1-A I3 — mémoires du navigateur (favoris, comparateur, récemment consultés) : limites, refus, doublons, stockage refusé. Fenêtre simulée, aucune page.
import { test } from "node:test";
import assert from "node:assert/strict";

function installWindow({ denied = false } = {}) {
  const data = new Map();
  const events = [];
  globalThis.window = {
    localStorage: denied
      ? { getItem() { throw new Error("denied"); }, setItem() { throw new Error("denied"); } }
      : { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) },
    addEventListener() {}, removeEventListener() {}, dispatchEvent: (e) => { events.push(e.type); return true; },
  };
  globalThis.Event = class { constructor(type) { this.type = type; } };
  return { data, events };
}

const load = async (tag) => import(`../../components/site/local-list.ts?${tag}`);

test("le comparateur refuse la 5e famille sans rien retirer en silence ; un ajout déjà présent se retire", async () => {
  installWindow();
  const { toggleInList, KEYS } = await load("a");
  for (const s of ["a", "b", "c", "d"]) assert.equal(toggleInList(KEYS.compare, s), "added");
  assert.equal(toggleInList(KEYS.compare, "e"), "max");
  assert.equal(JSON.parse(window.localStorage.getItem(KEYS.compare)).join(","), "a,b,c,d");
  assert.equal(toggleInList(KEYS.compare, "b"), "removed");
  assert.equal(toggleInList(KEYS.compare, "e"), "added");
});

test("une adresse invalide n'entre jamais dans une liste (aucune valeur libre n'est stockée)", async () => {
  installWindow();
  const { toggleInList, KEYS } = await load("b");
  assert.equal(toggleInList(KEYS.wishlist, "../etc"), "max");
  assert.equal(toggleInList(KEYS.wishlist, "<script>"), "max");
  assert.equal(window.localStorage.getItem(KEYS.wishlist), null);
});

test("« récemment consultés » : le plus récent d'abord, sans doublon, 12 au plus", async () => {
  installWindow();
  const { rememberRecent, KEYS } = await load("c");
  for (let i = 0; i < 15; i++) rememberRecent(`f${i}`);
  rememberRecent("f3");
  const list = JSON.parse(window.localStorage.getItem(KEYS.recent));
  assert.equal(list.length, 12);
  assert.equal(list[0], "f3");
  assert.equal(new Set(list).size, 12);
});

test("une valeur abîmée dans le stockage est ignorée, jamais une erreur", async () => {
  const { data } = installWindow();
  const { toggleInList, KEYS } = await load("d");
  data.set(KEYS.wishlist, "{pas du json");
  assert.equal(toggleInList(KEYS.wishlist, "a"), "added");
  data.set(KEYS.compare, JSON.stringify(["ok", 7, "Mauvais Slug", "../x"]));
  assert.equal(toggleInList(KEYS.compare, "ok"), "removed", "seules les adresses valides sont relues");
});

test("stockage refusé (navigation privée) : la liste vit en mémoire, sans erreur", async () => {
  installWindow({ denied: true });
  const { toggleInList, KEYS } = await load("e");
  assert.equal(toggleInList(KEYS.wishlist, "a"), "added");
});
