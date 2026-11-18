// Cercle 5 (5.3, 5.4, 5.22, 5.25 ; docs/site_events_v2.md §5, §6) — routes de la Factory vers le site et garde de la base, sur PostgreSQL réel :
// effacement (D07, D08), PDF déposé, mise de côté (P06), état de l'accusé, acquittement posé sur la demande (P01, P02), conservation de trente jours
// (D05, D06), porte signée hors C0 (une portée par route). Génération : F_SELL_WINDOWS.activate ; corps C0 : F_QUOTE_ORDER ; valeurs inventées.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { join } from "node:path";
import { ROOT, activate, businessCase, enc, newPool, resetDb } from "./helpers.mjs";

const requireBuild = createRequire(import.meta.url);
const build = (rel) => requireBuild(join(ROOT, ".bc4-build", rel));
const requests = build("lib/site-requests/submit.js");
const commerce = build("lib/site-commerce/document.js");
const events = build("lib/site-transactions/events.js");
const routes = build("lib/site-requests-routes/handlers.js");
const gate = build("lib/site-requests-routes/gate.js");
const keys = build("lib/site-requests-routes/keyring.js");
const { canonicalBytes } = build("c0/ts/src/jsonc.js");

let pool;
const NOW = "2026-10-20T09:00:00Z";
const secret = (c) => c.repeat(40);
const KEYRING = keys.parseRouteKeyring(enc({ keys: [
  { key_id: "essai-effacer", scope: "site_requests.erase", status: "ACTIVE", secret_utf8: secret("e") },
  { key_id: "essai-deposer", scope: "site_requests.documents", status: "ACTIVE", secret_utf8: secret("d") },
  { key_id: "essai-cote", scope: "site_events.set_aside", status: "ACTIVE", secret_utf8: secret("c") },
  { key_id: "essai-etat", scope: "site_requests.mail_status", status: "ACTIVE", secret_utf8: secret("m") },
  { key_id: "essai-retiree", scope: "site_requests.erase", status: "RETIRED", secret_utf8: secret("r") },
] }));

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

const fromCase = (name, key) => ({ ...JSON.parse(Buffer.from(businessCase(name).bytes).toString("utf8")), idempotency_key: key });
const address = { name: "Mairie de Val-Fictif", line1: "12 rue de l'Exemple-Fictif", line2: "", postal_code: "00000", city: "Val-Fictif" };
async function send(kind, body) {
  const r = await requests.submitRequest({ pool, now: () => NOW }, kind, enc(body));
  const parsed = JSON.parse(Buffer.from(r.body).toString("utf8"));
  assert.equal(r.status, 200, JSON.stringify(parsed).slice(0, 300));
  return parsed;
}
const newQuote = (n) => send("quote_request", { request: fromCase("F_QUOTE_ORDER.quote_priced", `quote:c5r:${n}`), extras: { commerce_sequence: 1, privacy_notice: "m1" } });
const newOrder = (n) => send("order", { request: fromCase("F_QUOTE_ORDER.order_valid", `order:c5r:${n}`), extras: { commerce_sequence: 1, privacy_notice: "m1", total_ttc: "150.90", addresses: { delivery: address, billing: null }, customer_refs: { siret: "", order_number: "ENG-0001", service_code: "SVC-A" }, payment_method: "mandat_administratif", terms: { accepted: true, cgv_version: "c1" } } });
const newMessage = (n) => send("message", { extras: { idempotency_key: `message:c5r:${n}`, commerce_sequence: 1, privacy_notice: "m1", contact: { organisation: "", name: "Camille Exemple", email: "camille@val-fictif.example", phone: "" }, message: "Pouvez-vous confirmer le délai ?", product: null } });
const answer = async (fn, body) => fn(pool, enc(body));
const pdf = Buffer.from("%PDF-1.4\n% document d'essai\n");
const sha = (b) => createHash("sha256").update(b).digest("hex");
const eventOf = async (ref) => (await pool.query("SELECT event_id, status, erased_at, set_aside_at, set_aside_code, octet_length(event_bytes) AS size FROM site_outbox_event WHERE object_ref = $1", [ref])).rows[0];

// --- base (G6, D08) ---------------------------------------------------------------------------------------------------------------

