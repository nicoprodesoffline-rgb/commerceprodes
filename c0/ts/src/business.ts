// site_business.v1: price selection, quote request, order submit, receipt lookup.
// Twin of c0/python/c0_contracts/business.py. Amounts are BigInt cents internally, never Number.

import { createHash, timingSafeEqual } from "node:crypto";
import * as f from "./formats";
import { isKey } from "./identity";
import { Json, JsonObject, MalformedPayload, canonicalBytes, digest, hasDuplicateLines, isObject, parseBytes, utf8 } from "./jsonc";
import * as snap from "./snapshot";
import { Verdict, rejected, verdict } from "./errors";

export const CONTRACT_VERSION = "site_business.v1";
export const MAX_BYTES = 256 * 1024;
const MAX_LINES = 200;
export const DOMAIN_REQUEST = "prodes.c0.site_business.request.v1";
const GENERATION_STATUSES = ["ACTIVE", "UNSAFE"];
const CONTACT_KEYS = ["organisation_name", "contact_name", "email", "phone"];
const QUOTE_KEYS = ["contract_version", "kind", "idempotency_key", "catalogue_sequence", "contact", "lines", "message"];
const QUOTE_LINE_KEYS = ["public_item_key", "variant_axes", "quantity", "displayed"];
const DISPLAYED_KEYS = ["rate_id", "unit_amount"];
const ORDER_KEYS = ["contract_version", "kind", "idempotency_key", "catalogue_sequence", "contact", "lines", "total_amount", "currency"];
const ORDER_LINE_KEYS = ["public_item_key", "variant_axes", "quantity", "rate_id", "unit_amount", "line_total"];
const REGISTER_KEYS = ["kind", "idempotency_key", "request_fingerprint", "receipt_ref"];
const LOOKUP_KEYS = ["ref", "access_token"];
const RECORD_KEYS = ["ref", "access_token_sha256"];

class Bad extends Error {}

function need(condition: boolean): void {
  if (!condition) throw new Bad();
}

type Superseded = Record<string, string>;

// --- generation -----------------------------------------------------------------------------------

export class Generation {
  readonly doc: snap.Snapshot;
  readonly status: string;
  readonly sequence: number;
  readonly items = new Map<string, snap.SnapshotItem>();
  readonly registry = new Map<string, snap.RegistryEntry>();

  constructor(generation: Json) {
    if (!f.exactKeys(generation, ["snapshot", "status"]) || typeof generation["status"] !== "string" || !GENERATION_STATUSES.includes(generation["status"])) {
      throw new Error("generation input is invalid (fixture error, not a verdict)");
    }
    const doc = generation["snapshot"] as Json;
    if (!isObject(doc) || doc["contract_version"] !== snap.CONTRACT_VERSION || !snap.shapeOk(doc)) {
      throw new Error("generation snapshot is not a well-formed site_snapshot.v1");
    }
    this.doc = doc as unknown as snap.Snapshot;
    this.status = generation["status"];
    this.sequence = this.doc.catalogue_sequence;
    for (const item of snap.allItems(this.doc)) this.items.set(item.public_item_key, item);
    for (const entry of this.doc.identity_registry) this.registry.set(entry.public_item_key, entry);
  }
}

function axesOk(value: Json | undefined): value is JsonObject {
  return isObject(value) && Object.keys(value).every((key) => f.matches(f.AXIS_KEY, key) && f.isText(value[key], 100));
}

function sameAxes(a: JsonObject, b: Record<string, string>): boolean {
  const left = Object.keys(a);
  const right = Object.keys(b);
  return left.length === right.length && left.every((key) => Object.prototype.hasOwnProperty.call(b, key) && a[key] === b[key]);
}

function lookup(
  gen: Generation, key: string, axes: JsonObject, quantity: number, instant: string, superseded: Superseded,
): [string | null, snap.PriceWindow | null] {
  const entry = gen.registry.get(key);
  if (entry !== undefined) {
    if (entry.status === "SUPERSEDED") {
      superseded[key] = entry.superseded_by as string;
      return ["ITEM_SUPERSEDED", null];
    }
    return ["ITEM_RETIRED", null];
  }
  const item = gen.items.get(key);
  if (item === undefined) return ["ITEM_NOT_PUBLISHED", null];
  if (!sameAxes(axes, item.variant_axes)) return ["INVALID_VARIANT", null];
  const found = item.public_sell_price_windows.filter((window) => snap.windowCovers(window, instant, quantity));
  if (found.length === 0) return ["PRICE_WINDOW_UNAVAILABLE", null];
  if (found.length > 1) return ["PRICE_WINDOW_OVERLAP", null];
  return [null, found[0] as snap.PriceWindow];
}

