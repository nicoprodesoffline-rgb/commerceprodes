import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import net from "node:net";
import tls from "node:tls";
import { ROOT, activate, businessCase, enc, newPool, resetDb } from "./helpers.mjs";

const require = createRequire(import.meta.url);
const build = (s) => require(join(ROOT, ".bc4-build", s));
const ack = build("lib/site-ack-mail/ack.js");
const requests = build("lib/site-requests/submit.js");
const routes = build("lib/site-requests-routes/handlers.js");
const commerce = build("lib/site-commerce/document.js");
const { canonicalBytes } = build("c0/ts/src/jsonc.js");
let pool, root;
const oldEnv = Object.fromEntries(["SITE_ACK_MAIL_MODE", "SITE_ACK_MAIL_DIR", "SITE_ACK_PDF_WAIT_MINUTES"].map((k) => [k, process.env[k]]));
before(async () => {
  root = await fs.mkdtemp(join(tmpdir(), "prodes-ack-db-"));
  await resetDb(); pool = newPool();
  await activate(pool, "F_SELL_WINDOWS.activate");
  const fixture = JSON.parse(await fs.readFile(join(ROOT, "lib/site-commerce/fixtures/site_commerce_v1/valid.json"), "utf8"));
  const doc = JSON.parse(fixture.document_text);
  doc.commerce_sequence = 1;
  doc.sender = { name: "Boutique Exemple", address: "site@exemple.invalid" };
  doc.payload_sha256 = commerce.documentDigest(doc);
  await pool.query("INSERT INTO site_commerce_active (singleton, commerce_sequence, publication_id, payload_sha256, document_bytes, ack_bytes) VALUES (1, $1, $2, $3, $4, $5)", [1, doc.publication_id, doc.payload_sha256, Buffer.from(canonicalBytes(doc)), Buffer.from("{}")]);
  process.env.SITE_ACK_MAIL_MODE = "fichier";
  process.env.SITE_ACK_MAIL_DIR = root;
  process.env.SITE_ACK_PDF_WAIT_MINUTES = "15";
});
after(async () => {
  for (const [k, v] of Object.entries(oldEnv)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  await pool?.end(); if (root) await fs.rm(root, { recursive: true, force: true });
});
const row = async (ref) => (await pool.query("SELECT * FROM site_ack_mail WHERE object_ref=$1", [ref])).rows[0];
async function quote(n) {
  const request = JSON.parse(Buffer.from(businessCase("F_QUOTE_ORDER.quote_priced").bytes));
  request.idempotency_key = `quote:b3:${n}`;
  request.contact = { contact_name: "Client Exemple", email: "client@exemple.invalid", organisation_name: "Banc Exemple", phone: null };
  const result = await requests.submitRequest({ pool, now: () => "2026-10-20T09:00:00Z" }, "quote_request", enc({ request, extras: { commerce_sequence: 1, privacy_notice: "attente-1" } }));
  assert.equal(result.status, 200, Buffer.from(result.body).toString());
  return JSON.parse(Buffer.from(result.body));
}
const pdf = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n");
async function deposit(ref) {
  const result = await routes.depositDocument(pool, enc({ object_ref: ref, kind: "demande_de_devis", sha256: createHash("sha256").update(pdf).digest("hex"), pdf_base64: pdf.toString("base64") }));
  assert.equal(result.status, 200);
}
const names = async (number) => (await fs.readdir(root)).filter((s) => s.startsWith(number) && s.endsWith(".eml"));
async function message(q) {
  const files = await names(q.number); assert.equal(files.length, 1);
  return fs.readFile(join(root, files[0]), "utf8");
}
function parts(raw) {
  const boundary = /boundary="([^"]+)"/.exec(raw)?.[1];
  if (!boundary) return { text: Buffer.from(raw.split("\r\n\r\n").slice(1).join("\r\n\r\n").replace(/\s/g, ""), "base64").toString(), pdf: null };
  const chunks = raw.split(`--${boundary}`);
  return { text: Buffer.from(chunks[1].split("\r\n\r\n")[1].replace(/\s/g, ""), "base64").toString(), pdf: Buffer.from(chunks[2].split("\r\n\r\n")[1].replace(/\s/g, ""), "base64") };
}
async function noMailNetwork(fn) {
  // Pool préchauffé : même PostgreSQL ne peut ouvrir de nouvelle connexion pendant le test.
  const clients = await Promise.all(Array.from({ length: 4 }, () => pool.connect()));
  clients.forEach((c) => c.release());
  const saved = [net.Socket.prototype.connect, tls.connect];
  let calls = 0;
  net.Socket.prototype.connect = tls.connect = () => { calls++; throw new Error("socket interdit"); };
  try { await fn(); assert.equal(calls, 0); } finally { [net.Socket.prototype.connect, tls.connect] = saved; }
}

