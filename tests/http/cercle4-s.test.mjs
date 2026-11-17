// Cercle 4, lot S (SITE) — attendus S01 à S09 et S12 par de VRAIES requêtes HTTP sur `next start` (le proxy, l'adaptateur de Next et la base sont dans le chemin).
// Exécution : SITE_TEST_DATABASE_URL=postgres://…/prodes_site_xxx_test npm run bc2:build && npx next build && node --test --test-concurrency=1 tests/http/cercle4-s.test.mjs
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ACTIVATE, ROOT, STAGE, VERIFY, deps, headersFor, jsonc, mediaHeaders, newPool, resetDb, receiver, testDatabaseUrl } from "../bc2/helpers.mjs";

const V2 = join(ROOT, "c0v2", "fixtures");
const read = (rel) => new Uint8Array(readFileSync(join(V2, rel)));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const PORT = Number(process.env.C4S_PORT ?? 3141);
const PORT_DOWN = PORT + 1;
const BASE = `http://127.0.0.1:${PORT}`;
const FAILURE_LIMIT = 20;
const HOLD = '{"max_withdrawals_without_release":null,"released_expected_withdrawals_digest":null}';

const catalogueCase = JSON.parse(readFileSync(join(V2, "cases", "V2_CATALOGUE", "v2_accepted.json"), "utf8")).input;
const contentCase = JSON.parse(readFileSync(join(V2, "cases", "V2_CONTENT", "content_accepted.json"), "utf8")).input;

let pool;
const children = [];
const stderrs = new Map();

async function start(port, env) {
  let stderr = "";
  const child = spawn(process.execPath, [join(ROOT, "node_modules/next/dist/bin/next"), "start", "-H", "127.0.0.1", "-p", String(port)], {
    cwd: ROOT,
    env: { PATH: process.env.PATH, HOME: process.env.HOME, NEXT_TELEMETRY_DISABLED: "1", SITE_ENV: "staging", SITE_CATALOG_SOURCE: "db",
           SITE_KEYRING_PATH: join(ROOT, "c0", "fixtures", "keys", "test_keyring.json"), SITE_ACK_KEY_ID: "c0-test-ack-01",
           SITE_PUBLIC_ORIGIN: `http://127.0.0.1:${port}`, SITE_WITHDRAWAL_HOLD_POLICY: HOLD, ...env },
    stdio: ["ignore", "ignore", "pipe"],
  });
  child.stderr.on("data", (chunk) => { stderr = (stderr + chunk.toString()).slice(-4000); });
  children.push(child);
  stderrs.set(port, () => stderr);
  const deadline = Date.now() + 40000;
  for (;;) {
    try { await fetch(`http://127.0.0.1:${port}/robots.txt`, { signal: AbortSignal.timeout(500) }); return child; } catch { /* pas encore */ }
    if (Date.now() > deadline) throw new Error(`serveur non démarré : ${stderr}`);
    await sleep(200);
  }
}

async function activateCatalogue() {
  const c = catalogueCase;
  const bytes = read(c.snapshot.$bytes);
  const k = { bytes, doc: jsonc.parseBytes(bytes, 64 << 20), transport: c.transport };
  const d = deps(pool, { now: c.now_utc, policy: c.policy });
  await STAGE(d, k);
  for (const m of c.media_store) await receiver.putMedia(d, m.sha256, read(m.file.$media), mediaHeaders(m.sha256, read(m.file.$media).length), "image/png");
  await VERIFY(d, k);
  assert.equal((await ACTIVATE(d, k)).headers["x-c0-outcome"], "ACTIVATED");
}

/** Lectures d'une table vues par PostgreSQL (balayages d'index et séquentiels) : la mesure ne dépend pas du code du SITE. Les statistiques d'un processus inactif arrivent avec retard : on attend qu'elles se stabilisent. */
async function scans(table) {
  let last = -1;
  for (let i = 0; i < 12; i += 1) {
    await sleep(1300);
    const { rows } = await pool.query("SELECT coalesce(idx_scan,0) + coalesce(seq_scan,0) AS n FROM pg_stat_user_tables WHERE relname = $1", [table]);
    const n = Number(rows[0].n);
    if (n === last) return n;
    last = n;
  }
  return last;
}
const contentScans = () => scans("site_content_active");

const count = (table) => pool.query(`SELECT count(*)::int AS n FROM ${table}`).then((r) => r.rows[0].n);
const forged = (n, behind) => ({ "x-forwarded-for": `203.0.113.${n % 250}, ${behind}` });

