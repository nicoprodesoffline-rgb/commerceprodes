// site_events.v1: outbox events read by the Factory poller. Twin of c0/python/c0_contracts/events.py.

import * as f from "./formats";
import { isKey } from "./identity";
import { Json, JsonObject, MalformedPayload, digest, hasDuplicateLines, isCanonical, isObject, parseBytes } from "./jsonc";
import * as signing from "./signing";
import { Verdict, rejected, verdict } from "./errors";

export const CONTRACT_VERSION = "site_events.v1";
export const MAX_BYTES = 256 * 1024;
export const DOMAIN_PAYLOAD = "prodes.c0.site_events.payload.v1";
const EVENT_TYPES = ["quote.requested", "order.received"];
const ENVELOPE_KEYS = [
  "contract_version", "event_id", "event_type", "event_version", "created_at_utc", "object_ref",
  "idempotency_key", "catalogue_sequence", "payload", "payload_digest",
];
const QUOTE_PAYLOAD_KEYS = ["quote_ref", "lines"];
const QUOTE_LINE_KEYS = ["public_item_key", "variant_axes", "quantity", "rate_id", "unit_amount"];
const ORDER_PAYLOAD_KEYS = ["order_ref", "status", "lines", "total_amount", "currency"];
const ORDER_LINE_KEYS = ["public_item_key", "variant_axes", "quantity", "rate_id", "unit_amount", "currency", "tax_basis_or_status", "line_total"];
const ORDER_STATUSES = ["RECEIVED", "PENDING_REVIEW"];
export const CONSUMED_KEYS = ["event_id", "idempotency_key", "event_type", "payload_digest"];
const POLL_KEYS = ["credential_key_id", "cursor", "limit"];
const MAX_LINES = 200;
const MAX_POLL_LIMIT = 500;

class Bad extends Error {}

function need(condition: boolean): void {
  if (!condition) throw new Bad();
}

export function payloadDigest(payload: Json): string {
  return digest(DOMAIN_PAYLOAD, payload);
}

function axesOk(value: Json | undefined): boolean {
  return isObject(value) && Object.keys(value).every((key) => f.matches(f.AXIS_KEY, key) && f.isText(value[key], 100));
}

function money(value: Json | undefined): bigint {
  const cents = f.moneyCents(value);
  need(cents !== null && cents > 0n);
  return cents as bigint;
}

function shapeEnvelope(event: JsonObject): void {
  need(f.exactKeys(event, ENVELOPE_KEYS));
  need(f.isToken(event["event_id"]) && f.isToken(event["object_ref"]));
  need(typeof event["event_type"] === "string" && f.isToken(event["event_type"]));
  need(f.isInt(event["event_version"])); // any integer; !== 1 -> SCHEMA_UNSUPPORTED (review R-06)
  need(f.isUtc(event["created_at_utc"]));
  need(f.matches(f.IDEMPOTENCY_KEY, event["idempotency_key"]));
  need(event["catalogue_sequence"] === null || f.isCount(event["catalogue_sequence"], 1));
  need(isObject(event["payload"]) && f.isHex64(event["payload_digest"]));
}

function lines(value: Json | undefined, keys: string[]): JsonObject[] {
  need(Array.isArray(value) && value.length >= 1 && value.length <= MAX_LINES);
  for (const line of value as Json[]) {
    need(f.exactKeys(line, keys));
    const l = line as JsonObject;
    need(isKey(l["public_item_key"], "item") && axesOk(l["variant_axes"]));
    need(f.isCount(l["quantity"], 1, 1000000));
  }
  return value as JsonObject[];
}

function shapeQuoteRequested(event: JsonObject): void {
  const payload = event["payload"] as JsonObject;
  need(f.exactKeys(payload, QUOTE_PAYLOAD_KEYS) && payload["quote_ref"] === event["object_ref"]);
  let priced = false;
  for (const line of lines(payload["lines"], QUOTE_LINE_KEYS)) {
    if (line["rate_id"] === null) {
      need(line["unit_amount"] === null);
    } else {
      need(f.isToken(line["rate_id"]));
      money(line["unit_amount"]);
      priced = true;
    }
  }
  need(priced ? event["catalogue_sequence"] !== null : true);
}

