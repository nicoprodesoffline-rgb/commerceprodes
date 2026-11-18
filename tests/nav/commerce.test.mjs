// Cercle 5, étape P5 : le document des réglages de vente `site_commerce.v1` (validateur, décision de séquence, accusé signé). Textes inventés.
import { test } from "node:test";
import assert from "node:assert/strict";
import { load } from "./load-ts.mjs";

const { validateCommerce, documentDigest, fillMarks } = load("lib/site-commerce/document.ts");
const { decideCommerce, verifyAck, DOMAIN_ACK } = load("lib/site-commerce/activation.ts");
const { canonicalBytes } = load("c0/ts/src/jsonc.ts");

const keyring = { keys: [{ key_id: "ack-1", scope: "activation_ack", status: "ACTIVE", secret_utf8: "a".repeat(40) }] };
const NOW = "2026-11-18T10:00:00Z";

const base = (over = {}) => {
  const doc = {
    contract_version: "site_commerce.v1",
    publication_id: "pub-0001",
    commerce_sequence: 1,
    generated_at_utc: "2026-11-18T09:00:00Z",
    tax_rate: "20.00",
    delivery_rendez_vous: { label: "Livraison sur rendez-vous", amount_ht: "20.00" },
    payment: {
      cheque: { label: "Chèque", instructions: "Texte d'attente : ordre et adresse du chèque." },
      virement: { label: "Virement", instructions: "Texte d'attente : coordonnées bancaires.\nSeconde ligne." },
      mandat_administratif: { label: "Mandat administratif", instructions: "Texte d'attente : envoyez le bon de commande signé." },
    },
    privacy_notice: { version: "m-2026-11", text: "Texte d'attente : mention d'information." },
    cgv_version: "cgv-2026-11",
    acknowledgement: {
      quote: { subject: "Votre demande {numero}", body: "Bonjour,\n{recapitulatif}\n{lien_recu}" },
      order: { subject: "Votre commande {numero}", body: "Merci.\n{recapitulatif}\n{lien_recu}" },
      message: { subject: "Votre message {numero}", body: "Nous vous répondons rapidement. {lien_recu}" },
    },
    sender: { name: "Boutique d'essai", address: "contact@boutique-essai.example" },
    ...over,
  };
  const { payload_sha256: _ignored, ...rest } = doc;
  return { ...doc, payload_sha256: documentDigest(rest) };
};
const bytesOf = (doc) => canonicalBytes(doc);
const rulesOf = (doc) => { const v = validateCommerce(bytesOf(doc)); return v.accepted ? [] : [v.error_codes[0], ...v.rules]; };
const sealed = (over) => { const d = base(over); const { payload_sha256: _x, ...rest } = d; return { ...rest, payload_sha256: documentDigest(rest) }; };

test("un document valide est accepté, avec ou sans expéditeur", () => {
  assert.equal(validateCommerce(bytesOf(base())).accepted, true);
  assert.equal(validateCommerce(bytesOf(sealed({ sender: null }))).accepted, true);
});

test("clé inconnue, clé absente : refusées", () => {
  assert.deepEqual(rulesOf({ ...base(), extra: 1 }), ["DOCUMENT_INVALID", "unknown_key"]);
  const { tax_rate: _t, ...without } = base();
  assert.deepEqual(rulesOf(without), ["DOCUMENT_INVALID", "missing_key:tax_rate"]);
  assert.deepEqual(rulesOf(sealed({ payment: { cheque: base().payment.cheque, virement: base().payment.virement } })), ["DOCUMENT_INVALID", "payment"]);
});

test("taux écrit en nombre ou mal formé : refusé", () => {
  for (const rate of [20, "20", "20.0", "120.00", "-1.00", "20,00", ""]) assert.deepEqual(rulesOf(sealed({ tax_rate: rate })), ["DOCUMENT_INVALID", "tax_rate_format"], String(rate));
  assert.equal(validateCommerce(bytesOf(sealed({ tax_rate: "5.50" }))).accepted, true);
  assert.equal(validateCommerce(bytesOf(sealed({ tax_rate: "0.00" }))).accepted, true);
});

