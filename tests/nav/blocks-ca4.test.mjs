// CA-4 (cercle A) — les blocs de l'accueil vus par le SITE : dates de début et de fin de tout type de bloc, familles du jour d'un bloc « selection »,
// le jour de Paris, et la preuve qu'aucun choix n'est gardé d'une requête à l'autre. Les 16 cas V2_BLOCKS communs sont rejoués par `npm run c0v2:test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { load } from "./load-ts.mjs";

const { liveSections, livePage, selectionFamilies } = load("lib/site-content/blocks.ts");
const { editorialFromV2 } = load("lib/site-content/v2.ts");

const keys = (n) => Array.from({ length: n }, (_, i) => `famille-${String(i + 1).padStart(2, "0")}`);
const selection = (families, shown, rotation, extra = {}) => ({ type: "selection", data: { title: "À découvrir", source: "promotions", families, shown, rotation }, ...extra });
const MODELES = {
  hero: { type: "hero", data: { title: "Bandeau" } },
  faq: { type: "faq", data: { questions: [{ question: "Q ?", answer: "R." }] } },
  rich_text: { type: "rich_text", data: { text: "Texte." } },
  product_carousel: { type: "product_carousel", data: { families: keys(2) } },
  selection: selection(keys(5), 2, "daily"),
};
const bloc = (type, extra = {}) => ({ ...MODELES[type], ...extra });

test("CA-4 : un bloc est montré de son début (inclus) à sa fin (exclue), quel que soit son type", () => {
  for (const type of ["hero", "faq", "rich_text", "product_carousel", "selection"]) {
    const dated = bloc(type, { starts_at_utc: "2026-12-01T10:00:00Z", ends_at_utc: "2026-12-05T10:00:00Z" });
    const shownAt = (instant) => liveSections([dated], instant).length === 1;
    assert.equal(shownAt("2026-12-01T09:59:59Z"), false, `${type} avant son début`);
    assert.equal(shownAt("2026-12-01T10:00:00Z"), true, `${type} à son début`);
    assert.equal(shownAt("2026-12-05T09:59:59Z"), true, `${type} juste avant sa fin`);
    assert.equal(shownAt("2026-12-05T10:00:00Z"), false, `${type} à sa fin`);
  }
});

test("CA-4 : un bloc sans date est toujours montré, un bloc à une seule date n'est borné que d'un côté", () => {
  assert.equal(liveSections([bloc("rich_text")], "2020-01-01T00:00:00Z").length, 1);
  assert.equal(liveSections([bloc("rich_text", { starts_at_utc: "2026-12-01T00:00:00Z" })], "2026-11-30T23:59:59Z").length, 0);
  assert.equal(liveSections([bloc("rich_text", { starts_at_utc: "2026-12-01T00:00:00Z" })], "2099-01-01T00:00:00Z").length, 1);
  assert.equal(liveSections([bloc("rich_text", { ends_at_utc: "2026-12-01T00:00:00Z" })], "2020-01-01T00:00:00Z").length, 1);
});

test("CA-4 : la page entière suit les dates, l'ordre des blocs restants est gardé", () => {
  const page = { key: "k", slug: "/", title: "Accueil", nav: { showInBar: true, order: 0 }, revision: 1, seo_title: "", seo_description: "", canonical: "",
    sections: [bloc("hero", { ends_at_utc: "2026-12-01T00:00:00Z" }), bloc("rich_text"), bloc("faq", { starts_at_utc: "2026-12-10T00:00:00Z" })] };
  assert.deepEqual(livePage(page, "2026-11-30T00:00:00Z").sections.map((s) => s.type), ["hero", "rich_text"]);
  assert.deepEqual(livePage(page, "2026-12-02T00:00:00Z").sections.map((s) => s.type), ["rich_text"]);
  assert.deepEqual(livePage(page, "2026-12-11T00:00:00Z").sections.map((s) => s.type), ["rich_text", "faq"]);
});

test("CA-4 : une réserve de Y familles avec Y ≤ X est montrée entière, dans son ordre, sans tourner", () => {
  for (const [y, x] of [[3, 3], [3, 5], [1, 4]]) {
    const section = selection(keys(y), x, "daily");
    for (const day of ["2026-11-26T12:00:00Z", "2026-11-27T12:00:00Z", "2026-12-24T12:00:00Z"]) assert.deepEqual(selectionFamilies(section, day), keys(y));
  }
});

test("CA-4 : « fixed » montre les X premières familles chaque jour ; « daily » avance de X familles par jour de Paris et boucle", () => {
  const reserve = keys(5);
  const fixed = selection(reserve, 2, "fixed");
  assert.deepEqual(selectionFamilies(fixed, "2026-11-26T12:00:00Z"), reserve.slice(0, 2));
  assert.deepEqual(selectionFamilies(fixed, "2026-11-27T12:00:00Z"), reserve.slice(0, 2));
  const daily = selection(reserve, 2, "daily");
  const days = Array.from({ length: 5 }, (_, i) => `2026-11-${String(26 + i).padStart(2, "0")}T12:00:00Z`);
  const picks = days.map((day) => selectionFamilies(daily, day));
  for (let i = 1; i < picks.length; i += 1) {
    const before = reserve.indexOf(picks[i - 1][0]);
    assert.equal(picks[i][0], reserve[(before + 2) % 5], `le jour ${i} avance de 2 familles`);
    assert.equal(picks[i].length, 2);
  }
  // Sur Y = 5 jours, chaque famille est montrée autant de fois que les autres (2 × 5 / 5 = 2).
  const count = new Map();
  for (const key of days.flatMap((day) => selectionFamilies(daily, day))) count.set(key, (count.get(key) ?? 0) + 1);
  assert.deepEqual([...count.values()], [2, 2, 2, 2, 2]);
});

