// Cercle 9 — mémoire du site à la réception d'un catalogue (53e série : « faire baisser la mémoire du site par du code »).
// Les trois baisses ne changent aucun verdict ni aucune donnée rangée. Ce fichier le vérifie sur les jeux d'essai du contrat :
//   1. le contrat rend le même résultat avec l'ACTIVE complète et avec l'ACTIVE réduite à ce qu'il lit (activeForContract) ;
//   2. le corps lu à la taille annoncée rend les mêmes octets, et refuse ce qui dépasse, comme la lecture par morceaux ;
//   3. la vue jsonb tirée par la base des octets rangés est la même que celle écrite avant, par JSON.stringify de l'arbre lu.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { ROOT, STAGE, deps, http, jsonc, makeConfig, newPool, receiver, resetDb } from "./helpers.mjs";

const require = createRequire(import.meta.url);
const contract = require(join(ROOT, ".bc2-build", "c0v2", "ts", "src", "activation.js"));
const SETS = [join(ROOT, "c0", "fixtures"), join(ROOT, "c0v2", "fixtures")];

/** Tous les cas `evaluate_publication` des deux jeux d'essai du contrat (v1 et v2), fichiers résolus. */
function publicationCases() {
  const out = [];
  for (const fixtures of SETS) {
    for (const scenario of readdirSync(join(fixtures, "cases"))) {
      for (const file of readdirSync(join(fixtures, "cases", scenario)).filter((f) => f.endsWith(".json"))) {
        const c = JSON.parse(readFileSync(join(fixtures, "cases", scenario, file), "utf8"));
        if (c.function !== "evaluate_publication") continue;
        const i = c.input;
        const read = (rel) => new Uint8Array(readFileSync(join(fixtures, rel)));
        out.push({
          caseId: c.case_id,
          v2: fixtures.endsWith("c0v2/fixtures"),
          bytes: read(i.snapshot.$bytes),
          transport: i.transport,
          policy: i.policy,
          now: i.now_utc,
          store: new Map(i.media_store.map((m) => [m.sha256, read(m.file.$media)])),
          active: i.active ? { snapshot: jsonc.parseBytes(read(i.active.snapshot.$doc), 64 << 20), ack: jsonc.parseBytes(read(i.active.ack.$doc), 1 << 20) } : null,
        });
      }
    }
  }
  return out;
}

const CASES = publicationCases();

test("1. même résultat du contrat avec l'ACTIVE complète et avec l'ACTIVE réduite, sur chaque cas qui en porte une (v1 et v2)", () => {
  const { keyring, ackKeyId } = makeConfig();
  const withActive = CASES.filter((c) => c.active !== null);
  assert.ok(withActive.length > 0 && withActive.some((c) => c.v2), "des cas v1 et v2 portent une ACTIVE");
  const outcomes = new Set();
  for (const c of withActive) {
    const run = (active) => contract.evaluatePublication(c.bytes, c.transport, active, c.store, c.policy, c.now, keyring, ackKeyId);
    const full = run(c.active);
    const reduced = run({ snapshot: receiver.activeForContract(c.active.snapshot), ack: c.active.ack });
    assert.deepEqual(reduced, full, c.caseId);
    outcomes.add(`${full.outcome} ${full.error_codes.join(",")}`);
  }
  // Les cas couvrent la séquence, le rejeu, l'identité, la retenue des retraits et la sûreté : plusieurs verdicts distincts.
  for (const expected of ["REPLAY_ACK", "STALE_SEQUENCE", "IDENTITY_CONFLICT", "STAGE_HOLD", "CATALOG_UNSAFE"]) {
    assert.ok([...outcomes].some((o) => o.includes(expected)), `un cas au moins rend ${expected} (vus : ${[...outcomes].join(" | ")})`);
  }
});

/** Une requête dont le corps arrive en `chunks`, avec ou sans Content-Length. */
function request(chunks, declared) {
  const body = new ReadableStream({ start(controller) { for (const chunk of chunks) controller.enqueue(chunk); controller.close(); } });
  const headers = declared === undefined ? {} : { "content-length": String(declared) };
  return new Request("http://site.test/api/site/publish/stage", { method: "POST", body, headers, duplex: "half" });
}

test("2. le corps lu à la taille annoncée : mêmes octets que la lecture par morceaux, refus de ce qui dépasse", async () => {
  const bytes = new Uint8Array(1000).map((_, i) => (i * 7) % 256);
  const chunks = [bytes.subarray(0, 300), bytes.subarray(300, 301), bytes.subarray(301)];
  const read = (r, max = 4096) => http.readBoundedBody(r, max);
  assert.deepEqual(await read(request(chunks, 1000)), bytes, "taille annoncée exacte");
  assert.deepEqual(await read(request(chunks)), bytes, "sans taille annoncée (lecture par morceaux)");
  assert.deepEqual(await read(request(chunks, 1200)), bytes, "flux plus court que l'annonce : les octets reçus, comme avant");
  await assert.rejects(read(request(chunks, 999)), http.BodyTooLarge, "flux plus long que l'annonce");
  await assert.rejects(read(request(chunks, 1000), 999), http.BodyTooLarge, "annonce au-delà du plafond");
  await assert.rejects(read(request(chunks), 999), http.BodyTooLarge, "flux au-delà du plafond, sans annonce");
  assert.deepEqual(await read(request([], 0)), new Uint8Array(0), "corps vide annoncé");
});

let pool;
before(async () => { await resetDb(); pool = newPool(); });
after(async () => { await pool.end(); });

test("3. la vue jsonb tirée par la base des octets rangés est celle d'avant (JSON.stringify de l'arbre lu), v1 et v2", async () => {
  for (const c of CASES.filter((x) => x.active === null)) await STAGE(deps(pool, { now: c.now, policy: c.policy }), c);
  const { rows } = await pool.query("SELECT id, snapshot_bytes, snapshot_json::text AS stored FROM site_generation ORDER BY id");
  assert.ok(rows.length > 0, "des cas sans ACTIVE sont rangés");
  const versions = new Set();
  for (const row of rows) {
    const tree = jsonc.parseBytes(new Uint8Array(row.snapshot_bytes), 128 << 20);
    versions.add(tree.contract_version);
    const { rows: [cmp] } = await pool.query("SELECT $1::jsonb = $2::jsonb AS same", [row.stored, JSON.stringify(tree)]);
    assert.equal(cmp.same, true, `génération ${row.id} (${tree.contract_version})`);
  }
  assert.deepEqual([...versions].sort(), ["site_snapshot.v1", "site_snapshot.v2"]);
});
