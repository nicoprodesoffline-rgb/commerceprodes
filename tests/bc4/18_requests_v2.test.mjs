// Cercle 5 (P2) — devis, commande et demande libre avec coordonnées, sur PostgreSQL réel : montants HT/TVA/TTC (M01–M05), numéros sans trou (Q01–Q03), champ piège (Q04),
// demande libre (Q05, Q06), commande (C01–C06), UN événement v2 et plus de v1 (D01). Génération : F_SELL_WINDOWS.activate ; corps C0 : F_QUOTE_ORDER ; valeurs inventées.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { join } from "node:path";
import { ROOT, activate, businessCase, enc, newPool, resetDb } from "./helpers.mjs";

const requireBuild = createRequire(import.meta.url);
const build = (rel) => requireBuild(join(ROOT, ".bc4-build", rel));
const requests = build("lib/site-requests/submit.js");
const commerce = build("lib/site-commerce/document.js");
const { canonicalBytes } = build("c0/ts/src/jsonc.js");

let pool;
const NOW = "2026-10-20T09:00:00Z";
before(async () => { await resetDb(); pool = newPool(); await activate(pool, "F_SELL_WINDOWS.activate"); });
after(async () => { await pool.end(); });

const settings = (over = {}) => {
  const d = {
    contract_version: "site_commerce.v1", publication_id: "pub-0001", commerce_sequence: 1, generated_at_utc: "2026-10-20T08:00:00Z", tax_rate: "20.00",
    delivery_rendez_vous: { label: "Livraison sur rendez-vous", amount_ht: "20.00" },
    payment: { cheque: { label: "Chèque", instructions: "Texte d'attente chèque." }, virement: { label: "Virement", instructions: "Texte d'attente virement." }, mandat_administratif: { label: "Mandat administratif", instructions: "Texte d'attente mandat." } },
    privacy_notice: { version: "m1", text: "Texte d'attente." }, cgv_version: "c1",
    acknowledgement: { quote: { subject: "S", body: "{numero}" }, order: { subject: "S", body: "{numero}" }, message: { subject: "S", body: "{numero}" } }, sender: null, ...over,
  };
  return { ...d, payload_sha256: commerce.documentDigest(d) };
};
async function install(doc) {
  const bytes = canonicalBytes(doc);
  await pool.query("DELETE FROM site_commerce_active");
  await pool.query("INSERT INTO site_commerce_active (singleton, commerce_sequence, publication_id, payload_sha256, document_bytes, ack_bytes) VALUES (1, $1, $2, $3, $4, $5)", [doc.commerce_sequence, doc.publication_id, doc.payload_sha256, Buffer.from(bytes), Buffer.from("{}")]);
}