export type SelectResult = Verdict & { selection: JsonObject | null; superseded_by: Superseded };

export function selectPrice(generation: Json, publicItemKey: Json, variantAxes: Json, quantity: Json, instantUtc: Json): SelectResult {
  const gen = new Generation(generation);
  const superseded: Superseded = {};
  const stop = (codes: string[]): SelectResult => ({ ...rejected(codes), selection: null, superseded_by: superseded });
  if (gen.status === "UNSAFE") return stop(["CATALOG_UNSAFE"]);
  if (!isKey(publicItemKey, "item") || !axesOk(variantAxes)) return stop(["INVALID_DATA"]);
  if (!f.isCount(quantity, 1, snap.MAX_QUANTITY) || !f.isUtc(instantUtc)) return stop(["INVALID_DATA"]);
  const [code, window] = lookup(gen, publicItemKey, variantAxes, quantity, instantUtc, superseded);
  if (code !== null || window === null) return stop([code as string]);
  const selection: JsonObject = {
    catalogue_sequence: gen.sequence,
    public_item_key: publicItemKey,
    variant_axes: variantAxes,
    quantity,
    instant_utc: instantUtc,
    rate_id: window.rate_id,
    unit_amount: window.unit_amount,
    currency: window.currency,
    tax_basis_or_status: window.tax_basis_or_status,
    offer_price_version_public: window.offer_price_version_public,
    valid_until_utc: window.valid_until_utc,
  };
  return { ...verdict(true, "SELECTED"), selection, superseded_by: superseded };
}

// --- requests --------------------------------------------------------------------------------------

function shapeContact(contact: Json | undefined): void {
  need(f.exactKeys(contact, CONTACT_KEYS));
  const c = contact as JsonObject;
  need(f.isText(c["organisation_name"], 200) && f.isText(c["contact_name"], 200));
  need(f.matches(f.EMAIL, c["email"]) && (c["email"] as string).length <= 254);
  need(c["phone"] === null || f.matches(f.PHONE, c["phone"]));
}

function shapeLines(lines: Json | undefined, keys: string[], extra: (line: JsonObject) => void): void {
  need(Array.isArray(lines) && lines.length >= 1 && lines.length <= MAX_LINES);
  for (const line of lines as Json[]) {
    need(f.exactKeys(line, keys));
    const l = line as JsonObject;
    need(isKey(l["public_item_key"], "item") && axesOk(l["variant_axes"]));
    need(f.isCount(l["quantity"], 1, snap.MAX_QUANTITY));
    extra(l);
  }
}

function positiveMoney(value: Json | undefined): boolean {
  const cents = f.moneyCents(value);
  return cents !== null && cents > 0n;
}

function shapeQuote(request: JsonObject): void {
  need(f.exactKeys(request, QUOTE_KEYS) && request["kind"] === "quote_request");
  need(f.matches(f.IDEMPOTENCY_KEY, request["idempotency_key"]));
  need(request["catalogue_sequence"] === null || f.isCount(request["catalogue_sequence"], 1));
  shapeContact(request["contact"]);
  need(request["message"] === null || f.isText(request["message"], 2000, true));
  shapeLines(request["lines"], QUOTE_LINE_KEYS, (line) => {
    const shown = line["displayed"];
    if (shown !== null) {
      need(f.exactKeys(shown, DISPLAYED_KEYS) && f.isToken((shown as JsonObject)["rate_id"]) && positiveMoney((shown as JsonObject)["unit_amount"]));
      need(request["catalogue_sequence"] !== null);
    }
  });
}

function shapeOrder(request: JsonObject): void {
  need(f.exactKeys(request, ORDER_KEYS) && request["kind"] === "order");
  need(f.matches(f.IDEMPOTENCY_KEY, request["idempotency_key"]));
  need(f.isCount(request["catalogue_sequence"], 1));
  shapeContact(request["contact"]);
  need(positiveMoney(request["total_amount"]) && request["currency"] === "EUR");
  shapeLines(request["lines"], ORDER_LINE_KEYS, (line) => {
    need(f.isToken(line["rate_id"]) && positiveMoney(line["unit_amount"]) && positiveMoney(line["line_total"]));
  });
}

function compareBytes(a: Uint8Array, b: Uint8Array): number {
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) if (a[i] !== b[i]) return (a[i] as number) - (b[i] as number);
  return a.length - b.length;
}