before(async () => {
  await resetDb();
  pool = newPool();
  await activateCatalogue();
  const url = testDatabaseUrl();
  await start(PORT, { SITE_DATABASE_URL: url, SITE_BUSINESS_PERSISTENCE: "closed", SITE_TRUSTED_PROXY_HOPS: "1", SITE_MACHINE_FAILURE_LIMIT: String(FAILURE_LIMIT) });
  // Base arrêtée : même nom de base, port où personne n'écoute.
  const down = new URL(url);
  down.port = "1";
  await start(PORT_DOWN, { SITE_DATABASE_URL: down.toString() });
});
after(async () => {
  for (const child of children) if (child.exitCode === null) { child.kill("SIGTERM"); await new Promise((resolve) => child.once("exit", resolve)); }
  if (pool) await pool.end();
});

// ---------------------------------------------------------------- 4.9 santé
test("S01 — GET /api/site/health en service : 200 et {\"status\":\"ok\"}, rien d'autre", async () => {
  const res = await fetch(`${BASE}/api/site/health`);
  assert.equal(res.status, 200);
  assert.equal(await res.text(), '{"status":"ok"}');
});

test("S02 — même requête, base arrêtée : 503, sans détail technique", async () => {
  const res = await fetch(`http://127.0.0.1:${PORT_DOWN}/api/site/health`);
  assert.equal(res.status, 503);
  const text = await res.text();
  assert.deepEqual(JSON.parse(text), { status: "unavailable" });
  assert.ok(!/ECONNREFUSED|postgres|127\.0\.0\.1|stack/i.test(text));
});