test("D08 : lignes, montants et numéro restent refusés par la base ; une coordonnée ne change que par effacement", async () => {
  const q = await newQuote("0001");
  await assert.rejects(pool.query("UPDATE site_quote_line SET quantity = quantity + 1 WHERE quote_id = (SELECT id FROM site_quote_request WHERE quote_ref = $1)", [q.receipt_ref]), /immuable/);
  await assert.rejects(pool.query("UPDATE site_quote_request SET amounts = '{}'::jsonb WHERE quote_ref = $1", [q.receipt_ref]), /figé/);
  await assert.rejects(pool.query("UPDATE site_quote_request SET number = 'DEV-2026-999999' WHERE quote_ref = $1", [q.receipt_ref]), /figé/);
  await assert.rejects(pool.query("UPDATE site_quote_request SET contact = '{\"name\":\"Autre\"}'::jsonb WHERE quote_ref = $1", [q.receipt_ref]), /effacement/);
  await assert.rejects(pool.query("UPDATE site_quote_request SET coordinates_erased_at = now() WHERE quote_ref = $1", [q.receipt_ref]), /effacement remet/);
  await assert.rejects(pool.query("DELETE FROM site_quote_request WHERE quote_ref = $1", [q.receipt_ref]), /suppression refusée/);
  await pool.query("UPDATE site_quote_request SET acked_at = now() WHERE quote_ref = $1", [q.receipt_ref]);
  await assert.rejects(pool.query("UPDATE site_quote_request SET acked_at = now() - interval '1 day' WHERE quote_ref = $1", [q.receipt_ref]), /posé une fois/);
});

test("une commande garde sa transition de statut RECEIVED -> PENDING_REVIEW, et rien d'autre", async () => {
  const o = await newOrder("0001");
  await pool.query("UPDATE site_order SET status = 'PENDING_REVIEW' WHERE order_ref = $1", [o.receipt_ref]);
  await assert.rejects(pool.query("UPDATE site_order SET status = 'RECEIVED' WHERE order_ref = $1", [o.receipt_ref]), /RECEIVED -> PENDING_REVIEW/);
  await assert.rejects(pool.query("UPDATE site_order SET payment = '{}'::jsonb WHERE order_ref = $1", [o.receipt_ref]), /figé/);
});

test("l'outbox : contenu figé hors effacement d'un v2 ; une mise de côté est finale", async () => {
  const m = await newMessage("0001");
  await assert.rejects(pool.query("UPDATE site_outbox_event SET payload = '{}'::jsonb WHERE object_ref = $1", [m.receipt_ref]), /immuable/);
  await assert.rejects(pool.query("UPDATE site_outbox_event SET erased_at = now() WHERE object_ref = $1", [m.receipt_ref]), /erased_v2/);
  await assert.rejects(pool.query("DELETE FROM site_outbox_event WHERE object_ref = $1", [m.receipt_ref]), /suppression refusée/);
});

// --- porte signée (§5) --------------------------------------------------------------------------------------------------------------

function signedHeaders(keyId, scope, path, body, { issuedAt = new Date(), nonce = randomBytes(16).toString("hex"), keyring = KEYRING } = {}) {
  const at = issuedAt.toISOString().replace(/\.\d{3}Z$/, "Z");
  const signature = keys.signRoute(keyring, keyId, scope, { method: "POST", path, body_sha256: sha(body), issued_at_utc: at, nonce });
  const h = new Map([["x-c0-key-id", keyId], ["x-c0-issued-at", at], ["x-c0-nonce", nonce], ["x-c0-request-signature", signature]]);
  return { get: (name) => h.get(name) ?? null };
}
const check = (headers, scope, path, body, now = new Date()) => gate.checkRouteRequest(KEYRING, pool, headers, scope, "POST", path, body, now);

