// Cercle 3, 3.2 (V07, V09, 3.31, E03) — les contenus v2 par le canal signé : un seul appel, octets canoniques, accusé signé ; un refus laisse servis les contenus précédents.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ACTIVATE, ROOT, STAGE, VERIFY, body, deps, headersFor, jsonc, mediaHeaders, newPool, resetDb, receiver } from "./helpers.mjs";

const V2 = join(ROOT, "c0v2", "fixtures");
const requireBuild = createRequire(import.meta.url);
const content = requireBuild(join(ROOT, ".bc2-build", "lib/site-publish/content.js"));
const VERDICTS = JSON.parse(readFileSync(join(V2, "VERDICTS.json"), "utf8")).cases;
const read = (rel) => new Uint8Array(readFileSync(join(V2, rel)));

function loadCase(caseId) {
  const [scenario, name] = caseId.split(".");
  const c = JSON.parse(readFileSync(join(V2, "cases", scenario, `${name}.json`), "utf8"));
  return { c, verdict: VERDICTS[caseId], bytes: read(c.input.content.$bytes), transport: c.input.transport, now: c.input.now_utc };
}

async function activateCatalogue(pool) {
  const c = JSON.parse(readFileSync(join(V2, "cases", "V2_CATALOGUE", "v2_accepted.json"), "utf8")).input;
  const bytes = read(c.snapshot.$bytes);
  const doc = jsonc.parseBytes(bytes, 64 << 20);
  const k = { bytes, doc, transport: c.transport };
  const d = deps(pool, { now: c.now_utc, policy: c.policy });
  await STAGE(d, k);
  for (const m of c.media_store) await receiver.putMedia(d, m.sha256, read(m.file.$media), mediaHeaders(m.sha256, read(m.file.$media).length), "image/png");
  await VERIFY(d, k);
  const activated = await ACTIVATE(d, k);
  assert.equal(activated.headers["x-c0-outcome"], "ACTIVATED");
}

let pool;
before(async () => { await resetDb(); pool = newPool(); await activateCatalogue(pool); });
after(async () => { await pool.end(); });

const send = (item) => content.activateContent(deps(pool, { now: item.now }), item.bytes, headersFor(item.transport));
const active = async () => (await pool.query("SELECT content_sequence, payload_sha256 FROM site_content_active")).rows;

test("V07 : une page est reçue, vérifiée, activée et accusée ; le SITE garde l'accusé signé (aucun dossier partagé nécessaire)", async () => {
  const item = loadCase("V2_CONTENT.content_accepted");
  const res = await send(item);
  assert.equal(res.status, 200);
  assert.equal(res.headers["x-c0-outcome"], "ACTIVATED");
  const ack = jsonc.parseBytes(res.body, 1 << 20);
  assert.equal(ack.contract_version, "site_content_activation.v2");
  assert.equal(ack.content_sequence, item.verdict.expect["ack.content_sequence"]);
  assert.equal((await active()).length, 1);
});

test("le même document rejoué : l'accusé stocké, octet pour octet, sans seconde activation", async () => {
  const item = loadCase("V2_CONTENT.content_replay");
  const first = await send(loadCase("V2_CONTENT.content_accepted"));
  const again = await send(item);
  assert.equal(again.headers["x-c0-outcome"], "REPLAY_ACK");
  assert.equal(Buffer.compare(Buffer.from(again.body), Buffer.from(first.body)), 0);
});

for (const name of ["content_reference_missing", "content_signed_under_the_catalogue_domain", "content_unknown_key", "maintenance_without_message", "redirect_to_another_host", "redirect_with_a_scheme", "redirect_chain", "content_stale"]) {
  test(`V09 / 3.31 : ${name} est refusé avec son code et les contenus précédents restent servis`, async () => {
    const before = await active();
    const item = loadCase(`V2_CONTENT.${name}`);
    const res = await send(item);
    assert.equal(res.headers["x-c0-outcome"], undefined);
    const refused = body(res);
    assert.equal(refused.accepted, false);
    assert.deepEqual(refused.error_codes, item.verdict.error_codes);
    if (item.verdict.expect["detail.rules"]) assert.deepEqual(refused.detail.rules, item.verdict.expect["detail.rules"]);
    assert.deepEqual(await active(), before, "l'état actif n'a pas bougé");
  });
}

test("E03 : un réglage contenant du HTML est accepté comme du texte (le SITE l'échappe à l'affichage)", async () => {
  const item = loadCase("V2_CONTENT.content_html_in_a_setting");
  const res = await send(item);
  assert.equal(res.headers["x-c0-outcome"], "ACTIVATED");
});

test("une clé inconnue ou une signature absente est refusée à la porte, rien n'est écrit", async () => {
  const item = loadCase("V2_CONTENT.content_accepted");
  const before = await active();
  const res = await content.activateContent(deps(pool, { now: item.now }), item.bytes, headersFor({ key_id: "inconnue", signature: "0".repeat(64) }));
  assert.equal(res.status, 401);
  assert.deepEqual(await active(), before);
});
