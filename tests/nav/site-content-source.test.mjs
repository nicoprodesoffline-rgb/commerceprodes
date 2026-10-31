import { test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

// Seul l'accès au catalogue est remplacé ; source, construction des refs et lecteur restent réels.
const catalogStub = "data:text/javascript," + encodeURIComponent("let value = null; export function setCatalog(v) { value = v; } export async function catalogOrNull() { if (value instanceof Error) throw value; return value; }");
const hooks = registerHooks({ resolve(specifier, context, next) {
  if (specifier === "@/lib/site-catalog/page") return next(catalogStub, context);
  if (context.parentURL?.includes("/lib/site-content/") && ["./pages", "./reader", "./validate"].includes(specifier)) return next(specifier + ".ts", context);
  return next(specifier, context);
} });
const { setCatalog } = await import(catalogStub);
const { getEditorialSet, loadUniverse } = await import("../../lib/site-content/source.ts");
const { __resetForTests } = await import("../../lib/site-content/reader.ts");
hooks.deregister();
const uuid = "77777777-7777-4777-8777-777777777777";
const main = "a".repeat(64), item = "b".repeat(64);
const catalog = () => ({ meta: { payload_sha256: "c".repeat(64) }, categories: [{ category_key: "demo-category" }], families: [{ public_family_key: "demo-family", image_main_sha256: main, items: [{ public_media_refs: [item] }] }] });
const page = slug => ({ key: uuid, slug, title: "Page démo", revision: 1, seo_title: "", seo_description: "", canonical: "", sections: [
  { type: "category_grid", data: { categories: ["demo-category"] } },
  { type: "product_carousel", data: { families: ["demo-family"] } },
  { type: "text_image", data: { text: "Démo", media_sha: main } },
  { type: "text_image", data: { text: "Démo", media_sha: item } },
] });

test("source réelle : refs catégories, familles, images principales et médias d'items ; univers publié seulement", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "site-content-source-demo-"));
  const previous = process.env.SITE_CONTENT_DIR;
  __resetForTests();
  try {
    process.env.SITE_CONTENT_DIR = dir;
    const file = `000000000001-${uuid}.json`;
    const bytes = Buffer.from(JSON.stringify({ contract_version: "site_content.v1", generation: 1, publication_id: uuid, catalogue_sequence: null, pages: [page("/"), page("/demo"), page("/saison/noel")] }));
    await writeFile(path.join(dir, file), bytes);
    await writeFile(path.join(dir, file.replace(/\.json$/, ".ready.json")), JSON.stringify({ contract_version: "site_content.v1", generation: 1, publication_id: uuid, file, sha256: createHash("sha256").update(bytes).digest("hex") }));
    setCatalog(catalog());
    const first = await getEditorialSet(); assert.equal(first.generation, 1);
    assert.strictEqual(await getEditorialSet(), first);
    assert.deepEqual(await loadUniverse(), [{ slug: "demo", title: "Page démo", order: 100, showInBar: true }, { slug: "saison/noel", title: "Page démo", order: 100, showInBar: true }] /* depuis les champs optionnels du contrat : valeurs par défaut des anciens documents */);
    setCatalog({ ...catalog(), families: [], meta: { payload_sha256: "d".repeat(64) } });
    assert.equal(await getEditorialSet(), null, "aucun ancien jeu servi avec des références devenues absentes");
    assert.deepEqual(await loadUniverse(), []);
    setCatalog(null); assert.equal(await getEditorialSet(), null);
  } finally {
    if (previous === undefined) delete process.env.SITE_CONTENT_DIR; else process.env.SITE_CONTENT_DIR = previous;
    setCatalog(null); __resetForTests(); await rm(dir, { recursive: true, force: true });
  }
});
test("exception catalogue : aucun échec de page, diagnostic sans contenu de l'erreur", async t => {
  const warnings = t.mock.method(console, "warn", () => {});
  setCatalog(new Error("demo-ne-pas-journaliser"));
  try { assert.equal(await getEditorialSet(), null); assert.deepEqual(await loadUniverse(), []); }
  finally { setCatalog(null); }
  assert.ok(warnings.mock.calls.length > 0);
  assert.ok(warnings.mock.calls.every(call => call.arguments[0] === "[site-content] SOURCE_UNAVAILABLE"));
});