test("porte : la bonne clé passe une fois ; un rejeu, une autre portée, une clé retirée, un horodatage hors fenêtre sont refusés", async () => {
  const body = enc({ object_ref: "QR-inconnu" });
  const path = "/api/site/requests/erase";
  const headers = signedHeaders("essai-effacer", "site_requests.erase", path, body);
  assert.equal(await check(headers, "site_requests.erase", path, body), null);
  assert.equal(await check(headers, "site_requests.erase", path, body), "REQUEST_REPLAYED");
  assert.equal(await check(signedHeaders("essai-etat", "site_requests.mail_status", path, body), "site_requests.erase", path, body), "KEY_OUT_OF_SCOPE", "une clé d'une autre portée n'efface pas");
  assert.equal(await check(signedHeaders("essai-effacer", "site_requests.erase", path, body), "site_requests.erase", path, enc({ object_ref: "autre" })), "SIGNATURE_WRONG", "corps changé");
  assert.equal(await check(signedHeaders("essai-effacer", "site_requests.erase", "/api/site/requests/document", body), "site_requests.erase", path, body), "SIGNATURE_WRONG", "chemin changé");
  assert.equal(await check(signedHeaders("essai-effacer", "site_requests.erase", path, body, { issuedAt: new Date(Date.now() - 301_000) }), "site_requests.erase", path, body), "REQUEST_STALE");
  assert.throws(() => signedHeaders("essai-retiree", "site_requests.erase", path, body), /ne signe pas/);
  assert.equal(await check({ get: () => null }, "site_requests.erase", path, body), "KEY_OUT_OF_SCOPE");
});

test("porte : le domaine est propre à la route (une signature d'effacement ne vaut pas un dépôt, même secret)", async () => {
  const same = keys.parseRouteKeyring(enc({ keys: [
    { key_id: "k", scope: "site_requests.erase", status: "ACTIVE", secret_utf8: secret("s") },
    { key_id: "k2", scope: "site_requests.documents", status: "ACTIVE", secret_utf8: secret("s") },
  ] }));
  const body = enc({ object_ref: "x" });
  const h = signedHeaders("k", "site_requests.erase", "/p", body, { keyring: same });
  const asDocument = { get: (n) => (n === "x-c0-key-id" ? "k2" : h.get(n)) };
  assert.equal(await gate.checkRouteRequest(same, pool, asDocument, "site_requests.documents", "POST", "/p", body, new Date()), "SIGNATURE_WRONG");
});

test("HTTPS : refusé hors boucle locale, accepté en boucle locale ou derrière un frontal HTTPS", () => {
  const none = { get: () => null };
  assert.equal(gate.transportSecure("http://site.example/api/site/requests/erase", none), false);
  assert.equal(gate.transportSecure("https://site.example/api/site/requests/erase", none), true);
  assert.equal(gate.transportSecure("http://site.example/x", { get: (n) => (n === "x-forwarded-proto" ? "https" : null) }), true);
  assert.equal(gate.transportSecure("http://127.0.0.1:3000/x", none), true);
  assert.equal(gate.transportSecure("http://localhost:3000/x", none), true);
});

test("trousseau : forme exacte, portées des routes seulement, secret d'au moins 32 octets, identifiants uniques", () => {
  const entry = { key_id: "a", scope: "site_requests.erase", status: "ACTIVE", secret_utf8: secret("x") };
  for (const bad of [{ keys: [{ ...entry, scope: "site_events.read" }] }, { keys: [{ ...entry, secret_utf8: "court" }] }, { keys: [entry, entry] }, { keys: [{ ...entry, secret: "x" }] }, { other: [] }]) {
    assert.throws(() => keys.parseRouteKeyring(enc(bad)), /trousseau|key_id/);
  }
  assert.throws(() => keys.loadRouteKeyring({}), /SITE_REQUESTS_KEYRING_PATH/);
});

// --- gestes (§5.1 à §5.4) -------------------------------------------------------------------------------------------------------------

