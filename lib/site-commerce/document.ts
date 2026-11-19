/**
 * Cercle 5, ligne 5.21 : le document des réglages de vente `site_commerce.v1` (docs/site_commerce_v1.md, copie à l'octet de la Factory).
 * Lecture stricte (octets canoniques du C0, ensemble de clés exact, 64 Kio au plus), empreinte `digest("prodes.site_commerce.v1", document sans payload_sha256)`.
 * Module PUR : il décide si un document est acceptable ; il ne lit ni n'écrit rien (le stockage et la route sont à côté).
 */
import * as f from "../../c0/ts/src/formats";
import { MalformedPayload, digest, isCanonical, isObject, parseBytes, type Json, type JsonObject } from "../../c0/ts/src/jsonc";

export const CONTRACT_VERSION = "site_commerce.v1";
export const DOMAIN_PAYLOAD = "prodes.site_commerce.v1";
export const MAX_BYTES = 64 * 1024;

const TOP_KEYS = ["contract_version", "publication_id", "commerce_sequence", "generated_at_utc", "tax_rate", "delivery_rendez_vous", "payment", "privacy_notice", "cgv_version", "acknowledgement", "sender", "payload_sha256"];
const PAYMENT_MODES = ["cheque", "virement", "mandat_administratif"];
const ACK_KINDS = ["quote", "order", "message"];
const PLACEHOLDERS = ["{numero}", "{recapitulatif}", "{lien_recu}"];
const RATE = /^(?:0|[1-9][0-9]?)\.[0-9]{2}$/;
const MARK = /\{[^{}]*\}/g;
const CONTROL = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/;

export type CommerceDocument = {
  contract_version: typeof CONTRACT_VERSION;
  publication_id: string;
  commerce_sequence: number;
  generated_at_utc: string;
  tax_rate: string;
  delivery_rendez_vous: { label: string; amount_ht: string };
  payment: Record<"cheque" | "virement" | "mandat_administratif", { label: string; instructions: string }>;
  privacy_notice: { version: string; text: string };
  cgv_version: string;
  acknowledgement: Record<"quote" | "order" | "message", { subject: string; body: string }>;
  sender: { name: string; address: string } | null;
  payload_sha256: string;
};

export type CommerceVerdict =
  | { accepted: true; document: CommerceDocument }
  | { accepted: false; error_codes: string[]; rules: string[] };

const stop = (code: string, rules: string[] = []): CommerceVerdict => ({ accepted: false, error_codes: [code], rules });

/** L'empreinte du document : le document sans `payload_sha256`, dans le domaine du réglage de vente. */
export function documentDigest(doc: JsonObject): string {
  const preimage: JsonObject = {};
  for (const key of Object.keys(doc)) if (key !== "payload_sha256") preimage[key] = doc[key] as Json;
  return digest(DOMAIN_PAYLOAD, preimage);
}

/** Un texte NFC, non vide, sans caractère de contrôle (`\n` permis seulement si `multiline`), borné en points de code. */
function text(value: unknown, max: number, multiline = false): value is string {
  return typeof value === "string" && value === value.normalize("NFC") && f.isText(value, max, multiline) && !CONTROL.test(value);
}

