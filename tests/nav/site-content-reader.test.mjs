import { test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { mkdtemp, writeFile, rm, readdir, rename, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

const hooks = registerHooks({ resolve(specifier, context, next) {
  return next(specifier === "./validate" && context.parentURL?.endsWith("/site-content/reader.ts") ? "./validate.ts" : specifier, context);
} });
const { readEditorialSet, __resetForTests } = await import("../../lib/site-content/reader.ts");
hooks.deregister();
const uuid = "77777777-7777-4777-8777-777777777777";
const refs = () => ({ categoryKeys: new Set(["demo"]), familyKeys: new Set(), mediaShas: new Set(), catalogSha256: "a".repeat(64) });
const doc = (generation, slug = "/demo") => ({ contract_version: "site_content.v1", generation, publication_id: uuid, catalogue_sequence: null, pages: [{ key: uuid, slug, title: "Page démo", revision: 1, seo_title: "", seo_description: "", canonical: "", sections: [{ type: "hero", data: { title: "Démo" } }] }] });
const name = n => `${String(n).padStart(12, "0")}-${uuid}.json`;
async function put(dir, d, { ready = true, receipt = {}, bytes = Buffer.from(JSON.stringify(d)) } = {}) {
  const file = name(d.generation);
  await writeFile(path.join(dir, file), bytes);
  if (ready) await writeFile(path.join(dir, file.replace(/\.json$/, ".ready.json")), JSON.stringify({ contract_version: "site_content.v1", generation: d.generation, publication_id: uuid, file, sha256: createHash("sha256").update(bytes).digest("hex"), ...receipt }));
  return file;
}
async function scenario(fn) {
  __resetForTests(); const dir = await mkdtemp(path.join(tmpdir(), "site-content-demo-"));
  try { await fn(dir); } finally { await rm(dir, { recursive: true, force: true }); __resetForTests(); }
}

test("dossier absent, relatif ou non configuré : null sans exception", async () => {
  for (const dir of [undefined, "", "relative", path.join(tmpdir(), "site-content-demo-absent")]) assert.equal(await readEditorialSet(dir, refs()), null);
});
test("document sans reçu ignoré ; le lecteur n'écrit rien", () => scenario(async dir => {
  await put(dir, doc(1), { ready: false }); const before = await readdir(dir);
  assert.equal(await readEditorialSet(dir, refs()), null); assert.deepEqual(await readdir(dir), before);
}));
test("empreinte des octets, non d'un JSON resérialisé ; SHA altéré refusé", () => scenario(async dir => {
  await put(dir, doc(1), { bytes: Buffer.from(JSON.stringify(doc(1), null, 2) + "\n") });
  assert.equal((await readEditorialSet(dir, refs())).generation, 1);
  __resetForTests(); await writeFile(path.join(dir, name(1)), JSON.stringify(doc(1)) + " ");
  assert.equal(await readEditorialSet(dir, refs()), null);
}));
test("reçus : version, génération, publication, basename, empreinte obligatoires", async () => {
  for (const receipt of [{ contract_version: "autre" }, { generation: 2 }, { publication_id: "88888888-8888-4888-8888-888888888888" }, { file: "../demo.json" }, { file: "a/b.json" }, { file: "a\\b.json" }, { file: "autre.json" }, { sha256: "demo" }]) await scenario(async dir => {
    await put(dir, doc(1), { receipt }); assert.equal(await readEditorialSet(dir, refs()), null);
  });
});
test("identités du document et du nom incohérentes refusées", async () => {
  for (const change of [d => { d.generation = 2; }, d => { d.publication_id = "88888888-8888-4888-8888-888888888888"; }]) await scenario(async dir => {
    const d = doc(1); change(d);
    await put(dir, doc(1), { bytes: Buffer.from(JSON.stringify(d)) });
    assert.equal(await readEditorialSet(dir, refs()), null);
  });
});
test("plus grande génération valide ; repli atomique si une seule page est invalide", () => scenario(async dir => {
  await put(dir, doc(1, "/demo-a")); await put(dir, doc(2, "/demo-b"));
  const d = doc(3, "/demo-c"); d.pages.push({ ...doc(3).pages[0], slug: "/demo-invalide", sections: [{ type: "category_grid", data: { categories: ["absente"] } }] });
  await put(dir, d);
  const set = await readEditorialSet(dir, refs()); assert.equal(set.generation, 2); assert.deepEqual(set.pages.map(p => p.slug), ["/demo-b"]);
}));
test("régression refusée, jeu courant retenu ; pages vides retirent tout", () => scenario(async dir => {
  await put(dir, doc(2)); const set = await readEditorialSet(dir, refs());
  await rm(path.join(dir, name(2))); await put(dir, doc(1, "/demo-retour"));
  assert.strictEqual(await readEditorialSet(dir, refs()), set);
  await put(dir, { ...doc(3), pages: [] }); assert.deepEqual((await readEditorialSet(dir, refs())).pages, []);
}));
test("cache idempotent, invalidation par fichiers et catalogue, revalidation du jeu retenu", () => scenario(async dir => {
  const d = doc(1); d.pages[0].sections = [{ type: "category_grid", data: { categories: ["demo"] } }]; await put(dir, d);
  const first = await readEditorialSet(dir, refs()); assert.strictEqual(await readEditorialSet(dir, refs()), first);
  const changed = { ...refs(), categoryKeys: new Set(), catalogSha256: "b".repeat(64) };
  assert.equal(await readEditorialSet(dir, changed), null);
  await put(dir, doc(2, "/demo-nouvelle")); assert.equal((await readEditorialSet(dir, changed)).generation, 2);
}));
test("cache : pas de relecture avant 5 s, invalidation par empreinte même à clés identiques", t => scenario(async dir => {
  const warnings = t.mock.method(console, "warn", () => {});
  const realNow = Date.now();
  const now = t.mock.method(Date, "now", () => realNow);
  await put(dir, doc(1), { receipt: { sha256: "b".repeat(64) } });
  assert.equal(await readEditorialSet(dir, refs()), null);
  assert.equal(warnings.mock.callCount(), 1);
  assert.equal(await readEditorialSet(dir, refs()), null);
  assert.equal(warnings.mock.callCount(), 1, "aucune nouvelle lecture du couple inchangé");
  const changed = { ...refs(), catalogSha256: "c".repeat(64) };
  assert.equal(await readEditorialSet(dir, changed), null);
  assert.equal(warnings.mock.callCount(), 2, "nouvelle validation sur une autre empreinte catalogue");
  now.mock.mockImplementation(() => realNow + 5000);
  assert.equal(await readEditorialSet(dir, changed), null);
  assert.equal(warnings.mock.callCount(), 3, "cache expiré au plus tard après 5 secondes");
}));
test("document > 2 MiB, JSON invalide et noms invalides ignorés", () => scenario(async dir => {
  await put(dir, doc(1), { bytes: Buffer.alloc(2 * 1024 * 1024 + 1, 32) }); assert.equal(await readEditorialSet(dir, refs()), null);
  await put(dir, doc(2), { bytes: Buffer.from("{") }); assert.equal(await readEditorialSet(dir, refs()), null);
  await writeFile(path.join(dir, "demo.json"), JSON.stringify(doc(3))); assert.equal(await readEditorialSet(dir, refs()), null);
}));
test("borne exacte de 2 MiB acceptée, aucun suivi de lien symbolique", () => scenario(async dir => {
  const raw = Buffer.from(JSON.stringify(doc(1)));
  await put(dir, doc(1), { bytes: Buffer.concat([raw, Buffer.alloc(2 * 1024 * 1024 - raw.length, 32)]) });
  assert.equal((await readEditorialSet(dir, refs())).generation, 1);
  __resetForTests();
  await rename(path.join(dir, name(1)), path.join(dir, "demo-target"));
  await symlink("demo-target", path.join(dir, name(1)));
  assert.equal(await readEditorialSet(dir, refs()), null);
}));
test("reçu réparé et nouveau dossier : invalidation et provenance isolée", () => scenario(async dir => {
  await put(dir, doc(5), { ready: false }); assert.equal(await readEditorialSet(dir, refs()), null);
  await put(dir, doc(5)); assert.equal((await readEditorialSet(dir, refs())).generation, 5);
  const other = await mkdtemp(path.join(tmpdir(), "site-content-demo-other-"));
  try { await put(other, doc(1)); assert.equal((await readEditorialSet(other, refs())).generation, 1); }
  finally { await rm(other, { recursive: true, force: true }); }
}));
test("lectures concurrentes ne peuvent faire régresser le jeu", () => scenario(async dir => {
  await put(dir, doc(4)); const sets = await Promise.all(Array.from({ length: 5 }, () => readEditorialSet(dir, refs())));
  assert.ok(sets.every(s => s === sets[0] && s.generation === 4));
}));
