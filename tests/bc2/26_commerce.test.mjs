// Cercle 5 (5.21) — les réglages de vente `site_commerce.v1` par le canal signé, sur PostgreSQL réel : un seul état actif, accusé signé après COMMIT, un refus laisse servis les réglages précédents.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { join } from "node:path";
import { KEYRING, ROOT, deps, newPool, resetDb, signing } from "./helpers.mjs";

const requireBuild = createRequire(import.meta.url);
const build = (rel) => requireBuild(join(ROOT, ".bc2-build", rel));
const route = build("lib/site-commerce/route.js");
const store = build("lib/site-commerce/store.js");
const document = build("lib/site-commerce/document.js");
const activation = build("lib/site-commerce/activation.js");
const { canonicalBytes } = requireBuild(join(ROOT, ".bc2-build", "c0/ts/src/jsonc.js"));

let pool;
before(async () => { await resetDb(); pool = newPool(); });
after(async () => { await pool.end(); });

const NOW = "2026-11-18T10:00:00Z";
const doc = (over = {}) => {
  const d = {
    contract_version: "site_commerce.v1", publication_id: "pub-0001", commerce_sequence: 1, generated_at_utc: "2026-11-18T09:00:00Z", tax_rate: "20.00",
    delivery_rendez_vous: { label: "Livraison sur rendez-vous", amount_ht: "20.00" },
    payment: { cheque: { label: "Chèque", instructions: "Texte d'attente." }, virement: { label: "Virement", instructions: "Texte d'attente." }, mandat_administratif: { label: "Mandat", instructions: "Texte d'attente." } },
    privacy_notice: { version: "m1", text: "Texte d'attente." }, cgv_version: "c1",
    acknowledgement: { quote: { subject: "S", body: "{numero}" }, order: { subject: "S", body: "{numero}" }, message: { subject: "S", body: "{numero}" } },
    sender: null, ...over,
  };
  return { ...d, payload_sha256: document.documentDigest(d) };
};
const send = (d, at = NOW) => route.activateCommerce(deps(pool, { now: at }), canonicalBytes(d));
const rows = async () => (await pool.query("SELECT commerce_sequence, payload_sha256 FROM site_commerce_active")).rows;
const log = async () => (await pool.query("SELECT outcome FROM site_publication_log WHERE operation = 'COMMERCE' ORDER BY id")).rows.map((r) => r.outcome);

test("sans réglage reçu, rien n'est actif : « la boutique n'est pas prête »", async () => {
  assert.equal(await store.readActiveCommerce(pool), null);
});

test("première activation : état écrit, accusé signé par la clé d'accusé, lisible ensuite", async () => {
  const r = await send(doc());
  assert.equal(r.status, 200);
  assert.equal(r.headers["x-c0-outcome"], "ACTIVATED");
  const ack = JSON.parse(Buffer.from(r.body).toString("utf8"));
  const stored = await store.readActiveCommerce(pool);
  assert.equal(stored.document.commerce_sequence, 1);
  assert.equal(activation.verifyAck(ack, KEYRING, "c0-test-ack-01", stored.document), true);
  assert.deepEqual(Buffer.from(stored.ackBytes), Buffer.from(r.body), "l'accusé relu est celui qui a été envoyé");
  assert.equal((await rows()).length, 1);
});

test("rejeu à l'identique : même accusé, un seul état", async () => {
  const first = await store.readActiveCommerce(pool);
  const r = await send(doc(), "2026-11-18T12:00:00Z");
  assert.equal(r.status, 200);
  assert.equal(r.headers["x-c0-outcome"], "REPLAY_ACK");
  assert.deepEqual(Buffer.from(r.body), Buffer.from(first.ackBytes));
  assert.equal((await rows()).length, 1);
});

test("même séquence, autre contenu : refusé (409) ; l'état servi ne change pas", async () => {
  const before = await rows();
  const r = await send(doc({ tax_rate: "5.50" }));
  assert.equal(r.status, 409);
  assert.deepEqual(JSON.parse(Buffer.from(r.body).toString("utf8")).error_codes, ["SEQUENCE_COLLISION"]);
  assert.deepEqual(await rows(), before);
});

test("séquence suivante : activée, le taux change ; la plus ancienne est refusée (STALE_SEQUENCE)", async () => {
  const r = await send(doc({ commerce_sequence: 2, tax_rate: "5.50" }));
  assert.equal(r.headers["x-c0-outcome"], "ACTIVATED");
  assert.equal((await store.readActiveCommerce(pool)).document.tax_rate, "5.50");
  const old = await send(doc({ commerce_sequence: 1 }));
  assert.equal(old.status, 409);
  assert.deepEqual(JSON.parse(Buffer.from(old.body).toString("utf8")).error_codes, ["STALE_SEQUENCE"]);
  assert.equal((await store.readActiveCommerce(pool)).document.commerce_sequence, 2);
});

test("document invalide : 422 avec les règles, rien n'est écrit, le refus est journalisé sans le texte", async () => {
  const bad = { ...doc({ commerce_sequence: 3 }), tax_rate: 20 };
  const r = await route.activateCommerce(deps(pool, { now: NOW }), canonicalBytes(bad));
  assert.equal(r.status, 422);
  const out = JSON.parse(Buffer.from(r.body).toString("utf8"));
  assert.deepEqual(out.error_codes, ["DOCUMENT_INVALID"]);
  assert.ok(out.detail.rules.includes("tax_rate_format"));
  assert.equal((await store.readActiveCommerce(pool)).document.commerce_sequence, 2);
  assert.deepEqual(await log(), ["ACTIVATED", "REPLAY_ACK", "REJECTED", "ACTIVATED", "REJECTED", "REJECTED"]);
});

test("octets altérés en base : jamais servis (fail-closed)", async () => {
  await pool.query("UPDATE site_commerce_active SET payload_sha256 = $1", ["0".repeat(64)]);
  assert.equal(await store.readActiveCommerce(pool), null);
});