test("marque inconnue dans un corps d'accusé : refusée ; les trois marques connues passent", () => {
  const ack = (body) => ({ quote: { subject: "S", body }, order: base().acknowledgement.order, message: base().acknowledgement.message });
  assert.deepEqual(rulesOf(sealed({ acknowledgement: ack("Bonjour {prenom}") })), ["DOCUMENT_INVALID", "acknowledgement.placeholder"]);
  assert.deepEqual(rulesOf(sealed({ acknowledgement: ack("{numero} {inconnue}") })), ["DOCUMENT_INVALID", "acknowledgement.placeholder"]);
  assert.equal(validateCommerce(bytesOf(sealed({ acknowledgement: ack("{numero} {recapitulatif} {lien_recu}") }))).accepted, true);
});

test("textes : NFC, bornes, contrôle, retour à la ligne seulement là où il est permis", () => {
  const folded = validateCommerce(bytesOf(sealed({ cgv_version: "e\u0301" })));
  assert.equal(folded.accepted && folded.document.cgv_version, "\u00e9", "la lecture du C0 met les textes en NFC avant toute règle");
  assert.deepEqual(rulesOf(sealed({ cgv_version: "x".repeat(41) })), ["DOCUMENT_INVALID", "cgv_version"]);
  assert.deepEqual(rulesOf(sealed({ delivery_rendez_vous: { label: "a\nb", amount_ht: "20.00" } })), ["DOCUMENT_INVALID", "delivery_rendez_vous.label"]);
  assert.deepEqual(rulesOf(sealed({ delivery_rendez_vous: { label: "L", amount_ht: "20" } })), ["DOCUMENT_INVALID", "delivery_rendez_vous.amount_ht"]);
  assert.deepEqual(rulesOf(sealed({ privacy_notice: { version: "v", text: "a\u0000b" } })), ["DOCUMENT_INVALID", "privacy_notice.text"]);
  assert.deepEqual(rulesOf(sealed({ sender: { name: "N", address: "pas-une-adresse" } })), ["DOCUMENT_INVALID", "sender.address"]);
  assert.deepEqual(rulesOf(sealed({ payment: { ...base().payment, cheque: { label: "C", instructions: "x".repeat(4001) } } })), ["DOCUMENT_INVALID", "payment.cheque.instructions"]);
});

test("empreinte fausse, octets non canoniques, mauvaise version, JSON illisible", () => {
  assert.deepEqual(rulesOf({ ...base(), payload_sha256: "0".repeat(64) }), ["INTEGRITY_MISMATCH", "payload_sha256"]);
  assert.deepEqual(rulesOf({ ...base(), cgv_version: "autre" }), ["INTEGRITY_MISMATCH", "payload_sha256"], "contenu changé, empreinte ancienne");
  const pretty = new TextEncoder().encode(JSON.stringify(base(), null, 1));
  assert.deepEqual(validateCommerce(pretty).error_codes, ["INTEGRITY_MISMATCH"]);
  assert.deepEqual(validateCommerce(bytesOf({ ...base(), contract_version: "site_commerce.v2" })).error_codes, ["SCHEMA_UNSUPPORTED"]);
  assert.deepEqual(validateCommerce(new TextEncoder().encode("{pas du json")).error_codes, ["PAYLOAD_MALFORMED"]);
  assert.deepEqual(validateCommerce(new Uint8Array(65 * 1024).fill(32)).error_codes, ["PAYLOAD_MALFORMED"], "plus de 64 Kio");
});