test("S11 (côté site) — base absente : pages 503 propres, sans trace technique", async () => {
  for (const path of ["/", "/categorie/bancs", "/recherche"]) {
    const res = await fetch(`http://127.0.0.1:${PORT_DOWN}${path}`);
    const html = await res.text();
    assert.equal(res.status, 503, path);
    assert.ok(!/ECONNREFUSED|ENOTFOUND|postgres|SITE_DATABASE_URL|at \w+ \(|node_modules|stack/i.test(html), `${path} : trace technique visible`);
    assert.match(html, /indisponible/i, path);
  }
});

// ---------------------------------------------------------------- 4.10 routes de la Factory
test("S04 — requêtes non signées sur une route de publication : 401 d'abord, puis 429, aucune ligne de journal", async () => {
  const before = await count("site_publication_log");
  const statuses = [];
  for (let i = 0; i < 100; i += 1) statuses.push((await fetch(`${BASE}/api/site/publish/stage`, { method: "POST", body: "{}", headers: forged(i, "198.51.100.7") })).status);
  assert.equal(statuses.filter((s) => s === 401).length, FAILURE_LIMIT, "exactement le seuil de refus passe en 401");
  assert.deepEqual(statuses.slice(0, FAILURE_LIMIT), Array(FAILURE_LIMIT).fill(401), "les premières reçoivent 401");
  assert.deepEqual(statuses.slice(FAILURE_LIMIT), Array(100 - FAILURE_LIMIT).fill(429), "les suivantes reçoivent 429");
  const limited = await fetch(`${BASE}/api/site/publish/stage`, { method: "POST", body: "{}", headers: forged(1, "198.51.100.7") });
  assert.ok(Number(limited.headers.get("retry-after")) >= 1, "Retry-After");
  // Une signature de bonne forme mais fausse laisserait une ligne de journal : au-delà du seuil, plus aucune.
  await fetch(`${BASE}/api/site/publish/activate`, { method: "POST", body: "{}", headers: { ...forged(2, "198.51.100.7"), "x-c0-key-id": "c0-test-publish-02", "x-c0-signature": "a".repeat(64) } });
  assert.equal(await count("site_publication_log"), before, "aucune ligne de journal de publication au-delà du seuil");
});

test("S05 — l'adresse retenue est celle posée par le frontal : un X-Forwarded-For forgé par le visiteur est ignoré", async () => {
  // Autre adresse (posée en dernier par le frontal) : son compteur est neuf, malgré les valeurs forgées devant.
  const fresh = await fetch(`${BASE}/api/site/publish/stage`, { method: "POST", body: "{}", headers: forged(7, "198.51.100.8") });
  assert.equal(fresh.status, 401);
  // Le visiteur bloqué ne se débloque pas en changeant la première valeur.
  const still = await fetch(`${BASE}/api/site/publish/stage`, { method: "POST", body: "{}", headers: forged(99, "198.51.100.7") });
  assert.equal(still.status, 429);
});

test("S05 — la recherche prend la même adresse : 429 au-delà de la limite, quelles que soient les valeurs forgées", async () => {
  const statuses = [];
  for (let i = 0; i < 130; i += 1) statuses.push((await fetch(`${BASE}/api/site/search?q=ab`, { headers: forged(i, "198.51.100.20") })).status);
  assert.ok(statuses.includes(429), "la limite de recherche s'applique malgré un en-tête forgé qui change à chaque requête");
});

// ---------------------------------------------------------------- 4.11 images
test("S06 — une image par son adresse à empreinte : flux, ETag, Cache-Control immuable, 304 sur If-None-Match", async () => {
  let checked = 0;
  for (const m of catalogueCase.media_store) {
    const res = await fetch(`${BASE}/media/${m.sha256}`);
    if (res.status !== 200 || res.headers.get("cache-control") !== "public, max-age=31536000, immutable") continue;
    checked += 1;
    assert.equal(res.headers.get("etag"), `"${m.sha256}"`);
    const bytes = Buffer.from(await res.arrayBuffer());
    assert.equal(createHash("sha256").update(bytes).digest("hex"), m.sha256, "l'adresse est l'empreinte des octets : changer l'image change l'adresse (S07)");
    const again = await fetch(`${BASE}/media/${m.sha256}`, { headers: { "if-none-match": `"${m.sha256}"` } });
    assert.equal(again.status, 304);
    assert.equal((await again.arrayBuffer()).byteLength, 0);
    assert.equal(again.headers.get("cache-control"), "public, max-age=31536000, immutable");
  }
  assert.ok(checked >= 1, "au moins une image servie telle quelle, immuable");
});

test("S06 — la deuxième demande d'une image ne lit plus les octets en base (cache mémoire borné)", async () => {
  const m = catalogueCase.media_store[0];
  const mediaScans = () => scans("site_media");
  await fetch(`${BASE}/media/${m.sha256}`);
  const warm = await mediaScans();
  for (let i = 0; i < 5; i += 1) assert.equal((await fetch(`${BASE}/media/${m.sha256}`)).status, 200);
  assert.equal((await mediaScans()) - warm, 0, "aucune lecture de la table des médias pour les demandes suivantes");
});

// ---------------------------------------------------------------- 4.12 mémoire des contenus
test("S08 + S09 — dix pages sans changement : aucune lecture des contenus en base ; une activation par la route signée est vue à la requête suivante", async () => {
  assert.equal((await fetch(`${BASE}/ancienne-adresse-s09`, { redirect: "manual" })).status, 404, "aucun contenu actif : 404");
  const warm = await contentScans();
  for (let i = 0; i < 10; i += 1) await fetch(`${BASE}/livraison`);
  const after10 = await contentScans();
  assert.equal(after10 - warm, 0, `dix requêtes de page : ${after10 - warm} lecture(s) des contenus en base (attendu 0)`);

  const c = contentCase;
  const res = await fetch(`${BASE}/api/site/content/activate`, { method: "POST", body: read(c.content.$bytes), headers: headersFor(c.transport) });
  assert.equal(res.headers.get("x-c0-outcome"), "ACTIVATED", await res.clone().text());
  const redirected = await fetch(`${BASE}/12-bancs`, { redirect: "manual" });
  assert.ok([301, 308].includes(redirected.status), `requête suivante : HTTP ${redirected.status} (attendu 301/308)`);
  assert.equal(redirected.headers.get("location"), "/categorie/bancs");
});

// ---------------------------------------------------------------- 4.15 devis et commandes éteints
test("S12 — devis envoyé alors que l'enregistrement est éteint : message « pas encore ouverte », aucune ligne", async () => {
  const quoteBefore = await count("site_quote_request");
  const orderBefore = await count("site_order");
  const res = await fetch(`${BASE}/api/site/quote`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "quote_request" }) });
  const j = await res.json();
  assert.equal(res.status, 503);
  assert.equal(j.site_status, "ONLINE_REQUEST_CLOSED");
  assert.match(j.message, /la demande en ligne n'est pas encore ouverte/i);
  const order = await fetch(`${BASE}/api/site/order`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "order" }) });
  assert.equal(order.status, 503);
  assert.equal(await count("site_quote_request"), quoteBefore);
  assert.equal(await count("site_order"), orderBefore);
  for (const table of ["site_quote_line", "site_order_line", "site_idempotency", "site_outbox_event"]) assert.equal(await count(table), 0, table);
  for (const page of ["/devis", "/commande"]) {
    const html = await (await fetch(`${BASE}${page}`)).text();
    assert.match(html, /la demande en ligne n(&#x27;|&apos;|')est pas encore ouverte/i, page);
  }
});