/** Digest of the request without idempotency_key, lines sorted by (key, canonical axes) (R-09). */
export function requestFingerprint(request: JsonObject): string {
  const preimage: JsonObject = {};
  for (const key of Object.keys(request)) if (key !== "idempotency_key") preimage[key] = request[key] as Json;
  preimage["lines"] = [...(request["lines"] as JsonObject[])].sort((x, y) => {
    const kx = x["public_item_key"] as string;
    const ky = y["public_item_key"] as string;
    if (kx !== ky) return kx < ky ? -1 : 1;
    return compareBytes(canonicalBytes(x["variant_axes"]), canonicalBytes(y["variant_axes"]));
  });
  return digest(DOMAIN_REQUEST, preimage);
}

function registerOk(register: Json): register is JsonObject[] {
  return (
    Array.isArray(register) &&
    register.every((entry) => f.exactKeys(entry, REGISTER_KEYS) && f.isHex64(entry["request_fingerprint"]) && f.isToken(entry["receipt_ref"]))
  );
}

export type BusinessResult = Verdict & { receipt: JsonObject | null; superseded_by: Superseded };

function begin(requestBytes: Uint8Array, shape: (request: JsonObject) => void, register: Json): [JsonObject | null, BusinessResult | null] {
  if (!registerOk(register)) throw new Error("idempotency register input is invalid (fixture error, not a verdict)");
  const stop = (codes: string[]): BusinessResult => ({ ...rejected(codes), receipt: null, superseded_by: {} });
  let request: Json;
  try {
    request = parseBytes(requestBytes, MAX_BYTES);
  } catch (error) {
    if (error instanceof MalformedPayload) return [null, stop(["PAYLOAD_MALFORMED"])];
    throw error;
  }
  if (!isObject(request) || request["contract_version"] !== CONTRACT_VERSION) return [null, stop(["SCHEMA_UNSUPPORTED"])];
  try {
    shape(request);
  } catch (error) {
    if (error instanceof Bad) return [null, stop(["INVALID_DATA"])];
    throw error;
  }
  if (hasDuplicateLines(request["lines"] as JsonObject[])) return [null, stop(["DUPLICATE_LINE"])];
  const fingerprint = requestFingerprint(request);
  for (const entry of register) {
    if (entry["kind"] === request["kind"] && entry["idempotency_key"] === request["idempotency_key"]) {
      if (entry["request_fingerprint"] === fingerprint) {
        const replay: JsonObject = { receipt_ref: entry["receipt_ref"] as string, request_fingerprint: fingerprint };
        return [null, { ...verdict(true, "REPLAY_SAME_RECEIPT"), receipt: replay, superseded_by: {} }];
      }
      return [null, stop(["DUPLICATE_KEY_DIFFERENT_PAYLOAD"])];
    }
  }
  return [request, null];
}

const QUOTE_HARD_CODES = ["ITEM_SUPERSEDED", "ITEM_RETIRED", "ITEM_NOT_PUBLISHED", "INVALID_VARIANT", "PRICE_WINDOW_OVERLAP"];

export function validateQuoteRequest(requestBytes: Uint8Array, generation: Json, register: Json, nowUtc: string): BusinessResult {
  const gen = new Generation(generation);
  const [request, early] = begin(requestBytes, shapeQuote, register);
  if (early !== null || request === null) return early as BusinessResult;
  const superseded: Superseded = {};
  const stop = (codes: string[]): BusinessResult => ({ ...rejected(codes), receipt: null, superseded_by: superseded });
  const lines = request["lines"] as JsonObject[];
  const priced = lines.some((line) => line["displayed"] !== null);
  if (priced && gen.status === "UNSAFE") return stop(["CATALOG_UNSAFE"]);
  if (priced && request["catalogue_sequence"] !== gen.sequence) return stop(["CATALOG_CHANGED"]);
  const codes = new Set<string>();
  const out: JsonObject[] = [];
  for (const line of lines) {
    const [code, window] = lookup(gen, line["public_item_key"] as string, line["variant_axes"] as JsonObject, line["quantity"] as number, nowUtc, superseded);
    const shown = line["displayed"] as JsonObject | null;
    if (code !== null && QUOTE_HARD_CODES.includes(code)) {
      codes.add(code);
      continue;
    }
    const base: JsonObject = { public_item_key: line["public_item_key"] as Json, variant_axes: line["variant_axes"] as Json, quantity: line["quantity"] as Json };
    if (shown === null) {
      out.push({ ...base, priced: false, rate_id: null, unit_amount: null, currency: null, tax_basis_or_status: null });
      continue;
    }
    if (code !== null || window === null || window.rate_id !== shown["rate_id"] || window.unit_amount !== shown["unit_amount"]) {
      codes.add("CATALOG_CHANGED");
      continue;
    }
    out.push({ ...base, priced: true, rate_id: window.rate_id, unit_amount: window.unit_amount, currency: window.currency, tax_basis_or_status: window.tax_basis_or_status });
  }
  if (codes.size > 0) return stop(Array.from(codes));
  const receipt: JsonObject = {
    kind: "quote_request",
    status: "RECEIVED",
    catalogue_sequence: priced ? (request["catalogue_sequence"] as Json) : null,
    lines: out,
    request_fingerprint: requestFingerprint(request),
  };
  return { ...verdict(true, "RECEIVED"), receipt, superseded_by: superseded };
}

