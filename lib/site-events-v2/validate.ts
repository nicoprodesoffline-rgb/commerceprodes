/**
 * Cercle 5, ligne 5.1 : le validateur `site_events.v2` du site (docs/contracts/site_events_v2.md §2, §3 de la Factory), jumeau de
 * `integrations/site_events_v2.py`. À côté du C0 v1 (gelé, jamais touché) : mêmes clés d'enveloppe, même lecture stricte, mêmes octets
 * canoniques ; ses propres formes de payload et son domaine d'empreinte. Fonctions pures, ni base ni réseau, et rien n'est journalisé :
 * aucune coordonnée ne peut atteindre un journal (P05).
 *
 * Le jeu d'essai commun (`docs/site_events_v2/`, recopié à l'octet) est joué tel quel ici et dans la Factory : même verdict sur chaque cas.
 * Les totaux ne sont vérifiés que dans leur FORME (`amount_format`) : la Factory les recalcule à la réception.
 */
import { AXIS_KEY, IDEMPOTENCY_KEY, exactKeys, isCount, isHex64, isInt, isText, isToken, isUtc, matches, moneyCents } from "../../c0/ts/src/formats";
import { isKey } from "../../c0/ts/src/identity";
import { MalformedPayload, digest, hasDuplicateLines, isCanonical, isObject, parseBytes, type Json, type JsonObject } from "../../c0/ts/src/jsonc";
import { rejected, verdict, type Verdict } from "../../c0/ts/src/errors";

export const CONTRACT_VERSION = "site_events.v2";
export const MAX_BYTES = 256 * 1024;
export const DOMAIN_PAYLOAD = "prodes.site_events.v2.payload";
export const EVENT_TYPES = ["quote.requested", "order.received", "message.received"] as const;
export type EventTypeV2 = (typeof EVENT_TYPES)[number];
const PREFIX: Record<EventTypeV2, string> = { "quote.requested": "DEV", "order.received": "CMD", "message.received": "MSG" };
const ENVELOPE_KEYS = ["contract_version", "event_id", "event_type", "event_version", "created_at_utc", "object_ref", "idempotency_key", "catalogue_sequence", "payload", "payload_digest"];
export const CONSUMED_KEYS = ["event_id", "idempotency_key", "event_type", "payload_digest"] as const;
const MAX_LINES = 200;
const NUMBER = /^(?:(DEV|CMD|MSG)-[0-9]{4}-[0-9]{6})$/;
const SIRET = /^(?:[0-9]{14})$/;
const PAYMENT_METHODS = ["cheque", "virement", "mandat_administratif"];
const DELIVERY_OPTIONS = ["incluse", "rendez_vous"];
const LINE_KEYS = ["public_item_key", "variant_axes", "item_label", "quantity", "rate_id", "unit_amount_ht", "line_total_ht", "line_tva", "lot"];
const LINE_AMOUNTS = ["unit_amount_ht", "line_total_ht", "line_tva"];
const COMMON_KEYS = ["number", "contact", "message", "privacy_notice"];
const QUOTE_KEYS = [...COMMON_KEYS, "lines", "delivery", "amounts"];
const ORDER_KEYS = [...QUOTE_KEYS, "status", "addresses", "customer_refs", "payment", "terms"];
const MESSAGE_KEYS = [...COMMON_KEYS, "product"];
const CONTACT_KEYS = ["organisation", "name", "email", "phone"];
const ADDRESS_KEYS = ["name", "line1", "line2", "postal_code", "city", "country"];
const REFS_KEYS = ["siret", "order_number", "service_code"];
const AMOUNTS_KEYS = ["currency", "tax_rate", "total_ht", "total_tva", "total_ttc", "excludes_quote_lines"];
const DELIVERY_KEYS = ["option", "label", "amount_ht", "amount_tva"];

export type ConsumedEntry = { event_id: string; idempotency_key: string; event_type: string; payload_digest: string };
export type V2Verdict = Verdict & { record: ConsumedEntry | null; detail: { rules: string[] } };