test("B3 PDF à temps : attente persistée puis PDF identique et lien, deux tours concurrents, aucun socket", async () => {
  const q = await quote("pdf"); const m = await row(q.receipt_ref);
  assert.equal(m.mode, "fichier"); assert.equal(m.state, "a_envoyer");
  assert.equal(m.pdf_wait_until - m.created_at, 15 * 60_000);
  await noMailNetwork(async () => {
    assert.equal((await ack.drainFileAcknowledgements(pool)).written, 0);
    assert.deepEqual(await names(q.number), []);
    await deposit(q.receipt_ref);
    await Promise.all([ack.drainFileAcknowledgements(pool), ack.drainFileAcknowledgements(pool)]);
  });
  const raw = await message(q); const decoded = parts(raw);
  assert.deepEqual(decoded.pdf, pdf);
  assert.ok(decoded.text.includes(q.number)); assert.match(decoded.text, /Total HT/);
  assert.ok(decoded.text.includes(`/recu#ref=${q.receipt_ref}&code=${encodeURIComponent(q.access_token)}`));
  assert.doesNotMatch(raw, /Reply-To:/); // Contrat actuel sans boîte par type : omission, jamais d'adresse devinée.
  const final = await row(q.receipt_ref);
  assert.equal(final.state, "ecrit_fichier"); assert.equal(final.sent_at, null); assert.equal(final.attempts, 1);
  assert.equal(ack.ACK_STATE_LABELS[final.state], "écrit dans le fichier d'essai");
  const status = await routes.mailStatus(pool, enc({ object_refs: [q.receipt_ref] }));
  assert.equal(status.body.items[0].state, "ecrit_fichier");
});

test("B3 PDF en retard : échéance sans pièce jointe, dépôt tardif sans second fichier", async () => {
  const q = await quote("late"); const m = await row(q.receipt_ref);
  await ack.drainFileAcknowledgements(pool, new Date(m.pdf_wait_until.getTime() + 1));
  const raw = await message(q); assert.equal(parts(raw).pdf, null);
  await deposit(q.receipt_ref);
  await ack.drainFileAcknowledgements(pool, new Date(m.pdf_wait_until.getTime() + 60_000));
  assert.equal(await message(q), raw);
});

test("B3 attente zéro : fichier immédiat et lien seul, même si un PDF est présent avant le tour", async () => {
  process.env.SITE_ACK_PDF_WAIT_MINUTES = "0";
  try {
    const q = await quote("zero");
    await deposit(q.receipt_ref);
    await ack.drainFileAcknowledgements(pool);
    const m = await row(q.receipt_ref);
    assert.equal(m.pdf_wait_until.getTime(), m.created_at.getTime());
    assert.equal(parts(await message(q)).pdf, null);
  } finally { process.env.SITE_ACK_PDF_WAIT_MINUTES = "15"; }
});

test("B3 reprise après renommage avant COMMIT : fichier conservé, jamais réécrit", async () => {
  const q = await quote("recover"); const m = await row(q.receipt_ref);
  const name = await ack.writeAcknowledgementFile({ directory: root, number: m.number, createdAt: m.created_at, to: m.recipient, from: { name: "Boutique Exemple", address: "site@exemple.invalid" }, replyTo: null, subject: m.subject, text: m.body, pdf: null });
  const original = await fs.readFile(join(root, name));
  await deposit(q.receipt_ref);
  await ack.drainFileAcknowledgements(pool);
  assert.deepEqual(await fs.readFile(join(root, name)), original);
  assert.equal((await row(q.receipt_ref)).state, "ecrit_fichier");
});

test("B3 erreur disque : reprise existante, aucun envoye ni appel du transport SMTP", async () => {
  const q = await quote("disk"); const m = await row(q.receipt_ref);
  const rename = fs.rename; fs.rename = async () => { throw new Error("disque indisponible"); };
  try { assert.equal((await ack.drainFileAcknowledgements(pool, m.pdf_wait_until)).retried, 1); } finally { fs.rename = rename; }
  let calls = 0;
  await ack.drainAcknowledgements(pool, { send: async () => { calls++; throw new Error("interdit"); } }, new Date(m.pdf_wait_until.getTime() + 120_000));
  assert.equal(calls, 0);
  const failed = await row(q.receipt_ref);
  assert.equal(failed.state, "a_envoyer"); assert.equal(failed.last_error, "FILE_WRITE_FAILED");
  assert.equal(failed.next_attempt_at - m.pdf_wait_until, 60_000);
  await ack.drainFileAcknowledgements(pool, failed.next_attempt_at);
  assert.equal((await row(q.receipt_ref)).state, "ecrit_fichier");
});

test("B3 effacement avant écriture : aucun fichier, aucune reprise", async () => {
  const q = await quote("erase"); const m = await row(q.receipt_ref);
  assert.equal((await routes.eraseRequest(pool, enc({ object_ref: q.receipt_ref }))).status, 200);
  await ack.drainFileAcknowledgements(pool, m.pdf_wait_until);
  assert.deepEqual(await names(q.number), []);
  assert.equal((await row(q.receipt_ref)).state, "sans_reponse");
});