test("D07 : l'effacement retire coordonnées, adresses, références, PDF, octets de l'événement et accusé ; numéro, lignes et montants restent ; idempotent", async () => {
  const o = await newOrder("0002");
  const deposit = await answer(routes.depositDocument, { object_ref: o.receipt_ref, kind: "bon_de_commande", sha256: sha(pdf), pdf_base64: pdf.toString("base64") });
  assert.equal(deposit.status, 200);
  const before = (await pool.query("SELECT number, amounts FROM site_order WHERE order_ref = $1", [o.receipt_ref])).rows[0];
  const first = await answer(routes.eraseRequest, { object_ref: o.receipt_ref });
  assert.equal(first.status, 200);
  const row = (await pool.query("SELECT number, amounts, contact, addresses, customer_refs, document_pdf, coordinates_erased_at FROM site_order WHERE order_ref = $1", [o.receipt_ref])).rows[0];
  assert.deepEqual([row.number, row.amounts], [before.number, before.amounts]);
  assert.deepEqual([row.contact, row.addresses, row.customer_refs, row.document_pdf], [{}, null, null, null]);
  assert.ok(row.coordinates_erased_at);
  const ev = await eventOf(o.receipt_ref);
  assert.deepEqual([ev.size, ev.erased_at !== null], [2, true]);
  const lines = (await pool.query("SELECT count(*)::int AS n FROM site_order_line l JOIN site_order o ON o.id = l.order_id WHERE o.order_ref = $1", [o.receipt_ref])).rows[0].n;
  assert.ok(lines >= 1);
  const again = await answer(routes.eraseRequest, { object_ref: o.receipt_ref });
  assert.deepEqual([again.status, again.body.erased_at], [200, first.body.erased_at]);
  const late = await answer(routes.depositDocument, { object_ref: o.receipt_ref, kind: "bon_de_commande", sha256: sha(pdf), pdf_base64: pdf.toString("base64") });
  assert.deepEqual([late.status, late.body.error_codes], [409, ["ERASED"]], "un PDF porte des coordonnées : jamais redéposé après effacement");
  const unknown = await answer(routes.eraseRequest, { object_ref: "QR-inconnu" });
  assert.deepEqual([unknown.status, unknown.body.error_codes], [404, ["NOT_FOUND"]]);
  assert.equal((await answer(routes.eraseRequest, { object_ref: o.receipt_ref, extra: 1 })).status, 400);
});

test("un événement effacé avant son acquittement n'est plus servi au poll", async () => {
  const m = await newMessage("0002");
  await answer(routes.eraseRequest, { object_ref: m.receipt_ref });
  const { rows } = await pool.query("SELECT event_id FROM site_outbox_event WHERE status IN ('PENDING', 'DELIVERED_TO_POLL') AND erased_at IS NULL AND object_ref = $1", [m.receipt_ref]);
  assert.equal(rows.length, 0);
  const row = (await pool.query("SELECT contact, message FROM site_message WHERE message_ref = $1", [m.receipt_ref])).rows[0];
  assert.deepEqual([row.contact, row.message], [{}, null]);
});

test("PDF : bon type, empreinte juste, un PDF ; remplacé par un autre, rejoué à l'identique", async () => {
  const q = await newQuote("0002");
  const body = (over = {}) => ({ object_ref: q.receipt_ref, kind: "demande_de_devis", sha256: sha(pdf), pdf_base64: pdf.toString("base64"), ...over });
  assert.deepEqual((await answer(routes.depositDocument, body({ sha256: sha(Buffer.from("autre")) }))).body.error_codes, ["INTEGRITY_MISMATCH"]);
  assert.equal((await answer(routes.depositDocument, body({ kind: "bon_de_commande" }))).status, 400);
  assert.equal((await answer(routes.depositDocument, body({ pdf_base64: Buffer.from("pas un pdf").toString("base64"), sha256: sha(Buffer.from("pas un pdf")) }))).status, 400);
  assert.equal((await answer(routes.depositDocument, body({ object_ref: "QR-inconnu" }))).status, 404);
  const ok = await answer(routes.depositDocument, body());
  assert.equal(ok.status, 200);
  const replay = await answer(routes.depositDocument, body());
  assert.equal(replay.body.deposited_at, ok.body.deposited_at, "même PDF : même instant de dépôt");
  const other = Buffer.from("%PDF-1.4\n% seconde version\n");
  assert.equal((await answer(routes.depositDocument, body({ sha256: sha(other), pdf_base64: other.toString("base64") }))).status, 200);
  const stored = (await pool.query("SELECT document_sha256 FROM site_quote_request WHERE quote_ref = $1", [q.receipt_ref])).rows[0];
  assert.equal(stored.document_sha256, sha(other));
  const m = await newMessage("0003");
  assert.equal((await answer(routes.depositDocument, body({ object_ref: m.receipt_ref }))).status, 404, "une demande libre n'a pas de PDF");
});

