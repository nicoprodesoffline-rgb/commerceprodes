// Cercle 5, ligne 5.17 (décision B2 ; docs/site_events_v2.md §7) — l'accusé au client, sur PostgreSQL réel : mode « gardés » seul actif et AUCUNE
// connexion sortante, textes de la boutique, un envoi par demande, tentatives à 1, 5, 30 minutes puis toutes les heures pendant 48 h (T03, T04),
// adresse refusée (T05), aucune coordonnée dans les journaux (P05). Le transport réel n'est pas livré : les envois sont simulés. Valeurs inventées.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import dns from "node:dns";
import net from "node:net";
import tls from "node:tls";
import { createRequire } from "node:module";
import { join } from "node:path";
import { ROOT, activate, businessCase, enc, newPool, resetDb } from "./helpers.mjs";

const requireBuild = createRequire(import.meta.url);
const build = (rel) => requireBuild(join(ROOT, ".bc4-build", rel));
const requests = build("lib/site-requests/submit.js");
const commerce = build("lib/site-commerce/document.js");
const ack = build("lib/site-ack-mail/ack.js");
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
    payment: { cheque: { label: "Chèque", instructions: "Texte d'attente chèque." }, virement: { label: "Virement", instructions: "Texte d'attente virement." }, mandat_administratif: { label: "Mandat administratif", instructions: "Texte d'attente : mandat administratif." } },
    privacy_notice: { version: "m1", text: "Texte d'attente." }, cgv_version: "c1",
    acknowledgement: {
      quote: { subject: "Texte d'attente : devis {numero}", body: "Texte d'attente.\n{recapitulatif}\nVotre reçu : {lien_recu}" },
      order: { subject: "Texte d'attente : commande {numero}", body: "{recapitulatif}\n{lien_recu}" },
      message: { subject: "Texte d'attente : demande {numero}", body: "{recapitulatif}\n{lien_recu}" },
    },
    sender: null,
  };
  const doc = { ...d, payload_sha256: commerce.documentDigest(d) };
  await pool.query("INSERT INTO site_commerce_active (singleton, commerce_sequence, publication_id, payload_sha256, document_bytes, ack_bytes) VALUES (1, $1, $2, $3, $4, $5)",
    [doc.commerce_sequence, doc.publication_id, doc.payload_sha256, Buffer.from(canonicalBytes(doc)), Buffer.from("{}")]);
});
after(async () => { await pool.end(); });

const address = { name: "Mairie de Val-Fictif", line1: "12 rue de l'Exemple-Fictif", line2: "", postal_code: "00000", city: "Val-Fictif" };
async function send(kind, body) {
  const r = await requests.submitRequest({ pool, now: () => NOW }, kind, enc(body));
  const parsed = JSON.parse(Buffer.from(r.body).toString("utf8"));
  assert.equal(r.status, 200, JSON.stringify(parsed).slice(0, 300));
  return parsed;
}
const fromCase = (name, key) => ({ ...JSON.parse(Buffer.from(businessCase(name).bytes).toString("utf8")), idempotency_key: key });
const newQuote = (n) => send("quote_request", { request: fromCase("F_QUOTE_ORDER.quote_priced", `quote:c5a:${n}`), extras: { commerce_sequence: 1, privacy_notice: "m1" } });
const newOrder = (n) => send("order", { request: fromCase("F_QUOTE_ORDER.order_valid", `order:c5a:${n}`), extras: { commerce_sequence: 1, privacy_notice: "m1", total_ttc: "150.90", addresses: { delivery: address, billing: null }, customer_refs: { siret: "", order_number: "ENG-0001", service_code: "SVC-A" }, payment_method: "mandat_administratif", terms: { accepted: true, cgv_version: "c1" } } });
/** File en mode smtp (non livré) : rangée sur une référence à part, avec la vraie charge de l'événement de la demande. */
async function enqueueSmtp(created, eventType) {
  const { rows: [e] } = await pool.query("SELECT payload FROM site_outbox_event WHERE object_ref = $1", [created.receipt_ref]);
  const objectRef = `${created.receipt_ref}-smtp`;
  assert.equal(await ack.enqueueAcknowledgement(pool, { eventType, objectRef, payload: e.payload, accessToken: created.access_token }, "smtp"), "a_envoyer");
  return objectRef;
}
const emailOf = async (ref) => (await pool.query("SELECT payload FROM site_outbox_event WHERE object_ref = $1", [ref])).rows[0].payload.contact.email;
const mail = async (ref) => (await pool.query("SELECT * FROM site_ack_mail WHERE object_ref = $1", [ref])).rows[0];