/** La valeur d'une clé, ou `null` si elle est absente (le `dict.get` du jumeau Python). */
const at = (value: JsonObject, key: string): Json => (Object.prototype.hasOwnProperty.call(value, key) ? (value[key] as Json) : null);
const optText = (value: Json, maximum: number, multiline = false): boolean => value === null || isText(value, maximum, multiline);
const codePoints = (text: string): number => Array.from(text).length;

export function payloadDigest(payload: Json): string {
  return digest(DOMAIN_PAYLOAD, payload);
}

function emailOk(value: Json): boolean {
  if (!isText(value, 254) || codePoints(value) < 3 || value.split("@").length !== 2 || value.includes(" ")) return false;
  const [local, domain] = value.split("@") as [string, string];
  return local.length > 0 && domain.includes(".") && !domain.startsWith(".") && !domain.endsWith(".") && !domain.includes("..");
}

/** Les règles nommées qui échouent ; `keys` vérifie l'ensemble exact des clés d'un objet (une clé inconnue est sa propre règle). */
class Rules {
  readonly failed = new Set<string>();

  check(rule: string, condition: boolean): boolean {
    if (!condition) this.failed.add(rule);
    return condition;
  }

  keys(value: Json, required: readonly string[], missingRule = "payload_shape"): value is JsonObject {
    if (!isObject(value)) {
      this.failed.add(missingRule);
      return false;
    }
    const present = Object.keys(value);
    const extra = present.some((key) => !required.includes(key));
    const missing = required.some((key) => !present.includes(key));
    if (extra) this.failed.add("unknown_key");
    if (missing) this.failed.add(missingRule);
    return !extra && !missing;
  }

  money(value: Json): boolean {
    return this.check("amount_format", moneyCents(value) !== null);
  }
}

function checkCommon(rules: Rules, payload: JsonObject, eventType: EventTypeV2): void {
  const number = at(payload, "number");
  if (rules.check("number_format", matches(NUMBER, number))) rules.check("number_prefix", (number as string).startsWith(`${PREFIX[eventType]}-`));
  const contact = at(payload, "contact");
  if (rules.keys(contact, CONTACT_KEYS, "contact_required")) {
    rules.check("contact_required", optText(contact["organisation"] as Json, 200) && isText(contact["name"], 120) && optText(contact["phone"] as Json, 40));
    rules.check("contact_email", emailOk(contact["email"] as Json));
  }
  rules.check("message_length", optText(at(payload, "message"), 5000, true));
  rules.check("privacy_notice_required", isText(at(payload, "privacy_notice"), 40));
}

function checkLines(rules: Rules, payload: JsonObject, order: boolean): void {
  const lines = at(payload, "lines");
  if (!rules.check("lines_required", Array.isArray(lines) && lines.length >= 1 && lines.length <= MAX_LINES)) return;
  for (const line of lines as Json[]) {
    if (!rules.keys(line, LINE_KEYS, "line_shape")) continue;
    const axes = line["variant_axes"] as Json;
    rules.check("line_shape", isKey(line["public_item_key"], "item") && isObject(axes)
      && Object.entries(axes).every(([key, item]) => matches(AXIS_KEY, key) && isText(item, 100))
      && isText(line["item_label"], 200) && isCount(line["quantity"], 1, 1_000_000));
    const lot = line["lot"] as Json;
    rules.check("line_shape", lot === null || (exactKeys(lot, ["bought", "free"]) && isCount(lot["bought"], 1) && isCount(lot["free"], 1)));
    if (line["rate_id"] === null) {
      rules.check("line_shape", LINE_AMOUNTS.every((key) => line[key] === null));
      if (order) rules.failed.add("quote_line_in_order");
    } else {
      rules.check("line_shape", isToken(line["rate_id"]));
      for (const key of LINE_AMOUNTS) rules.money(line[key] as Json);
    }
  }
}

