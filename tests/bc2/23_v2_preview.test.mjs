// Cercle 3, 3.2 (B14) — l'aperçu d'une page en brouillon par le canal signé : gardé 30 minutes au plus sous un jeton tiré par le SITE, jamais activé.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ACTIVATE, ROOT, STAGE, VERIFY, body, deps, headersFor, jsonc, mediaHeaders, newPool, resetDb, receiver } from "./helpers.mjs";

const V2 = join(ROOT, "c0v2", "fixtures");
const requireBuild = createRequire(import.meta.url);
const preview = requireBuild(join(ROOT, ".bc2-build", "lib/site-publish/preview.js"));
const store = requireBuild(join(ROOT, ".bc2-build", "lib/site-publish/preview-store.js"));
const VERDICTS = JSON.parse(readFileSync(join(V2, "VERDICTS.json"), "utf8")).cases;
const read = (rel) => new Uint8Array(readFileSync(join(V2, rel)));

function loadCase(caseId) {
  const [scenario, name] = caseId.split(".");
  const c = JSON.parse(readFileSync(join(V2, "cases", scenario, `${name}.json`), "utf8"));
  return { c, verdict: VERDICTS[caseId], bytes: read(c.input.preview.$bytes), transport: c.input.transport, now: c.input.now_utc };
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

const send = (item) => preview.storePreview(deps(pool, { now: item.now }), item.bytes, headersFor(item.transport));
const count = async () => Number((await pool.query("SELECT count(*) FROM site_content_preview")).rows[0].count);

test("B14 : un aperçu accepté est gardé sous un jeton tiré par le SITE ; il n'active rien et ne touche aucun contenu servi", async () => {
  const res = await send(loadCase("V2_PREVIEW.preview_accepted"));
  assert.equal(res.status, 200);
  assert.equal(res.headers["x-c0-outcome"], undefined, "pas un accusé");
  const answer = body(res);
  assert.equal(answer.outcome, "PREVIEW_STORED");
  assert.match(answer.path, /^\/apercu\/[0-9a-f]{32}$/);
  assert.equal((await pool.query("SELECT count(*) FROM site_content_active")).rows[0].count, "0", "aucun contenu actif créé");
  const id = answer.path.slice("/apercu/".length);
  // L'horloge de la base n'est pas celle de la fixture : on rend l'aperçu lisible pour tester la lecture, puis expiré pour tester le 404.
  await pool.query("UPDATE site_content_preview SET expires_at = now() + interval '10 minutes' WHERE preview_id = $1", [id]);
  const doc = await store.readPreview(pool, id);
  assert.equal(doc.page.slug, "/saison");
  await pool.query("UPDATE site_content_preview SET expires_at = now() - interval '1 second' WHERE preview_id = $1", [id]);
  assert.equal(await store.readPreview(pool, id), null, "expiré : introuvable");
});

test("deux aperçus ont deux jetons distincts, et un jeton mal formé ne lit rien", async () => {
  const a = body(await send(loadCase("V2_PREVIEW.preview_accepted"))).path;
  const b = body(await send(loadCase("V2_PREVIEW.preview_accepted"))).path;
  assert.notEqual(a, b);
  assert.equal(await store.readPreview(pool, "../../etc/passwd"), null);
  assert.equal(await store.readPreview(pool, "0".repeat(32)), null);
});

for (const name of ["preview_expired", "preview_too_long", "preview_reference_missing"]) {
  test(`${name} est refusé avec son code et rien n'est gardé`, async () => {
    const before = await count();
    const item = loadCase(`V2_PREVIEW.${name}`);
    const res = await send(item);
    const refused = body(res);
    assert.equal(refused.accepted, false);
    assert.deepEqual(refused.error_codes, item.verdict.error_codes);
    assert.equal(await count(), before);
  });
}

test("une clé inconnue est refusée à la porte", async () => {
  const item = loadCase("V2_PREVIEW.preview_accepted");
  const res = await preview.storePreview(deps(pool, { now: item.now }), item.bytes, headersFor({ key_id: "inconnue", signature: "0".repeat(64) }));
  assert.equal(res.status, 401);
});