const orderRequest = (key) => ({ ...JSON.parse(Buffer.from(businessCase("F_QUOTE_ORDER.order_valid").bytes).toString("utf8")), idempotency_key: key });
const quoteRequest = (key) => ({ ...JSON.parse(Buffer.from(businessCase("F_QUOTE_ORDER.quote_priced").bytes).toString("utf8")), idempotency_key: key });
const address = { name: "Mairie de Val-Fictif", line1: "7 allée Fictive", line2: "", postal_code: "00000", city: "Val-Fictif" };
const orderExtras = (over = {}) => ({ commerce_sequence: 1, privacy_notice: "m1", total_ttc: "150.90", addresses: { delivery: address, billing: null }, customer_refs: { siret: "", order_number: "ENG-0001", service_code: "SVC-A" }, payment_method: "mandat_administratif", terms: { accepted: true, cgv_version: "c1" }, ...over });
const quoteExtras = (over = {}) => ({ commerce_sequence: 1, privacy_notice: "m1", ...over });
async function send(kind, body) {
  const r = await requests.submitRequest({ pool, now: () => NOW }, kind, enc(body));
  return { status: r.status, body: JSON.parse(Buffer.from(r.body).toString("utf8")) };
}
const n = async (table) => (await pool.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n;
const counter = async (prefix) => (await pool.query("SELECT last FROM site_number_counter WHERE prefix = $1 AND year = 2026", [prefix])).rows[0]?.last ?? 0;

test("sans réglages de vente : « la boutique n'est pas prête », rien d'enregistré ni de compté", async () => {
  const r = await send("order", { request: orderRequest("order:v2:0000"), extras: orderExtras() });
  assert.equal(r.status, 503);
  assert.deepEqual(r.body.error_codes, ["SHOP_NOT_READY"]);
  assert.equal(await n("site_order"), 0);
  assert.equal(await counter("CMD"), 0);
});

test("M04 : réglages d'une autre séquence → à reconfirmer, rien d'écrit", async () => {
  await install(settings());
  const r = await send("order", { request: orderRequest("order:v2:0001"), extras: orderExtras({ commerce_sequence: 0 }) });
  assert.equal(r.status, 409);
  assert.deepEqual(r.body.error_codes, ["COMMERCE_CHANGED"]);
  assert.equal(r.body.commerce_sequence, 1);
  assert.equal(await n("site_order"), 0);
});

test("M05 : un TTC falsifié est refusé comme un prix falsifié ; aucun numéro consommé", async () => {
  const r = await send("order", { request: orderRequest("order:v2:0002"), extras: orderExtras({ total_ttc: "1.00" }) });
  assert.equal(r.status, 409);
  assert.deepEqual(r.body.error_codes, ["PRICE_CHANGED"]);
  assert.equal(await n("site_order"), 0);
  assert.equal(await counter("CMD"), 0);
});

test("C01, C03, C04, C06 : adresse, SIRET, règlement, case des conditions ; refus nommés, rien d'écrit, aucun numéro consommé", async () => {
  const cases = [
    [{ addresses: { delivery: { ...address, city: "" }, billing: null } }, "address_required"],
    [{ customer_refs: { siret: "0".repeat(13) } }, "siret_format"],
    [{ payment_method: undefined }, "payment_method"],
    [{ payment_method: "carte" }, "payment_method"],
    [{ terms: { accepted: false, cgv_version: "c1" } }, "terms_required"],
    [{ terms: { accepted: true, cgv_version: "ancienne" } }, "terms_required"],
    [{ privacy_notice: "" }, "privacy_notice_required"],
    [{ delivery_option: "express" }, "delivery_option"],
  ];
  for (const [over, rule] of cases) {
    const r = await send("order", { request: orderRequest("order:v2:0003"), extras: orderExtras(over) });
    assert.equal(r.status, 422, rule);
    assert.deepEqual(r.body.error_codes, ["REQUEST_INVALID"]);
    assert.ok(r.body.detail.rules.includes(rule), `${rule} : ${JSON.stringify(r.body.detail)}`);
  }
  assert.equal(await n("site_order"), 0);
  assert.equal(await n("site_idempotency"), 0);
  assert.equal(await counter("CMD"), 0);
});

test("C07, M01, C05, D01 : commande valide → CMD-2026-000001, TTC, marche à suivre, UN événement v2 (aucun v1)", async () => {
  const r = await send("order", { request: orderRequest("order:v2:0010"), extras: orderExtras() });
  assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 400));
  assert.equal(r.body.number, "CMD-2026-000001");
  assert.match(r.body.receipt_ref, /^ORD-[0-9a-f]{32}$/);
  assert.deepEqual([r.body.amounts.total_ht, r.body.amounts.total_tva, r.body.amounts.total_ttc], ["125.75", "25.15", "150.90"]);
  assert.equal(r.body.delivery.option, "incluse");
  assert.deepEqual(r.body.payment, { method: "mandat_administratif", instructions: "Texte d'attente mandat." });
  assert.doesNotMatch(JSON.stringify(r.body), /payé/i, "jamais « payé »");
  const row = (await pool.query("SELECT number, privacy_notice, addresses, customer_refs, payment, terms, commerce_sequence, amounts FROM site_order")).rows[0];
  assert.equal(row.number, "CMD-2026-000001");
  assert.equal(row.addresses.billing, null, "facturation absente = comme la livraison (C02)");
  assert.equal(row.customer_refs.order_number, "ENG-0001");
  assert.equal(row.terms.cgv_version, "c1");
  const lines = (await pool.query("SELECT line_tva, item_label FROM site_order_line ORDER BY line_no")).rows;
  assert.deepEqual(lines.map((l) => l.line_tva), ["22.00", "3.15"]);
  assert.ok(lines.every((l) => l.item_label.length > 0));
  const events = (await pool.query("SELECT event_type, contract_version, object_ref, event_bytes FROM site_outbox_event")).rows;
  assert.equal(events.length, 1);
  assert.deepEqual([events[0].event_type, events[0].contract_version, events[0].object_ref], ["order.received", "site_events.v2", r.body.receipt_ref]);
  const event = JSON.parse(Buffer.from(events[0].event_bytes).toString("utf8"));
  assert.equal(event.contract_version, "site_events.v2");
  assert.equal(event.payload.number, "CMD-2026-000001");
  assert.equal(event.payload.contact.email, "achats@example.invalid");
  assert.equal(event.payload.amounts.total_ttc, "150.90");
  assert.equal(event.payload.payment.method, "mandat_administratif");
  assert.deepEqual(Object.keys(event.payload).sort(), ["addresses", "amounts", "contact", "customer_refs", "delivery", "lines", "message", "number", "payment", "privacy_notice", "status", "terms"]);
});

