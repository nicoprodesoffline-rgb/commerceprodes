// site_business.v1 on a SITE that serves a v2 catalogue (contract c0_site_v2.md §3.1). Twin of c0v2/python/c0_contracts_v2/business.py.
// The frozen v1 business functions receive the v1 view of a v2 generation: same envelope, categories, families, Items and windows
// restricted to their v1 keys, no media. A v1 generation goes through unchanged.

import * as v1 from "../../../c0/ts/src/business";
import { Json, JsonObject, isObject } from "../../../c0/ts/src/jsonc";
import { CONTRACT_VERSION, Doc } from "./snapshot";

const V1_CONTRACT_VERSION = "site_snapshot.v1";
const ENVELOPE_KEYS = [
  "contract_version", "publication_id", "projection_id", "catalogue_sequence", "as_of_utc",
  "generated_at_utc", "scope", "scope_key", "data_label", "basis_digest", "coverage",
  "categories", "families", "media_refs", "manifest_counts", "identity_registry", "payload_sha256",
];
const CATEGORY_KEYS = ["category_key", "name", "parent_category_key"];
const FAMILY_KEYS = [
  "public_family_key", "slug", "name", "description_short", "description_long",
  "primary_category_key", "secondary_category_keys", "image_main_sha256", "axes", "items",
];
const ITEM_KEYS = ["public_item_key", "status", "variant_axes", "public_media_refs", "public_sell_price_windows"];
const WINDOW_KEYS = [
  "rate_id", "valid_from_utc", "valid_until_utc", "quantity_min", "quantity_max",
  "unit_amount", "currency", "tax_basis_or_status", "offer_price_version_public",
];

function only(value: Doc, keys: readonly string[]): JsonObject {
  const out: JsonObject = {};
  for (const key of keys) out[key] = value[key] as Json;
  return out;
}

/** The v1 keys of a site_snapshot.v2 document (a v1 document is returned as it is). */
export function v1View(doc: Json): Json {
  if (!isObject(doc) || doc["contract_version"] !== CONTRACT_VERSION) return doc;
  const d = doc as Doc;
  const families = (d["families"] as Doc[]).map((family) => ({
    ...only(family, FAMILY_KEYS),
    items: (family["items"] as Doc[]).map((item) => ({
      ...only(item, ITEM_KEYS),
      public_sell_price_windows: (item["public_sell_price_windows"] as Doc[]).map((window) => only(window, WINDOW_KEYS)),
    })),
  }));
  return {
    ...only(d, ENVELOPE_KEYS), contract_version: V1_CONTRACT_VERSION,
    categories: (d["categories"] as Doc[]).map((category) => only(category, CATEGORY_KEYS)), families, media_refs: [],
  } as JsonObject;
}

export function asV1Generation(generation: Json): Json {
  if (isObject(generation) && isObject(generation["snapshot"])) return { ...generation, snapshot: v1View(generation["snapshot"]) };
  return generation;
}

/** A v1 ``Generation`` of a served v1 or v2 catalogue, built once (for ``selectPriceIn``). */
export function generationOf(generation: Json): v1.Generation {
  return new v1.Generation(asV1Generation(generation));
}

export function selectPrice(generation: Json, publicItemKey: Json, variantAxes: Json, quantity: Json, instantUtc: Json) {
  return v1.selectPrice(asV1Generation(generation), publicItemKey, variantAxes, quantity, instantUtc);
}

export function validateQuoteRequest(requestBytes: Uint8Array, generation: Json, register: Json, nowUtc: string) {
  return v1.validateQuoteRequest(requestBytes, asV1Generation(generation), register, nowUtc);
}

export function validateOrderSubmit(requestBytes: Uint8Array, generation: Json, register: Json, nowUtc: string) {
  return v1.validateOrderSubmit(requestBytes, asV1Generation(generation), register, nowUtc);
}

export const selectPriceIn = v1.selectPriceIn;
export const lookupReceipt = v1.lookupReceipt;