/** Compte toute tentative de connexion réseau (TCP, TLS, DNS) pendant `fn`. */
async function noNetwork(fn) {
  const calls = [];
  const saved = { connect: net.Socket.prototype.connect, tlsConnect: tls.connect, lookup: dns.lookup, promiseLookup: dns.promises.lookup };
  net.Socket.prototype.connect = function (...args) { calls.push(["tcp", typeof args[0] === "object" ? args[0]?.port ?? args[0]?.path : args[0]]); return saved.connect.apply(this, args); };
  tls.connect = (...args) => { calls.push(["tls"]); return saved.tlsConnect(...args); };
  dns.lookup = (...args) => { calls.push(["dns", args[0]]); return saved.lookup(...args); };
  dns.promises.lookup = (...args) => { calls.push(["dns", args[0]]); return saved.promiseLookup(...args); };
  try {
    await fn();
  } finally {
    Object.assign(net.Socket.prototype, { connect: saved.connect });
    tls.connect = saved.tlsConnect;
    dns.lookup = saved.lookup;
    dns.promises.lookup = saved.promiseLookup;
  }
  // Le seul trafic admis est celui de la base de test (socket local de PostgreSQL), jamais un service d'envoi.
  return calls.filter(([kind, target]) => !(kind === "tcp" && (target === 54318 || String(target).includes(".s.PGSQL"))));
}

test("bout en bout : la demande fabrique son accusé « gardé » dans sa transaction, sans AUCUNE connexion sortante ; son état se lit par la route 5.4", async () => {
  let q;
  let transportCalls = 0;
  const outgoing = await noNetwork(async () => {
    q = await newQuote("0001");
    const drained = await ack.drainAcknowledgements(pool, { send: async () => { transportCalls += 1; return { outcome: "sent" }; } });
    assert.deepEqual(drained, { sent: 0, refused: 0, retried: 0, abandoned: 0 });
  });
  assert.deepEqual(outgoing, []);
  assert.equal(transportCalls, 0);
  const m = await mail(q.receipt_ref);
  assert.deepEqual([m.mode, m.state, m.recipient, m.number, m.attempts], ["garde", "garde", await emailOf(q.receipt_ref), q.number, 0]);
  assert.equal(m.subject, `Texte d'attente : devis ${q.number}`);
  assert.match(m.body, /Total HT : .+ ; TVA : .+ ; Total TTC : .+/);
  assert.ok(m.body.includes(`/recu#ref=${q.receipt_ref}&code=${encodeURIComponent(q.access_token)}`), "lien privé : référence et code dans le fragment");
  assert.ok(!/[?&]code=/.test(m.body.split("#")[0]), "jamais le code avant le fragment");
  const status = await routes.mailStatus(pool, enc({ object_refs: [q.receipt_ref] }));
  assert.deepEqual(status.body.items, [{ object_ref: q.receipt_ref, number: q.number, state: "garde", attempts: 0, last_attempt_at_utc: null, next_attempt_at_utc: null }]);
});

test("un envoi par demande : un second rangement de la même demande ne fabrique rien ; demande libre comprise", async () => {
  const q = await newQuote("0002");
  const { rows: [e] } = await pool.query("SELECT payload FROM site_outbox_event WHERE object_ref = $1", [q.receipt_ref]);
  assert.equal(await ack.enqueueAcknowledgement(pool, { eventType: "quote.requested", objectRef: q.receipt_ref, payload: e.payload, accessToken: q.access_token }), null);
  const msg = await send("message", { extras: { idempotency_key: "message:c5a:0001", commerce_sequence: 1, privacy_notice: "m1", contact: { organisation: "", name: "Camille Exemple", email: "camille@val-fictif.example", phone: "" }, message: "Une question d'essai.", product: null } });
  assert.equal((await mail(msg.receipt_ref)).state, "garde");
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM site_ack_mail WHERE object_ref = $1", [q.receipt_ref])).rows[0].n, 1);
});

test("commande : récapitulatif avec lignes, livraison, totaux et marche à suivre du règlement au moment de la commande", async () => {
  const o = await newOrder("0001");
  const m = await mail(o.receipt_ref);
  assert.match(m.body, /^- \d+ × .+ : .+ HT$/m);
  assert.match(m.body, /Livraison : .+ — .+ HT/);
  assert.ok(m.body.includes("Marche à suivre pour le règlement :\nTexte d'attente : mandat administratif."));
});

test("mode : absent ou « garde » -> gardés ; « smtp » refuse de démarrer (non livré) ; autre valeur refusée", () => {
  assert.equal(ack.ackMailMode({}), "garde");
  assert.equal(ack.ackMailMode({ SITE_ACK_MAIL_MODE: "garde" }), "garde");
  assert.throws(() => ack.ackMailMode({ SITE_ACK_MAIL_MODE: "smtp" }), /pas livré/);
  assert.throws(() => ack.ackMailMode({ SITE_ACK_MAIL_MODE: "envoyer" }), /absente ou « garde »/);
});