function checkDeliveryAndAmounts(rules: Rules, payload: JsonObject): void {
  const delivery = at(payload, "delivery");
  const amounts = at(payload, "amounts");
  if (rules.keys(delivery, DELIVERY_KEYS, "delivery_shape")) {
    rules.check("delivery_shape", typeof delivery["option"] === "string" && DELIVERY_OPTIONS.includes(delivery["option"]) && isText(delivery["label"], 200));
    rules.money(delivery["amount_ht"] as Json);
    rules.money(delivery["amount_tva"] as Json);
  }
  if (rules.keys(amounts, AMOUNTS_KEYS, "amounts_shape")) {
    rules.check("amounts_shape", amounts["currency"] === "EUR" && typeof amounts["excludes_quote_lines"] === "boolean");
    for (const key of ["tax_rate", "total_ht", "total_tva", "total_ttc"]) rules.money(amounts[key] as Json);
  }
}

function checkAddress(rules: Rules, address: Json, optional = false): void {
  if (address === null && optional) return;
  if (!rules.keys(address, ADDRESS_KEYS, "address_required")) return;
  rules.check("address_required", isText(address["name"], 120) && isText(address["line1"], 200) && optText(address["line2"] as Json, 200)
    && isText(address["postal_code"], 10) && isText(address["city"], 100) && address["country"] === "FR");
}

function checkOrder(rules: Rules, payload: JsonObject): void {
  rules.check("order_status", at(payload, "status") === "RECEIVED");
  const addresses = at(payload, "addresses");
  if (rules.keys(addresses, ["delivery", "billing"], "address_required")) {
    checkAddress(rules, addresses["delivery"] as Json);
    checkAddress(rules, addresses["billing"] as Json, true);
  }
  const refs = at(payload, "customer_refs");
  if (rules.keys(refs, REFS_KEYS, "customer_refs_shape")) {
    rules.check("siret_format", refs["siret"] === null || matches(SIRET, refs["siret"]));
    rules.check("customer_refs_shape", optText(refs["order_number"] as Json, 60) && optText(refs["service_code"] as Json, 60));
  }
  const payment = at(payload, "payment");
  if (rules.keys(payment, ["method", "instructions"], "payment_method")) {
    rules.check("payment_method", typeof payment["method"] === "string" && PAYMENT_METHODS.includes(payment["method"]));
    rules.check("payment_method", isText(payment["instructions"], 2000, true));
  }
  const terms = at(payload, "terms");
  rules.check("terms_required", isObject(terms) && exactKeys(terms, ["cgv_version", "accepted"]) && isText(terms["cgv_version"], 40) && terms["accepted"] === true);
}

function checkMessage(rules: Rules, payload: JsonObject): void {
  rules.check("message_required", isText(at(payload, "message"), 5000, true));
  const product = at(payload, "product");
  if (product !== null && rules.keys(product, ["public_item_key", "label", "url"], "product_shape")) {
    const key = product["public_item_key"] as Json;
    const url = product["url"] as Json;
    rules.check("product_shape", (key === null || isKey(key, "item")) && isText(product["label"], 200)
      && typeof url === "string" && url.startsWith("/") && isText(url, 500));
  }
}

/** Les règles nommées qui échouent pour ce payload, triées (liste vide : bien formé). */
export function checkPayload(eventType: EventTypeV2, payload: Json): string[] {
  if (!isObject(payload)) return ["payload_shape"];
  const rules = new Rules();
  rules.keys(payload, { "quote.requested": QUOTE_KEYS, "order.received": ORDER_KEYS, "message.received": MESSAGE_KEYS }[eventType]);
  checkCommon(rules, payload, eventType);
  if (eventType === "message.received") {
    checkMessage(rules, payload);
  } else {
    checkLines(rules, payload, eventType === "order.received");
    checkDeliveryAndAmounts(rules, payload);
    if (eventType === "order.received") checkOrder(rules, payload);
  }
  return Array.from(rules.failed).sort();
}

