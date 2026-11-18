// Cercle 5, ligne 5.24 (attendu P05) — aucune coordonnée dans les journaux du site : tout le parcours d'une demande (devis, commande, demande libre,
// accusé, reçu juste et faux, effacement, PDF, mise de côté, état de l'accusé, acquittement et conservation) est joué en capturant la sortie du
// processus ; ni elle, ni le journal en base ne contiennent l'adresse, le nom, la rue ou le message d'essai. Valeurs inventées.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { join } from "node:path";
import { ROOT, activate, businessCase, enc, newPool, resetDb } from "./helpers.mjs";

const requireBuild = createRequire(import.meta.url);
const build = (rel) => requireBuild(join(ROOT, ".bc4-build", rel));
const requests = build("lib/site-requests/submit.js");
const commerce = build("lib/site-commerce/document.js");
const receipt = build("lib/site-transactions/receipt.js");
const events = build("lib/site-transactions/events.js");
const routes = build("lib/site-requests-routes/handlers.js");
const ack = build("lib/site-ack-mail/ack.js");
const { canonicalBytes } = build("c0/ts/src/jsonc.js");

const SECRETS = { email: "dominique.essai@val-fictif.example", name: "Dominique Essai-Fictif", street: "7 allée du Jeu-d'Essai", message: "Message d'essai à ne jamais journaliser." };
let pool;
before(async () => {
  await resetDb();
  pool = newPool();
  await activate(pool, "F_SELL_WINDOWS.activate");
  const d = {
    contract_version: "site_commerce.v1", publication_id: "pub-0001", commerce_sequence: 1, generated_at_utc: "2026-10-20T08:00:00Z", tax_rate: "20.00",
    delivery_rendez_vous: { label: "Livraison sur rendez-vous", amount_ht: "20.00" },
    payment: { cheque: { label: "Chèque", instructions: "Texte d'attente." }, virement: { label: "Virement", instructions: "Texte d'attente." }, mandat_administratif: { label: "Mandat administratif", instructions: "Texte d'attente." } },
    privacy_notice: { version: "m1", text: "Texte d'attente." }, cgv_version: "c1",
    acknowledgement: { quote: { subject: "{numero}", body: "{recapitulatif} {lien_recu}" }, order: { subject: "{numero}", body: "{recapitulatif}" }, message: { subject: "{numero}", body: "{lien_recu}" } }, sender: null,
  };
  const doc = { ...d, payload_sha256: commerce.documentDigest(d) };
  await pool.query("INSERT INTO site_commerce_active (singleton, commerce_sequence, publication_id, payload_sha256, document_bytes, ack_bytes) VALUES (1, $1, $2, $3, $4, $5)",
    [doc.commerce_sequence, doc.publication_id, doc.payload_sha256, Buffer.from(canonicalBytes(doc)), Buffer.from("{}")]);
});
after(async () => { await pool.end(); });

const NOW = "2026-10-20T09:00:00Z";
const parse = (r) => JSON.parse(Buffer.from(r.body).toString("utf8"));
const contact = { organisation: "", name: SECRETS.name, email: SECRETS.email, phone: "" };

