// Recette locale : npm run test:content. Catalogue fictif gelé lu uniquement.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { price } from "../../components/site/format.ts";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(import.meta.dirname, "../..");
const PORT = Number(process.env.MERCHANDISING_PORT ?? 3126);
const BASE = `http://127.0.0.1:${PORT}`;
const FIXTURE = "F_FULL_CORRUPT/snapshot_s10_active.json";
const NOW = "2026-10-19T06:00:00Z";
const publicationId = "77777777-7777-4777-8777-777777777777";
const pageKey = "88888888-8888-4888-8888-888888888888";
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const binary = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const relation = (source, target, kind, order = 1) => ({ source, target, kind, order });
const ordered = rows => [...rows].sort((a, b) => binary(a.source, b.source) || binary(a.kind, b.kind) || a.order - b.order || binary(a.target, b.target));
const page = title => ({ key: pageKey, slug: "/repere", title, revision: 1, seo_title: "", seo_description: "", canonical: "", sections: [{ type: "hero", data: { title } }] });

async function publish(dir, generation, pages, merchandising) {
  const file = `${String(generation).padStart(12, "0")}-${publicationId}.json`;
  const document = { contract_version: "site_content.v1", generation, publication_id: publicationId, catalogue_sequence: null, pages, ...(merchandising === undefined ? {} : { merchandising }) };
  const bytes = Buffer.from(JSON.stringify(document, null, 2) + "\n");
  await writeFile(path.join(dir, file), bytes);
  await writeFile(path.join(dir, file.replace(/\.json$/, ".ready.json")), JSON.stringify({ contract_version: "site_content.v1", generation, publication_id: publicationId, file, sha256: createHash("sha256").update(bytes).digest("hex") }));
}

async function portAnswers() {
  try { await fetch(BASE + "/", { signal: AbortSignal.timeout(500) }); return true; } catch { return false; }
}

