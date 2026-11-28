import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import net from "node:net";
import tls from "node:tls";

const require = createRequire(import.meta.url);
const ack = require("../../.bc4-build/lib/site-ack-mail/ack.js");
const root = await fs.mkdtemp(join(tmpdir(), "prodes-ack-unit-"));
after(() => fs.rm(root, { recursive: true, force: true }));
const env = { SITE_ACK_MAIL_MODE: "fichier", SITE_ACK_MAIL_DIR: root };

test("B3 configuration : fichier, garde par défaut, attente entière 0…120 (15 par défaut)", () => {
  assert.equal(ack.ackMailMode(env), "fichier");
  assert.equal(ack.ackMailConfig({}).mode, "garde");
  assert.equal(ack.ackMailConfig(env).pdfWaitMinutes, 15);
  for (const n of ["0", "1", "120"]) assert.equal(ack.ackMailConfig({ ...env, SITE_ACK_PDF_WAIT_MINUTES: n }).pdfWaitMinutes, Number(n));
  for (const n of ["-1", "121", "1.5", "quinze", "", " 1"]) assert.throws(() => ack.ackMailConfig({ ...env, SITE_ACK_PDF_WAIT_MINUTES: n }), /SITE_ACK_PDF_WAIT_MINUTES/);
});

test("B3 démarrage refusé nommé : mode inconnu et dossier manquant ; instrumentation branchée", async () => {
  assert.throws(() => ack.ackMailMode({ SITE_ACK_MAIL_MODE: "erreur-exemple" }), /SITE_ACK_MAIL_MODE inconnu "erreur-exemple"/);
  assert.throws(() => ack.ackMailConfig({ SITE_ACK_MAIL_MODE: "fichier" }), /SITE_ACK_MAIL_DIR/);
  const logs = [], exits = [];
  assert.equal(ack.enforceAckMailStartup({ SITE_ACK_MAIL_MODE: "erreur-exemple" }, (s) => logs.push(s), (n) => exits.push(n)), false);
  assert.deepEqual(exits, [1]);
  assert.match(logs[0], /DÉMARRAGE REFUSÉ.*SITE_ACK_MAIL_MODE inconnu "erreur-exemple"/);
  assert.match(await fs.readFile(new URL("../../instrumentation.ts", import.meta.url), "utf8"), /enforceAckMailStartup/);
});

test("B3 dossier non public : chemins directs, normalisés et liens symboliques refusés", async () => {
  for (const dir of ["public/accuses", resolve("public/accuses"), resolve(".next/accuses"), join(root, "public", "accuses"), resolve("public/../public/accuses")]) {
    assert.throws(() => ack.ackMailConfig({ ...env, SITE_ACK_MAIL_DIR: dir }), /SITE_ACK_MAIL_DIR/);
  }
  await fs.mkdir(join(root, "public"));
  await fs.symlink(join(root, "public"), join(root, "alias"));
  assert.throws(() => ack.ackMailConfig({ ...env, SITE_ACK_MAIL_DIR: join(root, "alias", "accuses") }), /SITE_ACK_MAIL_DIR/);
});

const input = () => ({ directory: root, number: "DEV-2026-000001", createdAt: new Date("2026-11-28T10:00:00.123Z"), to: "client@exemple.invalid", from: { name: "Boutique Exemple", address: "site@exemple.invalid" }, replyTo: "devis@exemple.invalid", subject: "Demande é reçue", text: "Client Exemple\nBanc Exemple\n/recu#ref=QR-exemple&code=code-exemple\nBoutique Exemple", pdf: null });