test("P05 : le parcours complet ne laisse aucune coordonnée dans la sortie du processus ni dans le journal en base", async () => {
  const lines = [];
  const saved = { log: console.log, info: console.info, warn: console.warn, error: console.error, debug: console.debug };
  for (const k of Object.keys(saved)) console[k] = (...args) => lines.push(args.map(String).join(" "));
  try {
    const quoteBody = { ...JSON.parse(Buffer.from(businessCase("F_QUOTE_ORDER.quote_priced").bytes).toString("utf8")), idempotency_key: "quote:c5l:0001" };
    quoteBody.contact = { ...quoteBody.contact, contact_name: SECRETS.name, email: SECRETS.email };
    const quote = parse(await requests.submitRequest({ pool, now: () => NOW }, "quote_request", enc({ request: quoteBody, extras: { commerce_sequence: 1, privacy_notice: "m1" } })));
    const orderBody = { ...JSON.parse(Buffer.from(businessCase("F_QUOTE_ORDER.order_valid").bytes).toString("utf8")), idempotency_key: "order:c5l:0001" };
    const address = { name: SECRETS.name, line1: SECRETS.street, line2: "", postal_code: "00000", city: "Val-Fictif" };
    const order = parse(await requests.submitRequest({ pool, now: () => NOW }, "order", enc({ request: orderBody, extras: { commerce_sequence: 1, privacy_notice: "m1", total_ttc: "150.90", addresses: { delivery: address, billing: null }, customer_refs: { siret: "", order_number: "ENG-0001", service_code: "SVC-A" }, payment_method: "mandat_administratif", terms: { accepted: true, cgv_version: "c1" } } })));
    const message = parse(await requests.submitRequest({ pool, now: () => NOW }, "message", enc({ extras: { idempotency_key: "message:c5l:0001", commerce_sequence: 1, privacy_notice: "m1", contact, message: SECRETS.message, product: null } })));
    for (const created of [quote, order, message]) assert.ok(created.receipt_ref, JSON.stringify(created).slice(0, 200));
    for (const [created, type] of [[quote, "quote.requested"], [order, "order.received"], [message, "message.received"]]) {
      const { rows: [e] } = await pool.query("SELECT payload FROM site_outbox_event WHERE object_ref = $1", [created.receipt_ref]);
      await ack.enqueueAcknowledgement(pool, { eventType: type, objectRef: created.receipt_ref, payload: e.payload, accessToken: created.access_token }, "smtp");
    }
    await ack.drainAcknowledgements(pool, { send: async () => ({ outcome: "failed", code: "SERVICE_DOWN" }) }, new Date(Date.now() + 1000));
    await receipt.postReceipt({ pool }, enc({ ref: quote.receipt_ref, code: quote.access_token }));
    await receipt.postReceipt({ pool }, enc({ ref: quote.receipt_ref, code: "z".repeat(43) }));
    const pdf = Buffer.from(`%PDF-1.4\n% ${SECRETS.name}\n`);
    await routes.depositDocument(pool, enc({ object_ref: order.receipt_ref, kind: "bon_de_commande", sha256: createHash("sha256").update(pdf).digest("hex"), pdf_base64: pdf.toString("base64") }));
    await routes.mailStatus(pool, enc({ object_refs: [quote.receipt_ref, order.receipt_ref, message.receipt_ref] }));
    const { rows: [m] } = await pool.query("SELECT event_id FROM site_outbox_event WHERE object_ref = $1", [message.receipt_ref]);
    await routes.setAsideEvent(pool, enc({ event_id: m.event_id, code: "EVENT_PAYLOAD_INVALID" }));
    const { rows: [q] } = await pool.query("SELECT event_id FROM site_outbox_event WHERE object_ref = $1", [quote.receipt_ref]);
    await pool.query("UPDATE site_outbox_event SET status = 'DELIVERED_TO_POLL', delivered_at = now() WHERE event_id = $1", [q.event_id]);
    await pool.query("UPDATE site_outbox_event SET status = 'ACKED', acked_at = now() - interval '31 days' WHERE event_id = $1", [q.event_id]);
    await events.markRequestsAcked(pool, [q.event_id], 30);
    await routes.eraseRequest(pool, enc({ object_ref: order.receipt_ref }));
  } finally {
    Object.assign(console, saved);
  }
  const journal = JSON.stringify((await pool.query("SELECT * FROM site_transaction_log")).rows);
  assert.ok(journal.includes("REQUESTS_ERASE") && journal.includes("ACK_MAIL") && journal.includes("RECEIPT"), "le journal a bien été écrit pendant le parcours");
  const output = lines.join("\n");
  for (const [what, value] of Object.entries(SECRETS)) {
    assert.ok(!journal.includes(value), `journal en base : ${what}`);
    assert.ok(!output.includes(value), `sortie du processus : ${what}`);
  }
});
