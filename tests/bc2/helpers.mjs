// Outils communs des tests BC2 : base PostgreSQL réelle prodes_site_bc2_test, fixtures C0 vendues,
// receiver compilé (.bc2-build, `npm run bc2:build`). Aucune règle C0 réécrite : on appelle le C0 compilé.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { migrate } from "../../scripts/db/migrate.mjs";

const require = createRequire(import.meta.url);
export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const FIXTURES = join(ROOT, "c0", "fixtures");
export const KEYRING_PATH = join(FIXTURES, "keys", "test_keyring.json");
const BUILD = join(ROOT, ".bc2-build");

export const receiver = require(join(BUILD, "lib/site-publish/receiver.js"));
export const config = require(join(BUILD, "lib/site-publish/config.js"));
export const http = require(join(BUILD, "lib/site-publish/http.js"));
export const siteDb = require(join(BUILD, "lib/site-db/generation.js"));
export const sitePool = require(join(BUILD, "lib/site-db/pool.js"));
export const jsonc = require(join(BUILD, "c0/ts/src/jsonc.js"));
export const signing = require(join(BUILD, "c0/ts/src/signing.js"));
export const activation = require(join(BUILD, "c0/ts/src/activation.js"));
export const snapshot = require(join(BUILD, "c0/ts/src/snapshot.js"));

export const VERDICTS = JSON.parse(readFileSync(join(FIXTURES, "VERDICTS.json"), "utf8")).cases;
export const KEYRING = jsonc.parseBytes(readFileSync(KEYRING_PATH), 1 << 20);

export function testDatabaseUrl() {
  const url = process.env.SITE_TEST_DATABASE_URL;
  if (!url) throw new Error("SITE_TEST_DATABASE_URL absente (npm run test:bc2 la fixe)");
  const name = new URL(url).pathname.slice(1);
  if (!/^prodes_site_[a-z0-9_]*_test$/.test(name)) throw new Error(`base de test refusée : ${name} (doit finir par _test)`);
  return url;
}

/** Remet la base de test à zéro (schéma public recréé) puis applique les migrations 001–009. */
export async function resetDb() {
  const url = testDatabaseUrl();
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("DROP SCHEMA public CASCADE");
    await client.query("CREATE SCHEMA public");
  } finally {
    await client.end();
  }
  await migrate(url, () => undefined);
}

export function newPool(max = 10) {
  return sitePool.createPool(testDatabaseUrl(), max);
}

/** Configuration receiver de test (trousseau de fixtures, clé ACK c0-test-ack-01). */
export function makeConfig({ env = "staging", policy = { max_withdrawals_without_release: null, released_expected_withdrawals_digest: null } } = {}) {
  return config.loadReceiverConfig({
    SITE_ENV: env,
    SITE_KEYRING_PATH: KEYRING_PATH,
    SITE_ACK_KEY_ID: "c0-test-ack-01",
    SITE_WITHDRAWAL_HOLD_POLICY: JSON.stringify(policy),
  });
}

/** Charge un cas C0 `evaluate_publication` et résout ses références. */
export function loadCase(caseId) {
  const [scenario, name] = caseId.split(".");
  const c = JSON.parse(readFileSync(join(FIXTURES, "cases", scenario, `${name}.json`), "utf8"));
  if (c.case_id !== caseId || c.function !== "evaluate_publication") throw new Error(`cas inattendu ${caseId}`);
  const i = c.input;
  const bytes = new Uint8Array(readFileSync(join(FIXTURES, i.snapshot.$bytes)));
  return {
    caseId,
    verdict: VERDICTS[caseId],
    bytes,
    doc: (() => { try { return jsonc.parseBytes(bytes, 64 << 20); } catch { return null; } })(),
    transport: i.transport,
    policy: i.policy,
    now: i.now_utc,
    media: i.media_store.map((m) => ({ sha256: m.sha256, bytes: new Uint8Array(readFileSync(join(FIXTURES, m.file.$media))) })),
    activeSnapshotPath: i.active ? i.active.snapshot.$doc : null,
    activeAckPath: i.active ? i.active.ack.$doc : null,
  };
}