test("Q03 : le même envoi rejoué rend le même numéro et le même reçu, sans nouvelle ligne ni numéro", async () => {
  const again = await send("order", { request: orderRequest("order:v2:0010"), extras: orderExtras() });
  assert.equal(again.status, 200);
  assert.equal(again.body.outcome, "REPLAY_SAME_RECEIPT");
  assert.equal(again.body.number, "CMD-2026-000001");
  assert.equal(again.body.access_token, undefined, "le jeton n'est renvoyé qu'une fois");
  assert.equal(await n("site_order"), 1);
  assert.equal(await n("site_outbox_event"), 1);
  assert.equal(await counter("CMD"), 1);
});

test("même clé, autres extras (autre adresse) : refusé comme un autre contenu", async () => {
  const r = await send("order", { request: orderRequest("order:v2:0010"), extras: orderExtras({ addresses: { delivery: { ...address, city: "Autre-Ville" }, billing: null } }) });
  assert.equal(r.status, 409);
  assert.deepEqual(r.body.error_codes, ["DUPLICATE_KEY_DIFFERENT_PAYLOAD"]);
  assert.equal(await n("site_order"), 1);
});

test("M03 : l'option sur rendez-vous ajoute 20,00 HT et 4,00 de TVA, ligne à part ; numéro suivant 000002", async () => {
  const r = await send("order", { request: orderRequest("order:v2:0011"), extras: orderExtras({ delivery_option: "rendez_vous", total_ttc: "174.90" }) });
  assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 300));
  assert.equal(r.body.number, "CMD-2026-000002");
  assert.deepEqual(r.body.delivery, { option: "rendez_vous", label: "Livraison sur rendez-vous", amount_ht: "20.00", amount_tva: "4.00" });
  assert.deepEqual([r.body.amounts.total_ht, r.body.amounts.total_tva, r.body.amounts.total_ttc], ["145.75", "29.15", "174.90"]);
});

test("Q01, Q02 : devis → DEV-2026-000001 ; deux envois simultanés → deux numéros consécutifs, jamais le même", async () => {
  const first = await send("quote_request", { request: quoteRequest("quote:v2:0001"), extras: quoteExtras() });
  assert.equal(first.status, 200, JSON.stringify(first.body).slice(0, 300));
  assert.equal(first.body.number, "DEV-2026-000001");
  assert.deepEqual([first.body.amounts.total_ht, first.body.amounts.total_tva, first.body.amounts.total_ttc], ["110.00", "22.00", "132.00"]);
  const [a, b] = await Promise.all([
    send("quote_request", { request: quoteRequest("quote:v2:0002"), extras: quoteExtras() }),
    send("quote_request", { request: quoteRequest("quote:v2:0003"), extras: quoteExtras() }),
  ]);
  assert.deepEqual([a.body.number, b.body.number].sort(), ["DEV-2026-000002", "DEV-2026-000003"]);
  assert.equal(await counter("DEV"), 3);
  const events = (await pool.query("SELECT event_type, contract_version FROM site_outbox_event WHERE event_type = 'quote.requested'")).rows;
  assert.equal(events.length, 3);
  assert.ok(events.every((e) => e.contract_version === "site_events.v2"));
});

