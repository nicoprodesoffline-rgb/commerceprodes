// Modèle site_content.v1 : navigation facultative ; données fictives uniquement.
import { test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { universeEntries, SLUG_RE, UNIVERSE_MAX } from "../../lib/site-content/pages.ts";

const sourceUrl = new URL("../../lib/site-content/source.ts", import.meta.url).href;
const stub = "data:text/javascript," + encodeURIComponent("let value = null; export function setCatalog(v) { value = v; } export async function catalogOrNull() { return value; }");
const hooks = registerHooks({ resolve(specifier, context, next) {
  if (specifier === "@/lib/site-catalog/page" && context.parentURL === sourceUrl) return next(stub, context);
  if (context.parentURL?.includes("/lib/site-content/") && ["./pages", "./reader", "./validate"].includes(specifier)) return next(specifier + ".ts", context);
  return next(specifier, context);
} });
const { getPagesSource, loadUniverse, getEditorialSet } = await import(sourceUrl);
const { setCatalog } = await import(stub);
hooks.deregister();
const page = (slug, title = "Page démo", extra = {}) => ({ slug, title, order: 100, showInBar: true, ...extra });

test("accueil exclu, segments métier et saisonniers conservés", () => {
  assert.deepEqual(universeEntries([page("/", "Accueil"), page("collectivites"), page("saison/noel_2026")]).map(p => p.slug), ["collectivites", "saison/noel_2026"]);
});
test("slugs invalides écartés, longueur sans / initial au plus 199", () => {
  const invalid = ["../x", "A", "", "/demo", "a//b", "a/", "a?b", "a#b", "a%2fb", "a\\b", "a\n", "a".repeat(200)];
  assert.deepEqual(universeEntries(invalid.map(slug => page(slug))), []);
  assert.ok(SLUG_RE.test("saison/noel_2026"));
  assert.equal(universeEntries([page("a".repeat(199))]).length, 1);
});
test("titres vides, contrôles et borne 200 ; titres retenus nettoyés", () => {
  assert.deepEqual(universeEntries([page("vide", ""), page("espaces", "   "), page("long", "a".repeat(201)), page("controle", "a\t")]), []);
  assert.equal(universeEntries([page("borne", "a".repeat(200))]).length, 1);
  assert.equal(universeEntries([page("unicode", "🟢".repeat(200))]).length, 1);
  assert.equal(universeEntries([page("nettoye", "  Page démo  ")])[0].title, "Page démo");
});
test("première occurrence valide gagne avant tri ; liste reçue jamais modifiée", () => {
  const first = page("commun", "Première", { order: 10 });
  assert.deepEqual(universeEntries([first, page("commun", "Autre", { order: 0 })]), [first]);
  assert.deepEqual(universeEntries([page("commun", ""), first]), [first]);
  const pages = Object.freeze([page("z"), page("a"), page("saison/noel")]);
  assert.deepEqual(universeEntries(pages), [pages[1], pages[2], pages[0]]);
  assert.deepEqual(pages.map(p => p.slug), ["z", "a", "saison/noel"]);
});
test("tri par ordre puis slug binaire, visibilité et défauts des anciens documents", () => {
  const pages = [page("z", "Démo", { order: 0 }), page("a", "Démo", { order: 1 }), page("a_b"), page("a-b"), page("cachee", "Démo", { showInBar: false, order: 0 }), { slug: "ancien", title: "Ancienne" }, page("/", "Accueil", { order: 0 })];
  assert.deepEqual(universeEntries(pages), [pages[0], pages[1], pages[3], pages[2], page("ancien", "Ancienne")]);
  assert.deepEqual(universeEntries([{ slug: "/", title: "Accueil" }]), []);
});
test("plafond huit entrées, appliqué après filtrage, dédoublonnage et tri", () => {
  const pages = Array.from({ length: 12 }, (_, i) => page(`demo-${i}`));
  assert.equal(UNIVERSE_MAX, 8);
  assert.deepEqual(universeEntries([page("/"), page("cachee", "Démo", { showInBar: false }), pages[0], ...pages]).map(p => p.slug), ["demo-0", "demo-1", "demo-10", "demo-11", "demo-2", "demo-3", "demo-4", "demo-5"]);
});
test("entrées mal formées écartées sans exception", () => {
  const malformed = [null, undefined, 42, "page", [], {}, { slug: "sans-titre" }, page(42), page("titre", 42)];
  for (const order of [-1, 1.5, "3", null, NaN, Infinity, 1000001]) malformed.push(page("ordre", "Démo", { order }));
  for (const showInBar of [0, "false", null, {}]) malformed.push(page("visibilite", "Démo", { showInBar }));
  assert.deepEqual(universeEntries([...malformed, page("valide")]), [page("valide")]);
  assert.equal(universeEntries([page("borne", "Démo", { order: 1000000 })]).length, 1);
});
test("liste vide ou mauvais type : liste vide", () => {
  for (const input of [[], null, undefined, 42, "pages", {}]) assert.deepEqual(universeEntries(input), []);
});
test("sans catalogue, source et univers vides", async () => {
  assert.deepEqual(await getPagesSource().listPublished(), []);
  assert.deepEqual(await loadUniverse(), []);
});
test("loadUniverse filtre la source et ne lève jamais", async () => {
  assert.deepEqual(await loadUniverse({ listPublished: async () => [page("/"), page("metier")] }), [page("metier")]);
  for (const source of [null, {}, { listPublished() { throw new Error("Démo"); } }, { listPublished: async () => { throw new Error("Démo"); } }]) assert.deepEqual(await loadUniverse(source), []);
});

test("navigation facultative propagée par la source ; champs conservés lors du repli et références revalidées", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "site-content-nav-demo-"));
  const previous = process.env.SITE_CONTENT_DIR;
  const uuid = "88888888-8888-4888-8888-888888888888";
  const media = "a".repeat(64);
  const rawPage = (slug, nav) => ({ key: uuid, slug, title: "Démo", revision: 1, seo_title: "", seo_description: "", canonical: "", ...(nav === undefined ? {} : { nav }), sections: [
    { type: "hero", data: { title: "Démo", link_label: "Explorer démo", link: "/demo" } },
    { type: "text_image", data: { text: "Démo", media_sha: media, image_alt: "Image démo" } },
  ] });
  const file = `000000000001-${uuid}.json`;
  const bytes = Buffer.from(JSON.stringify({ contract_version: "site_content.v1", generation: 1, publication_id: uuid, catalogue_sequence: null, pages: [rawPage("/"), rawPage("/ancien"), rawPage("/cachee", { show_in_bar: false }), rawPage("/prioritaire", { order: 0 })] }));
  try {
    process.env.SITE_CONTENT_DIR = dir;
    setCatalog({ meta: { payload_sha256: "b".repeat(64) }, categories: [], families: [{ image_main_sha256: media, items: [] }] });
    await writeFile(path.join(dir, file), bytes);
    await writeFile(path.join(dir, file.replace(/\.json$/, ".ready.json")), JSON.stringify({ contract_version: "site_content.v1", generation: 1, publication_id: uuid, file, sha256: createHash("sha256").update(bytes).digest("hex") }));
    const expected = [page("prioritaire", "Démo", { order: 0 }), page("ancien", "Démo")];
    assert.deepEqual(await loadUniverse(), expected);
    const set = await getEditorialSet();
    assert.deepEqual(set.pages.map(p => p.slug), ["/", "/ancien", "/cachee", "/prioritaire"]);
    assert.deepEqual((await getPagesSource().listPublished()).find(p => p.slug === "cachee"), page("cachee", "Démo", { showInBar: false }));
    await rm(path.join(dir, file));
    assert.strictEqual(await getEditorialSet(), set, "repli sur le même modèle, y compris les nouveaux champs normalisés");
    assert.equal(set.pages[0].sections[0].data.linkLabel, "Explorer démo");
    assert.equal(set.pages[0].sections[1].data.imageAlt, "Image démo");
    assert.deepEqual(await loadUniverse(), expected);
    setCatalog({ meta: { payload_sha256: "c".repeat(64) }, categories: [], families: [] });
    assert.equal(await getEditorialSet(), null, "le média absent interdit de conserver le jeu malgré ses nouveaux champs");
  } finally {
    if (previous === undefined) delete process.env.SITE_CONTENT_DIR; else process.env.SITE_CONTENT_DIR = previous;
    setCatalog(null);
    await rm(dir, { recursive: true, force: true });
  }
});