function shapeOrderReceived(event: JsonObject): void {
  const payload = event["payload"] as JsonObject;
  need(f.exactKeys(payload, ORDER_PAYLOAD_KEYS) && payload["order_ref"] === event["object_ref"]);
  need(typeof payload["status"] === "string" && ORDER_STATUSES.includes(payload["status"]) && payload["currency"] === "EUR");
  need(event["catalogue_sequence"] !== null);
  let total = 0n;
  for (const line of lines(payload["lines"], ORDER_LINE_KEYS)) {
    need(f.isToken(line["rate_id"]) && line["currency"] === "EUR");
    need(line["tax_basis_or_status"] === "HT" || line["tax_basis_or_status"] === "UNQUALIFIED");
    const lineTotal = money(line["line_total"]);
    need(lineTotal === money(line["unit_amount"]) * BigInt(line["quantity"] as number));
    total += lineTotal;
  }
  need(total === money(payload["total_amount"]));
}

const PAYLOAD_SHAPES: Readonly<Record<string, (event: JsonObject) => void>> = {
  "quote.requested": shapeQuoteRequested,
  "order.received": shapeOrderReceived,
};

export type EventResult = Verdict & { record: JsonObject | null };

export function validateEvent(eventBytes: Uint8Array, consumed: Json): EventResult {
  if (!Array.isArray(consumed) || !consumed.every((entry) => f.exactKeys(entry, CONSUMED_KEYS))) {
    throw new Error("consumed input is invalid (fixture error, not a verdict)");
  }
  const stop = (codes: string[]): EventResult => ({ ...rejected(codes), record: null });
  let event: Json;
  try {
    event = parseBytes(eventBytes, MAX_BYTES);
  } catch (error) {
    if (error instanceof MalformedPayload) return stop(["PAYLOAD_MALFORMED"]);
    throw error;
  }
  if (!isCanonical(eventBytes, event)) return stop(["INTEGRITY_MISMATCH"]);
  if (!isObject(event)) return stop(["EVENT_PAYLOAD_INVALID"]);
  if (event["contract_version"] !== CONTRACT_VERSION) return stop(["SCHEMA_UNSUPPORTED"]);
  try {
    shapeEnvelope(event);
  } catch (error) {
    if (error instanceof Bad) return stop(["EVENT_PAYLOAD_INVALID"]);
    throw error;
  }
  const eventType = event["event_type"] as string;
  if (!EVENT_TYPES.includes(eventType)) return stop(["EVENT_TYPE_UNKNOWN"]);
  if (event["event_version"] !== 1) return stop(["SCHEMA_UNSUPPORTED"]);
  try {
    (PAYLOAD_SHAPES[eventType] as (event: JsonObject) => void)(event);
  } catch (error) {
    if (error instanceof Bad) return stop(["EVENT_PAYLOAD_INVALID"]);
    throw error;
  }
  if (hasDuplicateLines((event["payload"] as JsonObject)["lines"] as JsonObject[])) return stop(["DUPLICATE_LINE"]);
  if (payloadDigest(event["payload"] as Json) !== event["payload_digest"]) return stop(["INTEGRITY_MISMATCH"]);
  const record: JsonObject = {};
  for (const key of CONSUMED_KEYS) record[key] = event[key] as Json;
  for (const entry of consumed as JsonObject[]) {
    const sameKey = entry["idempotency_key"] === event["idempotency_key"];
    const sameId = entry["event_id"] === event["event_id"];
    if (sameKey || sameId) {
      if (sameKey && entry["event_type"] === event["event_type"] && entry["payload_digest"] === event["payload_digest"]) {
        return { ...verdict(true, "DUPLICATE_NOOP", ["EVENT_DUPLICATE_NOOP"]), record: entry };
      }
      return stop(["EVENT_IDEMPOTENCY_CONFLICT"]);
    }
  }
  return { ...verdict(true, "APPLY"), record };
}

export function validatePollRequest(request: Json, keyring: Json, issuedCursors: Json): Verdict {
  if (!Array.isArray(issuedCursors)) throw new Error("issued cursors input is invalid (fixture error, not a verdict)");
  if (!f.exactKeys(request, POLL_KEYS)) return rejected(["CURSOR_INVALID"]);
  if (!signing.keyHasScope(keyring, request["credential_key_id"], signing.SCOPE_EVENTS_READ)) return rejected(["EVENT_UNAUTHORIZED"]);
  if (!f.isCount(request["limit"], 1, MAX_POLL_LIMIT)) return rejected(["CURSOR_INVALID"]);
  if (request["cursor"] !== null && !issuedCursors.includes(request["cursor"] as Json)) return rejected(["CURSOR_INVALID"]);
  return verdict(true, "AUTHORIZED");
}
