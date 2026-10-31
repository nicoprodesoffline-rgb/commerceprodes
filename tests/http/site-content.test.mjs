// Recette HTTP locale, sans navigateur ni base. Exécution : npm run test:content
// Le catalogue gelé est lu, jamais réécrit ; seuls les exports éditoriaux temporaires sont créés.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

const ROOT = path.resolve(import.meta.dirname, "../..");
const PORT = Number(process.env.CONTENT_PORT ?? 3125);
const BASE = `http://127.0.0.1:${PORT}`;
const FIXTURE = "F_FULL_CORRUPT/snapshot_s10_active.json";
const publicationId = "77777777-7777-4777-8777-777777777777";
const pageKey = "88888888-8888-4888-8888-888888888888";
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const page = (slug, sections, extra = {}) => ({ key: pageKey, slug, title: "Page démo", revision: 1, seo_title: "SEO démo", seo_description: "Description démo", canonical: slug, sections, ...extra });
async function publish(dir, generation, pages) {
  const file = `${String(generation).padStart(12, "0")}-${publicationId}.json`;
  const bytes = Buffer.from(JSON.stringify({ contract_version: "site_content.v1", generation, publication_id: publicationId, catalogue_sequence: null, pages }));
  await writeFile(path.join(dir, file), bytes);
  await writeFile(path.join(dir, file.replace(/\.json$/, ".ready.json")), JSON.stringify({ contract_version: "site_content.v1", generation, publication_id: publicationId, file, sha256: createHash("sha256").update(bytes).digest("hex") }));
}
async function portAnswers() {
  try { await fetch(BASE + "/", { signal: AbortSignal.timeout(500) }); return true; } catch { return false; }
}
async function withServer(dir, fn, { fixture = FIXTURE, origin = "https://demo.invalid" } = {}) {
  assert.equal(await portAnswers(), false, `port ${PORT} occupé`);
  const child = spawn(process.execPath, [path.join(ROOT, "node_modules/next/dist/bin/next"), "start", "-H", "127.0.0.1", "-p", String(PORT)], {
    cwd: ROOT,
    env: { PATH: process.env.PATH, HOME: process.env.HOME, NEXT_TELEMETRY_DISABLED: "1", SITE_ENV: "staging", SITE_NOW_UTC: "2026-10-19T06:00:00Z", SITE_CATALOG_SOURCE: "fixture", SITE_CATALOG_FIXTURE: fixture, ...(dir === undefined ? {} : { SITE_CONTENT_DIR: dir }), SITE_PUBLIC_ORIGIN: origin },
    stdio: ["ignore", "ignore", "pipe"],
  });
  let exited = false;
  let stderr = "";
  child.stderr.on("data", chunk => { stderr = (stderr + chunk.toString()).slice(-4000); });
  const closed = new Promise(resolve => child.once("exit", () => { exited = true; resolve(); }));
  let spawnError;
  child.once("error", error => { spawnError = error; });
  try {
    const deadline = Date.now() + 30000;
    while (!(await portAnswers())) {
      if (spawnError) throw spawnError;
      if (exited || Date.now() > deadline) throw new Error(`serveur non démarré : ${stderr}`);
      await sleep(150);
    }
    await fn();
  } finally {
    if (!exited && child.pid) { child.kill("SIGTERM"); await closed; }
  }
}
async function get(route) {
  const response = await fetch(BASE + route);
  const text = (await response.text()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  return { status: response.status, text };
}
const universe = html => /<nav[^>]*data-testid="universe-bar"[^>]*>([\s\S]*?)<\/nav>/.exec(html)?.[1] ?? "";

test("pages publiées : 4 sections, échappement, vrais 404, accueil, retrait et repli atomique", async () => {
  const catalog = JSON.parse(await readFile(path.join(ROOT, "c0/fixtures/documents", FIXTURE), "utf8"));
  const category = catalog.categories[0].category_key;
  const families = catalog.families.slice(0, 2).reverse();
  const media = families[0].image_main_sha256;
  const blocks = [
    { type: "hero", data: { title: "Bandeau démo", text: "<script>demo()</script>\n<img src=x onerror=demo()>", link: "/recherche" } },
    { type: "category_grid", data: { title: "Catégories démo", categories: [category] } },
    { type: "product_carousel", data: { title: "Familles démo", families: families.map(f => f.public_family_key) } },
    { type: "text_image", data: { title: "Image démo", text: "Texte démo\nSuite démo", media_sha: media } },
  ];
  const dir = await mkdtemp(path.join(tmpdir(), "site-content-http-demo-"));
  try {
    await publish(dir, 1, [page("/demo", blocks), page("/saison/noel", [blocks[3]], { title: "Saison démo", seo_title: "", canonical: "" })]);
    await withServer(dir, async () => {
      const first = await get("/p/demo"); assert.equal(first.status, 200);
      for (const type of ["hero", "category-grid", "product-carousel", "text-image"]) assert.ok(first.text.includes(`data-testid="section-${type}"`));
      const positions = ["hero", "category-grid", "product-carousel", "text-image"].map(type => first.text.indexOf(`data-testid="section-${type}"`));
      assert.deepEqual(positions, [...positions].sort((a, b) => a - b));
      assert.match(first.text, /&lt;script&gt;demo\(\)&lt;\/script&gt;/);
      assert.match(first.text, /&lt;img src=x onerror=demo\(\)&gt;/);
      assert.doesNotMatch(first.text, /<img src=x/);
      assert.match(first.text, /href="\/recherche"[^>]*>Découvrir/);
      assert.ok(first.text.includes(`href="/categorie/${category}"`));
      assert.ok(first.text.indexOf(`href="/famille/${families[0].slug}"`) < first.text.indexOf(`href="/famille/${families[1].slug}"`));
      assert.match(first.text, /data-testid="family-price"/);
      assert.ok(first.text.includes(`src="/media/${media}" alt=""`));
      assert.match(first.text, /<h1[^>]*>Bandeau démo<\/h1>/);
      assert.equal((first.text.match(/<h1\b/g) ?? []).length, 1);
      assert.match(first.text, /<title>SEO démo \| PRODES<\/title>/);
      assert.match(first.text, /<meta name="description" content="Description démo"/);
      assert.match(first.text, /<link rel="canonical" href="https:\/\/demo.invalid\/demo"/);
      assert.match(first.text, /<meta name="robots" content="noindex, nofollow"/);
      assert.match(universe(first.text), /<a(?=[^>]*href="\/p\/demo")(?=[^>]*aria-current="page")/, "la page courante est marquée, quel que soit l'ordre des attributs");
      const nested = await get("/p/saison/noel"); assert.equal(nested.status, 200);
      assert.match(nested.text, /<h1[^>]*>Saison démo<\/h1>/);
      assert.match(nested.text, /aria-label="Fil d(?:&#x27;|')Ariane"/);
      assert.doesNotMatch(nested.text, /rel="canonical"/);
      for (const route of ["/p/inconnu", "/p/saison/inconnue", "/p/MAJUSCULE", "/p/demo%2fautre"]) assert.equal((await get(route)).status, 404, route);
      const historical = await get("/"); assert.equal(historical.status, 200); assert.match(historical.text, /Nos catégories/);
      await publish(dir, 2, [page("/", [blocks[3]], { title: "Accueil éditorial démo", seo_title: "Accueil SEO démo" }), page("/demo", blocks), page("/saison/noel", [blocks[3]])]);
      const home = await get("/"); assert.equal(home.status, 200);
      assert.match(home.text, /<h1[^>]*>Accueil éditorial démo<\/h1>/); assert.doesNotMatch(home.text, /Nos catégories/);
      assert.match(home.text, /<title>Accueil SEO démo<\/title>/, "accueil : le titre est exactement celui que l'éditeur a publié (le gabarit « | PRODES » du layout ne s'applique pas à sa propre page racine)");
      assert.match(home.text, /rel="canonical" href="https:\/\/demo.invalid\/"/);
      const bar = universe(home.text); assert.match(bar, /href="\/p\/demo"/); assert.match(bar, /href="\/p\/saison\/noel"/); assert.doesNotMatch(bar, /href="\/p\/"/);
      await publish(dir, 3, [page("/", [blocks[0]], { title: "Ne doit pas apparaître démo" }), page("/invalide", [{ type: "category_grid", data: { categories: ["demo-absente"] } }])]);
      assert.match((await get("/")).text, /Accueil éditorial démo/);
      assert.equal((await get("/p/demo")).status, 200); assert.equal((await get("/p/invalide")).status, 404);
      await publish(dir, 4, []);
      const withdrawn = await get("/"); assert.match(withdrawn.text, /Nos catégories/); assert.equal(universe(withdrawn.text), ""); assert.equal((await get("/p/demo")).status, 404);
    });
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("sans dossier éditorial : accueil historique, aucune barre, vrai 404", async () => {
  await withServer(undefined, async () => {
    const home = await get("/"); assert.equal(home.status, 200); assert.match(home.text, /Nos catégories/); assert.equal(universe(home.text), "");
    assert.equal((await get("/p/demo")).status, 404);
  });
});
test("catalogue indisponible : /p/ à plusieurs segments répond en HTML 503", async () => {
  await withServer(undefined, async () => {
    const response = await get("/p/saison/noel"); assert.equal(response.status, 503); assert.match(response.text, /data-testid="catalog-unavailable"/);
  }, { fixture: "F_DEMO_ABSENTE/snapshot.json" });
});