// Lecture explicite de la structure MIME : CRLF, en-têtes, frontières et décodage base64 ; aucun analyseur MIME installé.
export function parseEml(raw) {
  assert.ok(!/(?<!\r)\n/.test(raw), "CRLF partout");
  const [head, ...tail] = raw.split("\r\n\r\n");
  const headers = Object.fromEntries(head.replace(/\r\n[ \t]+/g, " ").split("\r\n").map((s) => { const n = s.indexOf(":"); return [s.slice(0, n).toLowerCase(), s.slice(n + 1).trim()]; }));
  const body = tail.join("\r\n\r\n");
  let text, pdf = null;
  if (headers["content-type"].startsWith("multipart/mixed")) {
    const boundary = /boundary="([^"]+)"/.exec(headers["content-type"])[1];
    const parts = body.split(`--${boundary}`);
    assert.equal(parts.length, 4);
    assert.match(parts[3], /^--\r\n$/);
    text = Buffer.from(parts[1].split("\r\n\r\n")[1].replace(/\s/g, ""), "base64").toString("utf8");
    assert.match(parts[2], /Content-Type: application\/pdf/);
    assert.match(parts[2], /Content-Disposition: attachment; filename="[A-Z0-9-]+\.pdf"/);
    pdf = Buffer.from(parts[2].split("\r\n\r\n")[1].replace(/\s/g, ""), "base64");
  } else {
    assert.match(headers["content-type"], /^text\/plain; charset=utf-8$/);
    assert.equal(headers["content-transfer-encoding"], "base64");
    text = Buffer.from(body.replace(/\s/g, ""), "base64").toString("utf8");
  }
  return { headers, text, pdf };
}

test("B3 .eml RFC/MIME UTF-8, PDF octet à octet, sans socket ni import de transport", async () => {
  const saved = [net.Socket.prototype.connect, tls.connect];
  net.Socket.prototype.connect = tls.connect = () => { throw new Error("connexion interdite"); };
  try {
    const data = { ...input(), number: "CMD-2026-000002", pdf: Buffer.from("%PDF-1.4\n%%EOF\n") };
    const name = await ack.writeAcknowledgementFile(data);
    assert.match(name, /^CMD-2026-000002-20261128T100000123Z\.eml$/);
    const parsed = parseEml(await fs.readFile(join(root, name), "utf8"));
    assert.match(parsed.headers.from, /<site@exemple.invalid>$/);
    assert.equal(parsed.headers.to, data.to);
    assert.equal(parsed.headers["reply-to"], data.replyTo);
    assert.ok(!Number.isNaN(Date.parse(parsed.headers.date)));
    assert.match(parsed.headers["message-id"], /^<[^<>\s]+@exemple.invalid>$/);
    const subject = parsed.headers.subject.replace(/=\?UTF-8\?B\?([^?]+)\?=/gi, (_, b) => Buffer.from(b, "base64").toString("utf8"));
    assert.equal(subject, data.subject);
    assert.equal(parsed.text.replace(/\r\n/g, "\n"), data.text);
    assert.deepEqual(parsed.pdf, data.pdf);
    const files = await fs.readdir(new URL("../../lib/site-ack-mail/", import.meta.url));
    for (const file of files.filter((s) => s.endsWith(".ts"))) assert.doesNotMatch(await fs.readFile(new URL(`../../lib/site-ack-mail/${file}`, import.meta.url), "utf8"), /(?:from\s*|import\s*\()["'](?:node:)?(?:net|tls|nodemailer|https?|smtp)/);
  } finally { [net.Socket.prototype.connect, tls.connect] = saved; }
});

test("B3 écriture atomique : rien de partiel visible ; rejeu identique, renommage en échec nettoyé", async () => {
  const data = { ...input(), number: "DEV-2026-000003" };
  const rename = fs.rename;
  let renames = 0;
  fs.rename = async (from, to) => {
    renames++;
    assert.ok(!(await fs.readdir(root)).includes(to.split("/").at(-1)));
    parseEml(await fs.readFile(from, "utf8"));
    await rename(from, to);
  };
  let name;
  try { name = await ack.writeAcknowledgementFile(data); } finally { fs.rename = rename; }
  assert.equal(renames, 1);
  const before = await fs.readFile(join(root, name));
  assert.equal(await ack.writeAcknowledgementFile({ ...data, text: "ne remplace pas le fichier existant" }), name);
  assert.deepEqual(await fs.readFile(join(root, name)), before);
  fs.rename = async () => { throw new Error("renommage interrompu"); };
  try { await assert.rejects(ack.writeAcknowledgementFile({ ...data, number: "DEV-2026-000004" }), /renommage interrompu/); } finally { fs.rename = rename; }
  assert.ok(!(await fs.readdir(root)).some((s) => s.endsWith(".tmp") || s.startsWith("DEV-2026-000004")));
});