test("P06 : mise de côté, visible sur la demande, plus servie ; idempotente ; la suivante passe ; un événement acquitté ne se met pas de côté", async () => {
  const q1 = await newQuote("0003");
  const q2 = await newQuote("0004");
  const e1 = await eventOf(q1.receipt_ref);
  const first = await answer(routes.setAsideEvent, { event_id: e1.event_id, code: "EVENT_PAYLOAD_INVALID" });
  assert.equal(first.status, 200);
  const again = await answer(routes.setAsideEvent, { event_id: e1.event_id, code: "AUTRE_CODE" });
  assert.equal(again.body.set_aside_at, first.body.set_aside_at);
  const after1 = await eventOf(q1.receipt_ref);
  assert.deepEqual([after1.status, after1.set_aside_code], ["SET_ASIDE", "EVENT_PAYLOAD_INVALID"]);
  assert.ok((await pool.query("SELECT set_aside_at FROM site_quote_request WHERE quote_ref = $1", [q1.receipt_ref])).rows[0].set_aside_at);
  const served = (await pool.query("SELECT object_ref FROM site_outbox_event WHERE status IN ('PENDING', 'DELIVERED_TO_POLL') AND erased_at IS NULL")).rows.map((r) => r.object_ref);
  assert.ok(!served.includes(q1.receipt_ref) && served.includes(q2.receipt_ref));
  assert.equal((await answer(routes.setAsideEvent, { event_id: "EVT-inconnu", code: "X" })).status, 404);
  assert.equal((await answer(routes.setAsideEvent, { event_id: e1.event_id, code: "minuscule" })).status, 400);
  const e2 = await eventOf(q2.receipt_ref);
  await pool.query("UPDATE site_outbox_event SET status = 'DELIVERED_TO_POLL', delivered_at = now() WHERE event_id = $1", [e2.event_id]);
  await pool.query("UPDATE site_outbox_event SET status = 'ACKED', acked_at = now() WHERE event_id = $1", [e2.event_id]);
  assert.deepEqual((await answer(routes.setAsideEvent, { event_id: e2.event_id, code: "X" })).body.error_codes, ["ALREADY_ACKED"]);
});

test("état de l'accusé : sans aucune coordonnée, une référence inconnue absente, corps borné", async () => {
  const q = await newQuote("0005");
  const r = await answer(routes.mailStatus, { object_refs: [q.receipt_ref, "QR-inconnu"] });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.items, [{ object_ref: q.receipt_ref, number: q.number, state: "garde", attempts: 0, last_attempt_at_utc: null, next_attempt_at_utc: null }]);
  const recipient = (await pool.query("SELECT recipient FROM site_ack_mail WHERE object_ref = $1", [q.receipt_ref])).rows[0].recipient;
  assert.ok(recipient.includes("@") && !JSON.stringify(r.body).includes(recipient), "jamais le destinataire");
  for (const bad of [{ object_refs: [] }, { object_refs: ["a", "a"] }, { object_refs: Array.from({ length: 501 }, (_, i) => `r${i}`) }, { refs: ["a"] }]) {
    assert.equal((await answer(routes.mailStatus, bad)).status, 400);
  }
});

// --- acquittement et conservation (P01, P02, D05, D06) ---------------------------------------------------------------------------------

test("P02, D05, D06 : l'acquittement pose acked_at ; trente jours après, la demande est effacée ; jamais acquittée, rien n'est effacé", async () => {
  const acked = await newQuote("0006");
  const never = await newQuote("0007");
  const e = await eventOf(acked.receipt_ref);
  await pool.query("UPDATE site_outbox_event SET status = 'DELIVERED_TO_POLL', delivered_at = now() WHERE event_id = $1", [e.event_id]);
  await pool.query("UPDATE site_outbox_event SET status = 'ACKED', acked_at = now() - interval '31 days' WHERE event_id = $1", [e.event_id]);
  await pool.query("UPDATE site_quote_request SET created_at = created_at WHERE quote_ref = $1", [never.receipt_ref]);
  const erased = await events.markRequestsAcked(pool, [e.event_id], 30);
  assert.equal(erased, 1);
  const a = (await pool.query("SELECT acked_at, coordinates_erased_at, contact, number FROM site_quote_request WHERE quote_ref = $1", [acked.receipt_ref])).rows[0];
  assert.ok(a.acked_at && a.coordinates_erased_at);
  assert.deepEqual([a.contact, a.number], [{}, acked.number]);
  const n = (await pool.query("SELECT acked_at, coordinates_erased_at FROM site_quote_request WHERE quote_ref = $1", [never.receipt_ref])).rows[0];
  assert.deepEqual([n.acked_at, n.coordinates_erased_at], [null, null]);
  assert.equal(await events.markRequestsAcked(pool, [e.event_id], 30), 0, "déjà effacée : rien de plus");
});

