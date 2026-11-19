// Cercle 5, ligne 5.1 : le validateur site_events.v2 du site joue le jeu d'essai commun (docs/site_events_v2/, recopié à l'octet de la Factory), tel quel :
// même verdict que le validateur Python sur chaque cas. Valeurs inventées.
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { load } from "./load-ts.mjs";

const { validateEventV2, checkPayload, payloadDigest } = load("lib/site-events-v2/validate.ts");
const dir = path.resolve(import.meta.dirname, "../../docs/site_events_v2");
const names = fs.readdirSync(dir).filter((n) => n.endsWith(".json") && n !== "SOURCE.json").sort();
const read = (name) => JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));

test("le jeu d'essai est la copie à l'octet notée dans SOURCE.json", () => {
  const source = read("SOURCE.json");
  assert.deepEqual(Object.keys(source.sha256).sort(), names);
  for (const name of names) assert.equal(crypto.createHash("sha256").update(fs.readFileSync(path.join(dir, name))).digest("hex"), source.sha256[name], name);
});

test("chaque cas du jeu d'essai commun reçoit son verdict", () => {
  assert.ok(names.length >= 25);
  for (const name of names) {
    const c = read(name);
    const got = validateEventV2(new TextEncoder().encode(c.event_text), c.consumed);
    assert.deepEqual([got.accepted, got.outcome, got.error_codes, got.detail.rules], [c.expected.accepted, c.expected.outcome, c.expected.error_codes, c.expected.rules], `${c.case_id} — ${c.note}`);
  }
});

test("les cas du §8 du contrat sont tous là", () => {
  const wanted = ["quote_requested", "order_received", "message_received", "quote_with_quote_line", "order_with_lot", "order_rendez_vous", "order_amounts_differ",
    "replay_same_content", "same_key_other_content", "non_canonical_bytes", "digest_v1_domain", "unknown_key", "contact_missing", "email_without_at",
    "siret_13_digits", "payment_method_unknown", "terms_missing", "quote_line_in_order", "message_empty", "number_wrong_prefix", "amount_as_number",
    "order_duplicate_lines", "event_type_unknown", "v1_envelope_to_v2_validator"];
  assert.deepEqual(wanted.filter((w) => !names.includes(`${w}.json`)), []);
});

test("un APPLY renvoie l'enregistrement à retenir, un rejeu renvoie l'enregistrement connu", () => {
  const c = read("quote_requested.json");
  const bytes = new TextEncoder().encode(c.event_text);
  const first = validateEventV2(bytes, []);
  assert.equal(first.outcome, "APPLY");
  const again = validateEventV2(bytes, [first.record]);
  assert.deepEqual([again.outcome, again.error_codes, again.record], ["DUPLICATE_NOOP", ["EVENT_DUPLICATE_NOOP"], first.record]);
  assert.equal(first.record.payload_digest, payloadDigest(JSON.parse(c.event_text).payload));
});

test("un consumed mal formé est une erreur de jeu d'essai, pas un verdict", () => {
  assert.throws(() => validateEventV2(new Uint8Array([123, 125]), [{ event_id: "x" }]), TypeError);
});

test("règles de forme : une clé absente lue comme null, une clé inconnue est sa propre règle", () => {
  const payload = JSON.parse(read("message_received.json").event_text).payload;
  assert.deepEqual(checkPayload("message.received", payload), []);
  const { message, ...withoutMessage } = payload;
  assert.deepEqual(checkPayload("message.received", withoutMessage), ["message_required", "payload_shape"]);
  assert.deepEqual(checkPayload("message.received", { ...payload, extra: 1 }), ["unknown_key"]);
  assert.deepEqual(checkPayload("message.received", "x"), ["payload_shape"]);
});