test("CA-4 : le choix change à minuit à PARIS, pas à minuit UTC, aux deux changements d'heure aussi", () => {
  const daily = selection(keys(7), 3, "daily");
  const pick = (instant) => selectionFamilies(daily, instant).join();
  // Hiver (UTC+1) : 23 h 59 à Paris le 26/11 = 22:59 UTC ; 0 h 01 à Paris le 27/11 = 23:01 UTC.
  assert.notEqual(pick("2026-11-26T22:59:00Z"), pick("2026-11-26T23:01:00Z"), "minuit d'hiver à Paris");
  assert.equal(pick("2026-11-26T23:01:00Z"), pick("2026-11-27T12:00:00Z"));
  // Été (UTC+2) : 0 h 01 à Paris le 15/07 = 22:01 UTC le 14/07, avant minuit UTC.
  assert.notEqual(pick("2027-07-14T21:59:00Z"), pick("2027-07-14T22:01:00Z"), "minuit d'été à Paris, avant le jour UTC");
  assert.equal(pick("2027-07-14T22:01:00Z"), pick("2027-07-15T12:00:00Z"));
  // Passage à l'heure d'été 2027 (dimanche 28 mars, 01:00 UTC) : la veille 23:00 UTC est déjà minuit à Paris, le jour suivant 22:00 UTC aussi.
  assert.equal(pick("2027-03-27T22:59:59Z"), pick("2027-03-27T12:00:00Z"));
  assert.equal(pick("2027-03-27T23:00:00Z"), pick("2027-03-28T12:00:00Z"));
  assert.equal(pick("2027-03-28T21:59:59Z"), pick("2027-03-28T12:00:00Z"));
  assert.notEqual(pick("2027-03-28T22:00:00Z"), pick("2027-03-28T21:59:59Z"));
  // Retour à l'heure d'hiver 2027 (dimanche 31 octobre, 01:00 UTC) : minuit à Paris du 31 = 22:00 UTC le 30 ; du 1er novembre = 23:00 UTC le 31.
  assert.notEqual(pick("2027-10-30T21:59:59Z"), pick("2027-10-30T22:00:00Z"));
  assert.equal(pick("2027-10-30T22:00:00Z"), pick("2027-10-31T12:00:00Z"));
  assert.equal(pick("2027-10-31T22:59:59Z"), pick("2027-10-31T12:00:00Z"));
  assert.notEqual(pick("2027-10-31T22:59:59Z"), pick("2027-10-31T23:00:00Z"));
});

test("CA-4 : rien n'est gardé entre deux requêtes : une réponse de 23 h 59 n'est pas celle de 0 h 01, un bloc échu disparaît sans nouvel envoi", () => {
  const page = { key: "k", slug: "/", title: "Accueil", nav: { showInBar: true, order: 0 }, revision: 1, seo_title: "", seo_description: "", canonical: "",
    sections: [selection(keys(6), 2, "daily", { ends_at_utc: "2026-11-27T10:00:00Z" })] };
  const draw = (instant) => livePage(page, instant).sections.map((s) => selectionFamilies(s, instant).join("+"));
  const before = draw("2026-11-26T22:59:00Z");
  const after = draw("2026-11-26T23:01:00Z");
  assert.equal(before.length, 1);
  assert.equal(after.length, 1);
  assert.notEqual(before[0], after[0]);
  assert.deepEqual(draw("2026-11-27T10:00:00Z"), []);
  // Le même appel, redonné au même instant, redonne le même choix : c'est une fonction de l'instant, pas d'un état.
  assert.deepEqual(draw("2026-11-26T22:59:00Z"), before);
});

test("CA-4 : l'accueil est servi à chaque requête, sans cache de page ni en-tête de cache qui survive à minuit", () => {
  const root = path.resolve(import.meta.dirname, "../..");
  const home = readFileSync(path.join(root, "app/page.tsx"), "utf8");
  assert.match(home, /export const dynamic = "force-dynamic"/);
  assert.doesNotMatch(home, /export const revalidate|unstable_cache|"use cache"|s-maxage|stale-while-revalidate/);
  const config = readFileSync(path.join(root, "next.config.ts"), "utf8");
  assert.doesNotMatch(config, /s-maxage|stale-while-revalidate|max-age=[1-9]/);
  const sections = readFileSync(path.join(root, "components/content/sections.tsx"), "utf8");
  assert.doesNotMatch(sections, /unstable_cache|"use cache"|React\.cache|\bcache\(/);
});

test("CA-4 : les blocs « selection » et les dates du document v2 arrivent jusqu'à l'affichage, telles que le contrat les donne", () => {
  const doc = JSON.parse(readFileSync(path.resolve(import.meta.dirname, "../../c0v2/fixtures/documents/V2_CONTENT/content_with_home_blocks.json"), "utf8"));
  const home = editorialFromV2(doc).pages.find((p) => p.slug === "/");
  const raw = doc.pages.find((p) => p.slug === "/").sections;
  assert.equal(home.sections.length, raw.length);
  assert.ok(home.sections.some((s) => s.type === "selection"), "le document porte un bloc selection");
  raw.forEach((r, i) => {
    assert.equal(home.sections[i].type, r.type);
    assert.equal(home.sections[i].starts_at_utc, r.starts_at_utc);
    assert.equal(home.sections[i].ends_at_utc, r.ends_at_utc);
    if (r.type === "selection") assert.deepEqual(home.sections[i].data, { title: r.data.title, source: r.data.source, families: r.data.families, shown: r.data.shown, rotation: r.data.rotation });
  });
});
