// Cercle 5 (5.22 ; attendus P01, P02, P03, D05) — le reçu d'une demande avec coordonnées, sur PostgreSQL réel : code dans le corps, « Reçue » puis
// « Transmise à notre équipe » à l'acquittement, PDF proposé une fois la demande transmise, reçu intact après effacement. Valeurs inventées.
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
const routes = build("lib/site-requests-routes/handlers.js");
const { canonicalBytes } = build("c0/ts/src/jsonc.js");

let pool;
const NOW = "2026-10-20T09:00:00Z";
before(async () => {
  await resetDb();
  pool = newPool();
  await activate(pool, "F_SELL_WINDOWS.activate");
  const d = {
    contract_version: "site_commerce.v1", publication_id: "pub-0001", commerce_sequence: 1, generated_at_utc: "2026-10-20T08:00:00Z", tax_rate: "20.00",
    delivery_rendez_vous: { label: "Livraison sur rendez-vous", amount_ht: "20.00" },
    payment: { cheque: { label: "Chèque", instructions: "Texte d'attente chèque." }, virement: { label: "Virement", instructions: "Texte d'attente virement." }, mandat_administratif: { label: "Mandat administratif", instructions: "Texte d'attente mandat." } },
    privacy_notice: { version: "m1", text: "Texte d'attente." }, cgv_version: "c1",
    acknowledgement: { quote: { subject: "S", body: "{numero}" }, order: { subject: "S", body: "{numero}" }, message: { subject: "S", body: "{numero}" } }, sender: null,
  };
  const doc = { ...d, payload_sha256: commerce.documentDigest(d) };
  await pool.query("INSERT INTO site_commerce_active (singleton, commerce_sequence, publication_id, payload_sha256, document_bytes, ack_bytes) VALUES (1, $1, $2, $3, $4, $5)",
    [doc.commerce_sequence, doc.publication_id, doc.payload_sha256, Buffer.from(canonicalBytes(doc)), Buffer.from("{}")]);
});
after(async () => { await pool.end(); });

async function send(kind, body) {
  const r = await requests.submitRequest({ pool, now: () => NOW }, kind, enc(body));
  const parsed = JSON.parse(Buffer.from(r.body).toString("utf8"));
  assert.equal(r.status, 200, JSON.stringify(parsed).slice(0, 300));
  return parsed;
}
const newQuote = (n) => send("quote_request", { request: { ...JSON.parse(Buffer.from(businessCase("F_QUOTE_ORDER.quote_priced").bytes).toString("utf8")), idempotency_key: `quote:c5p:${n}` }, extras: { commerce_sequence: 1, privacy_notice: "m1" } });
const newMessage = (n) => send("message", { extras: { idempotency_key: `message:c5p:${n}`, commerce_sequence: 1, privacy_notice: "m1", contact: { organisation: "", name: "Camille Exemple", email: "camille@val-fictif.example", phone: "" }, message: "Une question d'essai.", product: null } });
const post = async (fn, body) => {
  const r = await fn({ pool }, enc(body));
  const type = r.headers["content-type"] ?? "";
  return { status: r.status, headers: r.headers, raw: r.body, body: type.startsWith("application/json") ? JSON.parse(Buffer.from(r.body).toString("utf8")) : null };
};
async function ack(ref) {
  const { rows: [e] } = await pool.query("SELECT event_id FROM site_outbox_event WHERE object_ref = $1", [ref]);
  await pool.query("UPDATE site_outbox_event SET status = 'DELIVERED_TO_POLL', delivered_at = now() WHERE event_id = $1", [e.event_id]);
  await pool.query("UPDATE site_outbox_event SET status = 'ACKED', acked_at = now() WHERE event_id = $1", [e.event_id]);
  await build("lib/site-transactions/events.js").markRequestsAcked(pool, [e.event_id], 30);
}
const pdf = Buffer.from("%PDF-1.4\n% demande d'essai\n");

test("P01, P02 : « Reçue » avant l'acquittement, « Transmise à notre équipe » après ; le numéro lisible est rendu", async () => {
  const q = await newQuote("0001");
  const before = await post(receipt.postReceipt, { ref: q.receipt_ref, code: q.access_token });
  assert.equal(before.status, 200);
  assert.deepEqual([before.body.number, before.body.transmission, before.body.transmission_label, before.body.document], [q.number, "recue", "Reçue", null]);
  await ack(q.receipt_ref);
  const after = await post(receipt.postReceipt, { ref: q.receipt_ref, code: q.access_token });
  assert.deepEqual([after.body.transmission, after.body.transmission_label], ["transmise", "Transmise à notre équipe"]);
});