function envelopeOk(event: JsonObject): boolean {
  return exactKeys(event, ENVELOPE_KEYS)
    && isToken(event["event_id"]) && isToken(event["object_ref"])
    && typeof event["event_type"] === "string" && isToken(event["event_type"])
    && isInt(event["event_version"])
    && isUtc(event["created_at_utc"])
    && matches(IDEMPOTENCY_KEY, event["idempotency_key"])
    && (event["catalogue_sequence"] === null || isCount(event["catalogue_sequence"], 1))
    && isObject(event["payload"]) && isHex64(event["payload_digest"])
    && event["idempotency_key"] === `${event["event_type"] as string}:${event["object_ref"] as string}`;
}

function consumedOk(consumed: unknown): consumed is ConsumedEntry[] {
  return Array.isArray(consumed) && consumed.every((entry) => exactKeys(entry, CONSUMED_KEYS));
}

function canonical(bytes: Uint8Array, value: Json): boolean {
  try {
    return isCanonical(bytes, value);
  } catch {
    return false;
  }
}

/**
 * Cet événement v2 relevé peut-il être appliqué (une fois), est-ce un rejeu, ou est-il refusé ? Même ordre que le v1 (`c0_site_v1.md` §11.2).
 * Un refus `EVENT_PAYLOAD_INVALID` porte `detail.rules`, les règles nommées qui ont échoué.
 */
export function validateEventV2(eventBytes: Uint8Array, consumed: unknown): V2Verdict {
  if (!consumedOk(consumed)) throw new TypeError("consumed invalide (erreur de jeu d'essai, pas un verdict)");
  const stop = (codes: string[], rules: string[] = []): V2Verdict => ({ ...rejected(codes), record: null, detail: { rules: [...rules].sort() } });
  let event: Json;
  try {
    event = parseBytes(eventBytes, MAX_BYTES);
  } catch (error) {
    if (error instanceof MalformedPayload) return stop(["PAYLOAD_MALFORMED"]);
    throw error;
  }
  if (!canonical(eventBytes, event)) return stop(["INTEGRITY_MISMATCH"]);
  if (!isObject(event)) return stop(["EVENT_PAYLOAD_INVALID"]);
  if (event["contract_version"] !== CONTRACT_VERSION) return stop(["SCHEMA_UNSUPPORTED"]);
  if (!envelopeOk(event)) return stop(["EVENT_PAYLOAD_INVALID"], ["envelope_shape"]);
  const eventType = event["event_type"] as string;
  if (!(EVENT_TYPES as readonly string[]).includes(eventType)) return stop(["EVENT_TYPE_UNKNOWN"]);
  if (event["event_version"] !== 1) return stop(["SCHEMA_UNSUPPORTED"]);
  const type = eventType as EventTypeV2;
  const payload = event["payload"] as JsonObject;
  const failed = checkPayload(type, payload);
  if (failed.length > 0) return stop(["EVENT_PAYLOAD_INVALID"], failed);
  if (type !== "message.received" && hasDuplicateLines(payload["lines"] as JsonObject[])) return stop(["DUPLICATE_LINE"]);
  if (payloadDigest(payload) !== event["payload_digest"]) return stop(["INTEGRITY_MISMATCH"]);
  const record: ConsumedEntry = {
    event_id: event["event_id"] as string,
    idempotency_key: event["idempotency_key"] as string,
    event_type: type,
    payload_digest: event["payload_digest"] as string,
  };
  for (const entry of consumed) {
    const sameKey = entry.idempotency_key === record.idempotency_key;
    const sameId = entry.event_id === record.event_id;
    if (sameKey || sameId) {
      if (sameKey && entry.event_type === record.event_type && entry.payload_digest === record.payload_digest) {
        return { ...verdict(true, "DUPLICATE_NOOP", ["EVENT_DUPLICATE_NOOP"]), record: entry, detail: { rules: [] } };
      }
      return stop(["EVENT_IDEMPOTENCY_CONFLICT"]);
    }
  }
  return { ...verdict(true, "APPLY"), record, detail: { rules: [] } };
}
