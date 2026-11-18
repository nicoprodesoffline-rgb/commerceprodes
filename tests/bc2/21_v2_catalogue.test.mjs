// Cercle 3, 3.1 (V01, V03, V04) — le récepteur du SITE lit site_snapshot.v1 ET site_snapshot.v2 : STAGE -> MEDIA -> VERIFY -> ACTIVATE sur les jeux d'essai du contrat v2.
// Le SITE ne tient que ce qu'il sert (dérivés, images sans dérivé, documents) : les originaux ne sont jamais exigés. Un catalogue v2 signé sous le domaine v1 est refusé.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { ACTIVATE, ROOT, snapshot as c0snapshot, STAGE, VERIFY, body, deps, headersFor, jsonc, mediaHeaders, newPool, resetDb, receiver, siteDb, statuses } from "./helpers.mjs";

const V2 = join(ROOT, "c0v2", "fixtures");
const VERDICTS = JSON.parse(readFileSync(join(V2, "VERDICTS.json"), "utf8")).cases;

function loadV2(caseId) {
  const [scenario, name] = caseId.split(".");
  const c = JSON.parse(readFileSync(join(V2, "cases", scenario, `${name}.json`), "utf8"));
  const i = c.input;
  const bytes = new Uint8Array(readFileSync(join(V2, i.snapshot.$bytes)));
  return {
    caseId, verdict: VERDICTS[caseId], bytes, doc: jsonc.parseBytes(bytes, 64 << 20), transport: i.transport, policy: i.policy, now: i.now_utc,
    media: i.media_store.map((m) => ({ sha256: m.sha256, bytes: new Uint8Array(readFileSync(join(V2, m.file.$media))) })),
  };
}

let pool;
before(async () => { await resetDb(); pool = newPool(); });
after(async () => { await pool.end(); });

async function putMedia(d, c) {
  const out = [];
  for (const m of c.media) {
    const mime = m.bytes[0] === 0x25 ? "application/pdf" : m.bytes[0] === 0x89 ? "image/png" : "image/webp";
    out.push(await receiver.putMedia(d, m.sha256, m.bytes, mediaHeaders(m.sha256, m.bytes.length), mime));
  }
  return out;
}

test("V01 : un catalogue v2 est activé ; le SITE garde les dérivés et le document, jamais les originaux ; l'accusé est celui de la v1", async () => {
  const c = loadV2("V2_CATALOGUE.v2_accepted");
  assert.equal(c.verdict.outcome, "ACTIVATED");
  const d = deps(pool, { now: c.now, policy: c.policy });
  assert.equal(body(await STAGE(d, c)).outcome, "STAGED");
  assert.ok((await putMedia(d, c)).every((r) => r.status === 201));
  const verified = await VERIFY(d, c);
  assert.equal(body(verified).generation.status, "VERIFIED");
  const activated = await ACTIVATE(d, c);
  assert.equal(activated.status, 200);
  assert.equal(activated.headers["x-c0-outcome"], "ACTIVATED");
  const ack = jsonc.parseBytes(activated.body, 1 << 20);
  assert.equal(ack.contract_version, "site_activation.v1");
  const active = await siteDb.getActiveGeneration(pool);
  assert.equal(active.status, "ACTIVE", "la génération v2 relue en base passe le contrôle d'intégrité (empreinte v2)");
  assert.equal(active.snapshot.contract_version, "site_snapshot.v2");
  // Rejeu du même document : l'accusé stocké, pas de seconde activation.
  const again = await ACTIVATE(d, c);
  assert.equal(again.headers["x-c0-outcome"], "REPLAY_ACK");
  assert.equal(Buffer.compare(Buffer.from(again.body), Buffer.from(activated.body)), 0);
});

test("V03 : un document v1 est encore activé par ce SITE (récepteur v1 gelé)", async () => {
  await resetDb();
  const c = loadV2("V2_COEXISTENCE.v1_read_by_a_v2_site");
  const d = deps(pool, { now: c.now, policy: c.policy });
  await STAGE(d, c);
  await putMedia(d, c);
  await VERIFY(d, c);
  const activated = await ACTIVATE(d, c);
  assert.equal(activated.headers["x-c0-outcome"], "ACTIVATED");
  assert.equal((await siteDb.getActiveGeneration(pool)).snapshot.contract_version, "site_snapshot.v1");
});

test("un catalogue v2 signé sous le domaine v1 est refusé à l'activation : signature invalide, rien d'actif", async () => {
  await resetDb();
  const c = loadV2("V2_CATALOGUE.v2_signed_under_the_v1_domain");
  assert.deepEqual(c.verdict.error_codes, ["SIGNATURE_INVALID"]);
  const d = deps(pool, { now: c.now, policy: c.policy });
  const staged = await STAGE(d, c);
  assert.equal(staged.status, 401);
  assert.deepEqual(body(staged).error_codes, ["SIGNATURE_INVALID"]);
  assert.equal((await statuses(pool)).length, 0);
});

test("V04 : une clé inconnue est refusée avec sa règle, rien n'est activé", async () => {
  await resetDb();
  const c = loadV2("V2_CATALOGUE.v2_unknown_key");
  const d = deps(pool, { now: c.now, policy: c.policy });
  const staged = await STAGE(d, c);
  assert.equal(staged.status >= 400, true);
  assert.equal(body(staged).error_codes[0], "SNAPSHOT_INVALID");
});

test("un dérivé non reçu : MEDIA_MISSING à la vérification, le catalogue précédent reste servi", async () => {
  await resetDb();
  const c = loadV2("V2_CATALOGUE.v2_derivative_missing");
  const d = deps(pool, { now: c.now, policy: c.policy });
  await STAGE(d, c);
  await putMedia(d, c);
  const verified = await VERIFY(d, c);
  assert.deepEqual(body(verified).error_codes, ["MEDIA_MISSING"]);
  assert.equal(await siteDb.getActiveGeneration(pool), null);
});

const requireBuild = createRequire(import.meta.url);

test("la vue v1 d'un catalogue v2 a la forme v1 (c'est ce que lisent les prix et les commandes), et l'index des octets servis nomme les dérivés et le document", () => {
  const view = requireBuild(join(ROOT, ".bc2-build", "lib/site-catalog/v1-view.js"));
  const c = loadV2("V2_CATALOGUE.v2_accepted");
  const v1 = view.asV1(c.doc);
  assert.equal(v1.contract_version, "site_snapshot.v1");
  assert.equal(c0snapshot.shapeOk(v1), true, "la vue passe la forme du contrat v1 gelé");
  assert.equal(view.asV1(view.asV1(c.doc)).contract_version, "site_snapshot.v1", "idempotente");
  const served = view.servedIndex(c.doc);
  const expected = c.media.map((m) => m.sha256).sort();
  assert.deepEqual([...served.keys()].sort(), expected, "exactement les octets que le SITE a reçus : dérivés, images sans dérivé, document");
});