test("P03 : le GET (code dans l'adresse) ne sert pas une demande v2 ; une référence inconnue et un code faux reçoivent le même refus", async () => {
  const q = await newQuote("0002");
  const viaGet = await receipt.getReceipt({ pool }, new URLSearchParams({ ref: q.receipt_ref, access_token: q.access_token }));
  assert.equal(viaGet.status, 404);
  const wrong = await post(receipt.postReceipt, { ref: q.receipt_ref, code: "x".repeat(43) });
  const unknown = await post(receipt.postReceipt, { ref: "QR-inconnu", code: q.access_token });
  assert.equal(wrong.status, 404);
  assert.deepEqual(Buffer.from(wrong.raw), Buffer.from(unknown.raw));
  for (const bad of [{ ref: q.receipt_ref }, { ref: q.receipt_ref, code: q.access_token, extra: 1 }, { ref: 1, code: "x" }]) {
    assert.equal((await post(receipt.postReceipt, bad)).status, 401, JSON.stringify(bad));
  }
});

test("PDF : proposé et servi seulement une fois déposé ET la demande transmise ; jamais pour un autre code", async () => {
  const q = await newQuote("0003");
  const sha = createHash("sha256").update(pdf).digest("hex");
  assert.equal((await routes.depositDocument(pool, enc({ object_ref: q.receipt_ref, kind: "demande_de_devis", sha256: sha, pdf_base64: pdf.toString("base64") }))).status, 200);
  assert.equal((await post(receipt.postReceipt, { ref: q.receipt_ref, code: q.access_token })).body.document, null, "déposé mais pas encore transmise");
  assert.equal((await post(receipt.postReceiptDocument, { ref: q.receipt_ref, code: q.access_token })).status, 404);
  await ack(q.receipt_ref);
  const r = await post(receipt.postReceipt, { ref: q.receipt_ref, code: q.access_token });
  assert.deepEqual(r.body.document, { kind: "demande_de_devis", sha256: sha });
  const file = await post(receipt.postReceiptDocument, { ref: q.receipt_ref, code: q.access_token });
  assert.equal(file.status, 200);
  assert.equal(file.headers["content-type"], "application/pdf");
  assert.match(file.headers["content-disposition"], new RegExp(`${q.number}\\.pdf`));
  assert.deepEqual(Buffer.from(file.raw), pdf);
  assert.equal((await post(receipt.postReceiptDocument, { ref: q.receipt_ref, code: "y".repeat(43) })).status, 404);
});

test("demande libre : reçu par POST, sans PDF", async () => {
  const m = await newMessage("0001");
  const r = await post(receipt.postReceipt, { ref: m.receipt_ref, code: m.access_token });
  assert.deepEqual([r.status, r.body.kind, r.body.number, r.body.document], [200, "message", m.number, null]);
  assert.equal((await post(receipt.postReceiptDocument, { ref: m.receipt_ref, code: m.access_token })).status, 404);
});

test("D05 : après effacement, le reçu reste consultable (numéro, lignes, montants) ; le PDF n'est plus proposé", async () => {
  const q = await newQuote("0004");
  const sha = createHash("sha256").update(pdf).digest("hex");
  await routes.depositDocument(pool, enc({ object_ref: q.receipt_ref, kind: "demande_de_devis", sha256: sha, pdf_base64: pdf.toString("base64") }));
  await ack(q.receipt_ref);
  const before = await post(receipt.postReceipt, { ref: q.receipt_ref, code: q.access_token });
  await routes.eraseRequest(pool, enc({ object_ref: q.receipt_ref }));
  const after = await post(receipt.postReceipt, { ref: q.receipt_ref, code: q.access_token });
  assert.equal(after.status, 200);
  assert.deepEqual(after.body.receipt, before.body.receipt);
  assert.equal(after.body.document, null);
  assert.ok(!Buffer.from(after.raw).toString("utf8").includes("val-fictif"), "le reçu ne porte aucune coordonnée");
});
