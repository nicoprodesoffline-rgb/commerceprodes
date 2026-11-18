// Cercle 3, 3.17 — les anciennes adresses, par une VRAIE requête HTTP sur un serveur `next start` (le proxy et l'adaptateur de Next sont dans le chemin ; un test sur le texte de proxy.ts passait avec le HTTP 500).
// Exécution : SITE_TEST_DATABASE_URL=… npm run bc2:build && npx next build && node --test --test-concurrency=1 tests/http/old-addresses.test.mjs
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ACTIVATE, ROOT, STAGE, VERIFY, deps, headersFor, jsonc, mediaHeaders, newPool, resetDb, receiver, testDatabaseUrl } from "../bc2/helpers.mjs";

const V2 = join(ROOT, "c0v2", "fixtures");
const requireBuild = createRequire(import.meta.url);
const content = requireBuild(join(ROOT, ".bc2-build", "lib/site-publish/content.js"));
const PORT = Number(process.env.OLD_ADDRESSES_PORT ?? 3126);
const BASE = `http://127.0.0.1:${PORT}`;
const read = (rel) => new Uint8Array(readFileSync(join(V2, rel)));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function activateCatalogue(pool) {
  const c = JSON.parse(readFileSync(join(V2, "cases", "V2_CATALOGUE", "v2_accepted.json"), "utf8")).input;
  const bytes = read(c.snapshot.$bytes);
  const k = { bytes, doc: jsonc.parseBytes(bytes, 64 << 20), transport: c.transport };
  const d = deps(pool, { now: c.now_utc, policy: c.policy });
  await STAGE(d, k);
  for (const m of c.media_store) await receiver.putMedia(d, m.sha256, read(m.file.$media), mediaHeaders(m.sha256, read(m.file.$media).length), "image/png");
  await VERIFY(d, k);
  assert.equal((await ACTIVATE(d, k)).headers["x-c0-outcome"], "ACTIVATED");
}

let pool, child, stderr = "";
before(async () => {
  await resetDb();
  pool = newPool();
  await activateCatalogue(pool);
  const c = JSON.parse(readFileSync(join(V2, "cases", "V2_CONTENT", "content_accepted.json"), "utf8")).input;
  const res = await content.activateContent(deps(pool, { now: c.now_utc }), read(c.content.$bytes), headersFor(c.transport));
  assert.equal(res.headers["x-c0-outcome"], "ACTIVATED", "les contenus du jeu d'essai (trois anciennes adresses) sont actifs");
  child = spawn(process.execPath, [join(ROOT, "node_modules/next/dist/bin/next"), "start", "-H", "127.0.0.1", "-p", String(PORT)], {
    cwd: ROOT,
    env: { PATH: process.env.PATH, HOME: process.env.HOME, NEXT_TELEMETRY_DISABLED: "1", SITE_ENV: "staging", SITE_DATABASE_URL: testDatabaseUrl(), SITE_CATALOG_SOURCE: "db", SITE_BUSINESS_PERSISTENCE: "postgresql",
           SITE_KEYRING_PATH: join(ROOT, "c0", "fixtures", "keys", "test_keyring.json"), SITE_ACK_KEY_ID: "c0-test-ack-01", SITE_PUBLIC_ORIGIN: BASE,
           SITE_WITHDRAWAL_HOLD_POLICY: '{"max_withdrawals_without_release":null,"released_expected_withdrawals_digest":null}' },
    stdio: ["ignore", "ignore", "pipe"],
  });
  child.stderr.on("data", (chunk) => { stderr = (stderr + chunk.toString()).slice(-4000); });
  const deadline = Date.now() + 40000;
  for (;;) {
    try { await fetch(BASE + "/robots.txt", { signal: AbortSignal.timeout(500) }); break; } catch { /* pas encore */ }
    if (Date.now() > deadline) throw new Error(`serveur non démarré : ${stderr}`);
    await sleep(200);
  }
});
after(async () => {
  if (child && child.exitCode === null) { child.kill("SIGTERM"); await new Promise((resolve) => child.once("exit", resolve)); }
  if (pool) await pool.end();
});

const manual = (path) => fetch(BASE + path, { redirect: "manual" });

test("une ancienne adresse validée répond 301 ou 308 vers sa nouvelle adresse, Location relative (jamais l'hôte interne)", async () => {
  const res = await manual("/12-bancs");
  assert.ok([301, 308].includes(res.status), `HTTP ${res.status} (attendu 301 ou 308) ; journal : ${stderr.split("\n").slice(-4).join(" | ")}`);
  assert.equal(res.headers.get("location"), "/categorie/bancs");
});

test("une ancienne adresse qui mène à la recherche garde sa requête", async () => {
  const res = await manual("/tag/acier");
  assert.ok([301, 308].includes(res.status), `HTTP ${res.status}`);
  assert.equal(res.headers.get("location"), "/recherche?q=acier");
});

test("une adresse inconnue répond 404, sans Location", async () => {
  const res = await manual("/une-adresse-que-personne-n-a-validee");
  assert.equal(res.status, 404);
  assert.equal(res.headers.get("location"), null);
});

test("//evil n'est jamais une redirection vers un autre hôte (Next ramène « // » à « / » : même hôte, chemin local)", async () => {
  const res = await manual("//evil.example.invalid/x");
  const location = res.headers.get("location");
  assert.ok(location === null || (location.startsWith("/") && !location.startsWith("//") && !/^[a-z][a-z0-9+.-]*:/i.test(location)), `HTTP ${res.status} → ${location}`);
  assert.ok(location === null || !location.includes("://"), "aucune adresse absolue vers un autre hôte");
});