test("Q05, Q06 : demande libre MSG-2026-000001 avec le produit ; sans message refusée ; rejouée = même numéro", async () => {
  const body = (over = {}) => ({ extras: { idempotency_key: "message:v2:0001", commerce_sequence: 1, privacy_notice: "m1", contact: { organisation: "", name: "Camille Exemple", email: "camille@val-fictif.example", phone: "" }, message: "Pouvez-vous confirmer le délai ?", product: { public_item_key: "PI-000000CHJ", label: "Banc d'essai", url: "/famille/banc-d-essai" }, ...over } });
  const empty = await send("message", body({ message: "  " }));
  assert.equal(empty.status, 422);
  assert.ok(empty.body.detail.rules.includes("message_required"));
  assert.equal(await counter("MSG"), 0);
  const ok = await send("message", body());
  assert.equal(ok.status, 200, JSON.stringify(ok.body).slice(0, 300));
  assert.equal(ok.body.number, "MSG-2026-000001");
  assert.match(ok.body.receipt_ref, /^MSG-[0-9a-f]{32}$/);
  const row = (await pool.query("SELECT message_ref, number, product, contact FROM site_message")).rows[0];
  assert.equal(row.product.label, "Banc d'essai");
  assert.equal(row.contact.organisation, null);
  const ev = (await pool.query("SELECT event_type, contract_version, object_ref, event_bytes FROM site_outbox_event WHERE event_type = 'message.received'")).rows[0];
  assert.equal(ev.object_ref, row.message_ref);
  const payload = JSON.parse(Buffer.from(ev.event_bytes).toString("utf8")).payload;
  assert.deepEqual(Object.keys(payload).sort(), ["contact", "message", "number", "privacy_notice", "product"]);
  assert.deepEqual(payload.product, { label: "Banc d'essai", public_item_key: "PI-000000CHJ", url: "/famille/banc-d-essai" });
  const again = await send("message", body());
  assert.equal(again.body.outcome, "REPLAY_SAME_RECEIPT");
  assert.equal(again.body.number, "MSG-2026-000001");
  assert.equal(await n("site_message"), 1);
  const other = await send("message", body({ message: "Un autre texte" }));
  assert.equal(other.status, 409);
});

test("Q04 : champ piège rempli → réponse d'apparence normale, rien d'enregistré, rien d'émis, aucun numéro", async () => {
  const before = { orders: await n("site_order"), events: await n("site_outbox_event"), cmd: await counter("CMD"), msg: await n("site_message") };
  const r = await send("order", { request: orderRequest("order:v2:0099"), extras: orderExtras({ website: "http://spam.example" }) });
  assert.equal(r.status, 200);
  assert.equal(r.body.accepted, true);
  assert.match(r.body.number, /^CMD-2026-\d{6}$/);
  const m = await send("message", { extras: { idempotency_key: "message:v2:0099", commerce_sequence: 1, privacy_notice: "m1", website: "x", contact: { name: "Robot", email: "r@bot.example" }, message: "pub" } });
  assert.equal(m.status, 200);
  assert.deepEqual({ orders: await n("site_order"), events: await n("site_outbox_event"), cmd: await counter("CMD"), msg: await n("site_message") }, before);
});

test("clé inconnue dans extras, corps illisible, `request` manquante : refus nets", async () => {
  assert.equal((await send("order", { request: orderRequest("order:v2:0100"), extras: orderExtras({ prix: "0.01" }) })).status, 422);
  const bad = await requests.submitRequest({ pool, now: () => NOW }, "order", enc("pas du json"));
  assert.equal(bad.status, 400);
  assert.equal((await send("order", { extras: orderExtras() })).status, 400);
});

test("journal : aucune coordonnée ni texte saisi", async () => {
  const text = JSON.stringify((await pool.query("SELECT operation, outcome, object_ref, detail, error_codes FROM site_transaction_log")).rows);
  assert.doesNotMatch(text, /example\.invalid|val-fictif|Camille|Mairie|ENG-0001|spam/);
});