export function validateCommerce(bytes: Uint8Array): CommerceVerdict {
  let parsed: Json;
  try {
    parsed = parseBytes(bytes, MAX_BYTES);
  } catch (error) {
    if (error instanceof MalformedPayload) return stop("PAYLOAD_MALFORMED");
    throw error;
  }
  if (!isObject(parsed)) return stop("PAYLOAD_MALFORMED");
  if (parsed["contract_version"] !== CONTRACT_VERSION) return stop("SCHEMA_UNSUPPORTED");
  if (!isCanonical(bytes, parsed)) return stop("INTEGRITY_MISMATCH", ["canonical"]);
  const doc = parsed;
  const rules: string[] = [];
  const bad = (rule: string) => { if (!rules.includes(rule)) rules.push(rule); };

  const keyset = Object.keys(doc);
  for (const key of TOP_KEYS) if (!keyset.includes(key)) bad(`missing_key:${key}`);
  for (const key of keyset) if (!TOP_KEYS.includes(key)) bad("unknown_key");
  if (rules.length > 0) return stop("DOCUMENT_INVALID", rules);

  if (!f.isToken(doc["publication_id"])) bad("publication_id");
  if (!f.isCount(doc["commerce_sequence"], 1)) bad("commerce_sequence");
  if (!f.isUtc(doc["generated_at_utc"])) bad("generated_at_utc");
  if (typeof doc["tax_rate"] !== "string" || !RATE.test(doc["tax_rate"])) bad("tax_rate_format");
  if (!text(doc["cgv_version"], 40)) bad("cgv_version");

  const exact = (value: unknown, keys: readonly string[], rule: string): value is JsonObject => {
    const ok = f.exactKeys(value, keys);
    if (!ok) bad(rule);
    return ok;
  };
  const rendezVous = doc["delivery_rendez_vous"];
  if (exact(rendezVous, ["label", "amount_ht"], "delivery_rendez_vous")) {
    if (!text(rendezVous["label"], 120)) bad("delivery_rendez_vous.label");
    if (f.moneyCents(rendezVous["amount_ht"]) === null) bad("delivery_rendez_vous.amount_ht");
  }
  const payment = doc["payment"];
  if (exact(payment, PAYMENT_MODES, "payment")) {
    for (const mode of PAYMENT_MODES) {
      const entry = payment[mode];
      if (!exact(entry, ["label", "instructions"], `payment.${mode}`)) continue;
      if (!text(entry["label"], 120)) bad(`payment.${mode}.label`);
      if (!text(entry["instructions"], 4000, true)) bad(`payment.${mode}.instructions`);
    }
  }
  const notice = doc["privacy_notice"];
  if (exact(notice, ["version", "text"], "privacy_notice")) {
    if (!text(notice["version"], 40)) bad("privacy_notice.version");
    if (!text(notice["text"], 4000, true)) bad("privacy_notice.text");
  }
  const acknowledgement = doc["acknowledgement"];
  if (exact(acknowledgement, ACK_KINDS, "acknowledgement")) {
    for (const kind of ACK_KINDS) {
      const entry = acknowledgement[kind];
      if (!exact(entry, ["subject", "body"], `acknowledgement.${kind}`)) continue;
      if (!text(entry["subject"], 200)) bad(`acknowledgement.${kind}.subject`);
      if (!text(entry["body"], 4000, true)) bad(`acknowledgement.${kind}.body`);
      else if ((entry["body"].match(MARK) ?? []).some((mark) => !PLACEHOLDERS.includes(mark))) bad("acknowledgement.placeholder");
    }
  }
  const sender = doc["sender"];
  if (sender !== null && exact(sender, ["name", "address"], "sender")) {
    if (!text(sender["name"], 120)) bad("sender.name");
    if (!text(sender["address"], 254) || !f.matches(f.EMAIL, sender["address"])) bad("sender.address");
  }
  if (!f.isHex64(doc["payload_sha256"])) bad("payload_sha256");
  if (rules.length > 0) return stop("DOCUMENT_INVALID", rules);
  if (doc["payload_sha256"] !== documentDigest(doc)) return stop("INTEGRITY_MISMATCH", ["payload_sha256"]);
  return { accepted: true, document: doc as unknown as CommerceDocument };
}

/** Le texte d'un accusé avec ses trois marques remplacées ; une marque sans valeur reste vide (jamais laissée entre accolades). */
export function fillMarks(body: string, values: { numero: string; recapitulatif: string; lien_recu: string }): string {
  return body.replace(/\{(numero|recapitulatif|lien_recu)\}/g, (_all, name: keyof typeof values) => values[name]);
}