export function validateOrderSubmit(requestBytes: Uint8Array, generation: Json, register: Json, nowUtc: string): BusinessResult {
  const gen = new Generation(generation);
  const [request, early] = begin(requestBytes, shapeOrder, register);
  if (early !== null || request === null) return early as BusinessResult;
  const superseded: Superseded = {};
  const stop = (codes: string[]): BusinessResult => ({ ...rejected(codes), receipt: null, superseded_by: superseded });
  if (gen.status === "UNSAFE") return stop(["CATALOG_UNSAFE"]);
  if (request["catalogue_sequence"] !== gen.sequence) return stop(["CART_STALE"]);
  const codes = new Set<string>();
  const out: JsonObject[] = [];
  let total = 0n;
  for (const line of request["lines"] as JsonObject[]) {
    const submittedTotal = f.moneyCents(line["line_total"]) as bigint;
    total += submittedTotal;
    const quantity = line["quantity"] as number;
    const [code, window] = lookup(gen, line["public_item_key"] as string, line["variant_axes"] as JsonObject, quantity, nowUtc, superseded);
    if (code !== null || window === null) {
      codes.add(code as string);
      continue;
    }
    const unit = f.moneyCents(window.unit_amount) as bigint;
    if (window.rate_id !== line["rate_id"] || window.unit_amount !== line["unit_amount"] || submittedTotal !== unit * BigInt(quantity)) {
      codes.add("PRICE_CHANGED");
      continue;
    }
    out.push({
      public_item_key: line["public_item_key"] as Json,
      variant_axes: line["variant_axes"] as Json,
      quantity,
      catalogue_sequence: gen.sequence,
      rate_id: window.rate_id,
      unit_amount: window.unit_amount,
      currency: window.currency,
      tax_basis_or_status: window.tax_basis_or_status,
      offer_price_version_public: window.offer_price_version_public,
      line_total: f.centsToMoney(unit * BigInt(quantity)),
    });
  }
  if (total !== f.moneyCents(request["total_amount"])) codes.add("PRICE_CHANGED");
  if (codes.size > 0) return stop(Array.from(codes));
  const receipt: JsonObject = {
    kind: "order",
    status: "RECEIVED",
    catalogue_sequence: gen.sequence,
    lines: out,
    total_amount: f.centsToMoney(total),
    currency: "EUR",
    request_fingerprint: requestFingerprint(request),
  };
  return { ...verdict(true, "RECEIVED"), receipt, superseded_by: superseded };
}

export type LookupResult = Verdict & { ref: string | null };

export function lookupReceipt(request: Json, records: Json): LookupResult {
  if (!Array.isArray(records) || !records.every((record) => f.exactKeys(record, RECORD_KEYS))) {
    throw new Error("records input is invalid (fixture error, not a verdict)");
  }
  if (!isObject(request) || !Object.keys(request).every((key) => LOOKUP_KEYS.includes(key)) || !f.isToken(request["ref"])) {
    return { ...rejected(["NOT_FOUND"]), ref: null };
  }
  const token = request["access_token"]; // absent, null or empty -> UNAUTHORIZED (review R-13)
  if (typeof token !== "string" || token.length === 0) return { ...rejected(["UNAUTHORIZED"]), ref: null };
  const presented = createHash("sha256").update(utf8(token)).digest("hex");
  for (const record of records as JsonObject[]) {
    if (record["ref"] === request["ref"]) {
      const stored = String(record["access_token_sha256"]);
      if (stored.length === presented.length && timingSafeEqual(utf8(presented), utf8(stored))) {
        return { ...verdict(true, "FOUND"), ref: record["ref"] as string };
      }
      return { ...rejected(["NOT_FOUND"]), ref: null };
    }
  }
  return { ...rejected(["NOT_FOUND"]), ref: null };
}