export function fixtureBytes(rel) {
  return new Uint8Array(readFileSync(join(FIXTURES, rel)));
}

export function deps(pool, { now, policy, env, hooks } = {}) {
  return { pool, config: makeConfig({ env, policy }), now: now === undefined ? undefined : () => now, hooks };
}

export function headersFor(transport) {
  const h = new Headers();
  if (transport && typeof transport.key_id === "string") h.set("x-c0-key-id", transport.key_id);
  if (transport && typeof transport.signature === "string") h.set("x-c0-signature", transport.signature);
  return h;
}

export function control(doc) {
  return jsonc.utf8(JSON.stringify({ publication_id: doc.publication_id, catalogue_sequence: doc.catalogue_sequence, payload_sha256: doc.payload_sha256 }));
}

/** Signature STAGING_TRANSPORT d'un PUT média (domaine prodes.c0.transport.media.v1, clé de publication). */
export function mediaHeaders(sha256, size, keyId = "c0-test-publish-02") {
  const signature = signing.sign(KEYRING, keyId, signing.SCOPE_PUBLISH, receiver.MEDIA_TRANSPORT_DOMAIN, { sha256, size });
  return headersFor({ key_id: keyId, signature });
}

export function body(res) {
  return JSON.parse(Buffer.from(res.body).toString("utf8"));
}

export const STAGE = (d, c) => receiver.stage(d, c.bytes, headersFor(c.transport));
export const VERIFY = (d, c, transport = c.transport) => receiver.verifyMedia(d, control(c.doc), headersFor(transport));
export const ACTIVATE = (d, c, transport = c.transport) => receiver.activate(d, control(c.doc), headersFor(transport));

export async function putAllMedia(d, c) {
  const out = [];
  for (const m of c.media) out.push(await receiver.putMedia(d, m.sha256, m.bytes, mediaHeaders(m.sha256, m.bytes.length), "image/png"));
  return out;
}

/** STAGE -> MEDIA -> VERIFY -> ACTIVATE d'un cas, à l'instant de la fixture. Renvoie chaque réponse. */
export async function fullFlow(pool, c, opts = {}) {
  const d = deps(pool, { now: c.now, policy: c.policy, ...opts });
  const staged = await STAGE(d, c);
  const media = await putAllMedia(d, c);
  const verified = await VERIFY(d, c);
  const activated = await ACTIVATE(d, c);
  return { d, staged, media, verified, activated };
}

/** Résultat receiver comparé au verdict C0 déclaré : {accepted?, outcome, error_codes}. */
export function outcomeOf(res) {
  const outcome = res.headers["x-c0-outcome"];
  if (outcome !== undefined) return { accepted: true, outcome, error_codes: [] };
  const b = body(res);
  return { accepted: b.accepted, outcome: b.outcome, error_codes: b.error_codes };
}

export async function scalar(pool, sql, params = []) {
  const { rows } = await pool.query(sql, params);
  return rows[0] ? Object.values(rows[0])[0] : undefined;
}

export async function pointer(pool) {
  const { rows } = await pool.query("SELECT generation_id, catalogue_sequence, payload_sha256 FROM site_active_pointer WHERE singleton = 1");
  return rows[0];
}

export async function statuses(pool) {
  const { rows } = await pool.query("SELECT catalogue_sequence::int AS seq, payload_sha256 AS sha, status FROM site_generation ORDER BY id");
  return rows;
}

/** Active la base F_FULL_CORRUPT s10 (cas activate_base, instant de la fixture). */
export async function activateBase(pool) {
  const base = loadCase("F_FULL_CORRUPT.activate_base");
  const flow = await fullFlow(pool, base);
  if (flow.activated.headers["x-c0-outcome"] !== "ACTIVATED") throw new Error(`activation de la base échouée : ${Buffer.from(flow.activated.body)}`);
  return { base, ...flow };
}