async function withServer(dir, fn) {
  assert.equal(await portAnswers(), false, `port ${PORT} occupé`);
  const child = spawn(process.execPath, [path.join(ROOT, "node_modules/next/dist/bin/next"), "start", "-H", "127.0.0.1", "-p", String(PORT)], {
    cwd: ROOT,
    env: { PATH: process.env.PATH, HOME: process.env.HOME, NEXT_TELEMETRY_DISABLED: "1", SITE_ENV: "staging", SITE_NOW_UTC: NOW, SITE_CATALOG_SOURCE: "fixture", SITE_CATALOG_FIXTURE: FIXTURE, SITE_CONTENT_DIR: dir, SITE_PUBLIC_ORIGIN: "https://exemple.invalid" },
    stdio: ["ignore", "ignore", "pipe"],
  });
  let exited = false;
  let stderr = "";
  let spawnError;
  child.stderr.on("data", chunk => { stderr = (stderr + chunk.toString()).slice(-4000); });
  child.once("error", error => { spawnError = error; });
  const closed = new Promise(resolve => child.once("exit", () => { exited = true; resolve(); }));
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
  return { status: response.status, html: (await response.text()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "") };
}
const section = (html, id) => new RegExp(`<section[^>]*aria-labelledby="${id}"[^>]*>([\\s\\S]*?)</section>`).exec(html)?.[1] ?? "";
const links = html => [...html.matchAll(/href="(\/famille\/[^"]+)"/g)].map(match => match[1]);
const route = family => `/famille/${family.slug}`;
const plain = html => html.replace(/<[^>]+>/g, "").replace(/&nbsp;|&#160;|&#xA0;/gi, "\u00a0");

// Oracle C0 sur le catalogue actif : aucun montant copié dans cette recette.
function expectedPrice(snapshot, family) {
  const { selectPrice } = require(path.join(ROOT, "c0/ts/dist/src/business.js"));
  const selections = family.items.flatMap(item => [...new Set(item.public_sell_price_windows.map(window => window.quantity_min))].map(quantity =>
    selectPrice({ snapshot, status: "ACTIVE" }, item.public_item_key, item.variant_axes, quantity, NOW),
  )).filter(result => result.accepted && result.selection).map(result => result.selection);
  assert.ok(selections.length > 0, "un prix actif est nécessaire pour vérifier chaque carte");
  const cents = amount => BigInt(amount.replace(".", ""));
  const best = selections.reduce((left, right) => cents(left.unit_amount) <= cents(right.unit_amount) ? left : right);
  return price(best.unit_amount, best.tax_basis_or_status);
}

function assertCards(html, id, title, families, snapshot) {
  const block = section(html, id);
  assert.ok(block.includes(title), title);
  assert.deepEqual(links(block), families.map(route), "ordre éditorial et vraies adresses");
  const cards = [...block.matchAll(/<a\b[^>]*href="(\/famille\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g)];
  assert.equal(cards.length, families.length);
  cards.forEach((match, index) => {
    assert.ok(match[2].includes(families[index].name));
    assert.match(match[2], /data-testid="family-price"/);
    assert.ok(plain(match[2]).includes(`À partir de ${expectedPrice(snapshot, families[index])}`), "prix choisi dans le catalogue actif, avec la mention À partir de");
  });
}

function assertNoMerchandising(html) {
  assert.doesNotMatch(html, /related-h|upsell-h|Produits complémentaires|Montée en gamme/);
}

test("relations : cartes, catalogue actif, retrait complet et refus atomique", async () => {
  const snapshot = JSON.parse(await readFile(path.join(ROOT, "c0/fixtures/documents", FIXTURE), "utf8"));
  assert.equal(snapshot.data_label, "STAGING_FIXTURE");
  const [source, complementary, linked, upsell] = snapshot.families;
  assert.ok(source && complementary && linked && upsell);
  const unknown = `PF-${String(9).padStart(9, "0")}`;
  assert.ok(!snapshot.families.some(f => f.public_family_key === unknown));
  const relations = ordered([
    relation(source.public_family_key, complementary.public_family_key, "COMPLEMENTAIRE"),
    relation(source.public_family_key, linked.public_family_key, "LIE"),
    relation(source.public_family_key, unknown, "LIE", 2),
    relation(source.public_family_key, upsell.public_family_key, "UPSELL"),
    relation(unknown, complementary.public_family_key, "UPSELL"),
  ]);
  const dir = await mkdtemp(path.join(tmpdir(), "site-merchandising-http-"));
  try {
    await publish(dir, 1, [page("Repère initial")], relations);
    await withServer(dir, async () => {
      const first = await get(route(source));
      assert.equal(first.status, 200);
      assertCards(first.html, "related-h", "Produits complémentaires", [linked, complementary], snapshot);
      assertCards(first.html, "upsell-h", "Montée en gamme", [upsell], snapshot);
      assert.equal(section(first.html, "similar-h"), "", "aucun similaire déjà affiché");
      assert.doesNotMatch(first.html, new RegExp(unknown));
      const other = await get(route(complementary));
      assert.equal(other.status, 200);
      assertNoMerchandising(other.html);

      await publish(dir, 2, [page("Repère retiré")]);
      const cleared = await get(route(source));
      assert.equal(cleared.status, 200);
      assertNoMerchandising(cleared.html);
      assert.deepEqual(links(section(cleared.html, "similar-h")), snapshot.families.slice(1).map(route));

      const restored = ordered([
        relation(source.public_family_key, upsell.public_family_key, "LIE"),
        relation(source.public_family_key, complementary.public_family_key, "LIE", 2),
        relation(source.public_family_key, linked.public_family_key, "UPSELL"),
      ]);
      await publish(dir, 3, [page("Repère courant")], restored);
      const current = await get(route(source));
      assert.equal(current.status, 200);
      assertCards(current.html, "related-h", "Produits complémentaires", [upsell, complementary], snapshot);
      assertCards(current.html, "upsell-h", "Montée en gamme", [linked], snapshot);

      await publish(dir, 4, [page("Repère refusé"), { ...page("Page refusée"), slug: "/refusee" }], [relation(source.public_family_key, complementary.public_family_key, "LIE", 2)]);
      const retained = await get(route(source));
      assert.equal(retained.status, 200);
      assertCards(retained.html, "related-h", "Produits complémentaires", [upsell, complementary], snapshot);
      assertCards(retained.html, "upsell-h", "Montée en gamme", [linked], snapshot);
      const editorial = await get("/p/repere");
      assert.equal(editorial.status, 200);
      assert.match(editorial.html, /Repère courant/);
      assert.doesNotMatch(editorial.html, /Repère refusé/);
      assert.equal((await get("/p/refusee")).status, 404, "les pages sont également refusées en bloc");

      await publish(dir, 5, [], [relation(source.public_family_key, unknown, "UPSELL")]);
      const ignored = await get(route(source));
      assert.equal(ignored.status, 200);
      assertNoMerchandising(ignored.html);
      assert.deepEqual(links(section(ignored.html, "similar-h")), snapshot.families.slice(1).map(route));
      assert.equal((await get("/p/repere")).status, 404, "la relation inconnue n'empêche pas le remplacement du jeu entier");
    });
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("premier document sans merchandising : aucune section de relations", async () => {
  const snapshot = JSON.parse(await readFile(path.join(ROOT, "c0/fixtures/documents", FIXTURE), "utf8"));
  const dir = await mkdtemp(path.join(tmpdir(), "site-merchandising-absent-"));
  try {
    await publish(dir, 1, []);
    await withServer(dir, async () => {
      const response = await get(route(snapshot.families[0]));
      assert.equal(response.status, 200);
      assertNoMerchandising(response.html);
      assert.deepEqual(links(section(response.html, "similar-h")), snapshot.families.slice(1).map(route));
    });
  } finally { await rm(dir, { recursive: true, force: true }); }
});