test("séquence : active, rejeu, collision, plus ancienne ; l'accusé est signé par la clé d'accusé", () => {
  const first = decideCommerce(bytesOf(base()), null, NOW, keyring, "ack-1");
  assert.equal(first.outcome, "ACTIVATED");
  assert.deepEqual(Object.keys(first.ack), ["contract_version", "commerce_sequence", "payload_sha256", "activated_at_utc", "signature"]);
  assert.equal(first.ack.activated_at_utc, NOW);
  assert.equal(verifyAck(first.ack, keyring, "ack-1", first.document), true);
  assert.equal(verifyAck({ ...first.ack, commerce_sequence: 2 }, keyring, "ack-1", first.document), false);
  assert.equal(verifyAck({ ...first.ack, signature: "0".repeat(64) }, keyring, "ack-1", first.document), false);
  assert.match(DOMAIN_ACK, /commerce_ack\.v1$/);
  const active = { document: first.document, ack: first.ack };
  const replay = decideCommerce(bytesOf(base()), active, "2026-11-18T11:00:00Z", keyring, "ack-1");
  assert.deepEqual([replay.outcome, replay.ack], ["REPLAY_ACK", first.ack], "le même accusé, pas un nouveau");
  const collision = decideCommerce(bytesOf(sealed({ commerce_sequence: 1, tax_rate: "5.50" })), active, NOW, keyring, "ack-1");
  assert.deepEqual([collision.outcome, collision.error_codes], ["REJECTED", ["SEQUENCE_COLLISION"]]);
  const next = decideCommerce(bytesOf(sealed({ commerce_sequence: 2, tax_rate: "5.50" })), active, NOW, keyring, "ack-1");
  assert.equal(next.outcome, "ACTIVATED");
  const older = decideCommerce(bytesOf(sealed({ commerce_sequence: 1 })), { document: next.document, ack: next.ack }, NOW, keyring, "ack-1");
  assert.deepEqual([older.outcome, older.error_codes], ["REJECTED", ["STALE_SEQUENCE"]], "séquence 1 alors que le site sert la 2");
});

test("marques de l'accusé remplacées par le site", () => {
  assert.equal(fillMarks("{numero} - {recapitulatif} - {lien_recu}", { numero: "DEV-2026-000001", recapitulatif: "R", lien_recu: "/recu?ref=x" }), "DEV-2026-000001 - R - /recu?ref=x");
});

// ---- Jeu d'essai commun de la Factory (c5/f-envois @5a8c4a07, recopié à l'octet) : les 11 cas joués TELS QUELS dans document.ts et activation.ts ----
import fs from "node:fs";
const caseDir = new URL("../../lib/site-commerce/fixtures/site_commerce_v1/", import.meta.url);
const cases = fs.readdirSync(caseDir).filter((f) => f.endsWith(".json")).sort().map((f) => JSON.parse(fs.readFileSync(new URL(f, caseDir), "utf8")));
// Règles nommées à plat chez la Factory ; plus fines chez le site (« missing_key:<clé> », « <bloc>.<champ> ») : on compare le préfixe avant « : ».
const flat = (rules) => [...new Set(rules.map((r) => r.split(":")[0]))].sort();

test("jeu d'essai commun : 11 cas présents", () => {
  assert.equal(cases.length, 11);
});

for (const c of cases) {
  test(`jeu d'essai commun : ${c.case_id}`, () => {
    const bytes = new TextEncoder().encode(c.document_text);
    const verdict = validateCommerce(bytes);
    if (c.activation === undefined) {
      assert.equal(verdict.accepted, c.expected.accepted, JSON.stringify(verdict));
      if (!verdict.accepted) {
        assert.deepEqual(verdict.error_codes, c.expected.error_codes);
        assert.deepEqual(flat(verdict.rules), flat(c.expected.rules), `règles du site : ${verdict.rules.join(", ")}`);
      }
      return;
    }
    // Cas de séquence : le document est valide ; l'état actif est celui du cas (séquence et empreinte seules), la décision est celle d'activation.ts.
    assert.equal(verdict.accepted, true);
    const active = { document: { commerce_sequence: c.active.commerce_sequence, payload_sha256: c.active.payload_sha256 }, ack: { sentinelle: true } };
    const d = decideCommerce(bytes, active, NOW, keyring, "ack-1");
    const outcome = { STALE_SEQUENCE: ["REJECTED", ["STALE_SEQUENCE"]], REPLAY: ["REPLAY_ACK", undefined], SEQUENCE_COLLISION: ["REJECTED", ["SEQUENCE_COLLISION"]] }[c.activation];
    assert.equal(d.outcome, outcome[0]);
    if (outcome[1]) assert.deepEqual(d.error_codes, outcome[1]);
    else assert.deepEqual(d.ack, { sentinelle: true }, "rejeu : l'accusé déjà donné, pas un nouveau");
  });
}