test("réglages SMTP du serveur : lus des variables, validés, mot de passe par fichier seulement", () => {
  assert.equal(ack.smtpSettings({}), null);
  assert.deepEqual(ack.smtpSettings({ SITE_SMTP_HOST: "smtp.exemple.invalid" }), { host: "smtp.exemple.invalid", port: 587, security: "starttls", user: null, passwordFile: null });
  assert.deepEqual(ack.smtpSettings({ SITE_SMTP_HOST: "smtp.exemple.invalid", SITE_SMTP_PORT: "465", SITE_SMTP_SECURITY: "tls", SITE_SMTP_USER: "u", SITE_SMTP_PASSWORD_FILE: "/chemin/hors-git" }).security, "tls");
  for (const env of [{ SITE_SMTP_HOST: "a b" }, { SITE_SMTP_HOST: "h", SITE_SMTP_PORT: "0" }, { SITE_SMTP_HOST: "h", SITE_SMTP_SECURITY: "ssl" }, { SITE_SMTP_HOST: "h", SITE_SMTP_USER: "u" }]) {
    assert.throws(() => ack.smtpSettings(env), /SITE_SMTP/);
  }
});

test("T03 : service en panne -> tentatives à 1, 5, 30 minutes puis toutes les heures ; au-delà de 48 h, « sans réponse »", async () => {
  const ref = await enqueueSmtp(await newQuote("0003"), "quote.requested");
  await pool.query("UPDATE site_ack_mail SET next_attempt_at = $2 WHERE object_ref = $1", [ref, "2026-10-20T09:00:00Z"]);
  const down = { send: async () => ({ outcome: "failed", code: "SERVICE_DOWN" }) };
  const t0 = Date.parse("2026-10-20T09:00:00Z");
  const delays = [];
  let at = t0;
  for (let i = 0; i < 60; i += 1) {
    await ack.drainAcknowledgements(pool, down, new Date(at));
    const m = await mail(ref);
    if (m.state !== "a_envoyer") break;
    delays.push((m.next_attempt_at.getTime() - at) / 60_000);
    at = m.next_attempt_at.getTime();
  }
  assert.deepEqual(delays.slice(0, 4), [1, 5, 30, 60]);
  assert.ok(delays.slice(3).every((d) => d === 60));
  const m = await mail(ref);
  assert.equal(m.state, "sans_reponse");
  assert.ok(m.last_attempt_at.getTime() - t0 <= 48 * 3600_000);
  assert.equal(m.last_error, "SERVICE_DOWN");
});

test("T04 : service rétabli -> l'accusé part une seule fois, même avec deux tours concurrents", async () => {
  const ref = await enqueueSmtp(await newQuote("0004"), "quote.requested");
  let sends = 0;
  const slowUp = { send: async () => { sends += 1; await new Promise((r) => setTimeout(r, 50)); return { outcome: "sent" }; } };
  const now = new Date(Date.now() + 1000);
  await Promise.all([ack.drainAcknowledgements(pool, slowUp, now), ack.drainAcknowledgements(pool, slowUp, now)]);
  await ack.drainAcknowledgements(pool, slowUp, new Date(now.getTime() + 3600_000));
  assert.equal(sends, 1);
  const m = await mail(ref);
  assert.deepEqual([m.state, m.attempts], ["envoye", 1]);
  assert.ok(m.sent_at);
});

test("T05 : adresse refusée par le service -> « refusé », plus de tentative", async () => {
  const ref = await enqueueSmtp(await newQuote("0005"), "quote.requested");
  await ack.drainAcknowledgements(pool, { send: async () => ({ outcome: "refused", code: "RECIPIENT_REFUSED" }) }, new Date(Date.now() + 1000));
  const m = await mail(ref);
  assert.deepEqual([m.state, m.next_attempt_at, m.last_error], ["refuse", null, "RECIPIENT_REFUSED"]);
});

test("P05 : ni le journal de la base ni la sortie du processus ne contiennent l'adresse du client", async () => {
  const q = await newQuote("0006");
  const lines = [];
  const saved = { log: console.log, warn: console.warn, error: console.error };
  for (const k of ["log", "warn", "error"]) console[k] = (...args) => lines.push(args.join(" "));
  try {
    await enqueueSmtp(q, "quote.requested");
    await ack.drainAcknowledgements(pool, { send: async () => ({ outcome: "failed", code: "SERVICE_DOWN" }) }, new Date(Date.now() + 1000));
  } finally {
    Object.assign(console, saved);
  }
  const log = (await pool.query("SELECT operation, outcome, error_codes, object_ref, detail FROM site_transaction_log")).rows;
  assert.ok(log.some((r) => r.operation === "ACK_MAIL"));
  const email = await emailOf(q.receipt_ref);
  assert.ok(email.includes("@"));
  assert.ok(!JSON.stringify(log).includes(email));
  assert.ok(!lines.join("\n").includes(email));
});

test("montants en euros à la française", () => {
  assert.equal(ack.euros("1234.50"), "1 234,50 €");
  assert.equal(ack.euros("0.00"), "0,00 €");
});