test("acquittée hier : acked_at posé, rien d'effacé avant trente jours", async () => {
  const q = await newQuote("0008");
  const e = await eventOf(q.receipt_ref);
  await pool.query("UPDATE site_outbox_event SET status = 'DELIVERED_TO_POLL', delivered_at = now() WHERE event_id = $1", [e.event_id]);
  await pool.query("UPDATE site_outbox_event SET status = 'ACKED', acked_at = now() - interval '1 day' WHERE event_id = $1", [e.event_id]);
  assert.equal(await events.markRequestsAcked(pool, [e.event_id], 30), 0);
  const row = (await pool.query("SELECT acked_at, coordinates_erased_at FROM site_quote_request WHERE quote_ref = $1", [q.receipt_ref])).rows[0];
  assert.ok(row.acked_at);
  assert.equal(row.coordinates_erased_at, null);
  await assert.rejects(pool.query("SELECT site_purge_acknowledged_requests(interval '1 hour')"), /au moins un jour/);
});

test("conservation : aucun état de la file de l'accusé ne bloque l'effacement ; un accusé encore « à envoyer » ne part plus jamais", async () => {
  const states = ["garde", "a_envoyer", "envoye", "refuse", "sans_reponse"];
  const quotes = [];
  for (const [i, state] of states.entries()) {
    const q = await newQuote(`01${i}`);
    quotes.push(q);
    if (state !== "garde") {
      // Préparation du jeu d'essai : en mode smtp (non livré), ces états viennent de la file. Une vraie demande ne peut aujourd'hui fabriquer
      // qu'un accusé « gardé » (état final) : l'état est posé ici directement, garde de la table suspendue le temps de cette seule préparation.
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("ALTER TABLE site_ack_mail DISABLE TRIGGER site_ack_mail_guard");
        await client.query(
          `UPDATE site_ack_mail SET mode = 'smtp', state = $2, next_attempt_at = CASE WHEN $2 = 'a_envoyer' THEN now() ELSE NULL END,
                  sent_at = CASE WHEN $2 = 'envoye' THEN now() ELSE NULL END WHERE object_ref = $1`,
          [q.receipt_ref, state],
        );
        await client.query("ALTER TABLE site_ack_mail ENABLE TRIGGER site_ack_mail_guard");
        await client.query("COMMIT");
      } finally {
        client.release();
      }
    }
    assert.equal((await pool.query("SELECT state FROM site_ack_mail WHERE object_ref = $1", [q.receipt_ref])).rows[0].state, state);
    const e = await eventOf(q.receipt_ref);
    await pool.query("UPDATE site_outbox_event SET status = 'DELIVERED_TO_POLL', delivered_at = now() WHERE event_id = $1", [e.event_id]);
    await pool.query("UPDATE site_outbox_event SET status = 'ACKED', acked_at = now() - interval '31 days' WHERE event_id = $1", [e.event_id]);
    await events.markRequestsAcked(pool, [e.event_id], 30);
  }
  for (const [i, q] of quotes.entries()) {
    const row = (await pool.query("SELECT coordinates_erased_at FROM site_quote_request WHERE quote_ref = $1", [q.receipt_ref])).rows[0];
    const mail = (await pool.query("SELECT state, recipient, subject, body, erased_at, next_attempt_at FROM site_ack_mail WHERE object_ref = $1", [q.receipt_ref])).rows[0];
    assert.ok(row.coordinates_erased_at, states[i]);
    assert.deepEqual([mail.recipient, mail.subject, mail.body, mail.next_attempt_at], [null, null, null, null], states[i]);
    assert.ok(mail.erased_at, states[i]);
    assert.equal(mail.state, states[i] === "a_envoyer" ? "sans_reponse" : states[i], states[i]);
  }
});
