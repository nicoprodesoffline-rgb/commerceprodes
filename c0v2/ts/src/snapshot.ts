// site_snapshot.v2: the v1 catalogue plus the fields of circle 3 (contract c0_site_v2.md §2).
// Twin of c0v2/python/c0_contracts_v2/snapshot.py: same rules, same names, same order. The v1 parts the frozen v1 twin does not
// export (coverage shape, category, window and registry rules) are written again here, identical to c0/ts/src/snapshot.ts.

import * as f from "../../../c0/ts/src/formats";
import { isKey } from "../../../c0/ts/src/identity";
import { Json, JsonObject, MalformedPayload, canonicalBytes, digest, isCanonical, isObject, parseBytes } from "../../../c0/ts/src/jsonc";
import * as v1 from "../../../c0/ts/src/snapshot";

export const CONTRACT_VERSION = "site_snapshot.v2";
export const SCOPE = v1.SCOPE;
export const DATA_LABELS = v1.DATA_LABELS;
export const MAX_BYTES = v1.MAX_BYTES;
export const DOMAIN_PAYLOAD = "prodes.c0.site_snapshot.v2";
export const DOMAIN_BASIS = "prodes.c0.basis.v2";

const ENVELOPE_KEYS = [
  "contract_version", "publication_id", "projection_id", "catalogue_sequence", "as_of_utc",
  "generated_at_utc", "scope", "scope_key", "data_label", "basis_digest", "coverage",
  "categories", "families", "media_refs", "manifest_counts", "identity_registry", "payload_sha256",
];
const COVERAGE_KEYS = [
  "source_coverage_digest", "source_universe_count", "ready_count", "non_ready_count",
  "explicit_exclusion_count", "unknown_count", "previous_catalogue_sequence",
  "previous_payload_sha256", "expected_withdrawals", "expected_withdrawals_digest",
];
const WITHDRAWAL_KEYS = ["public_item_key", "reason"];
const CATEGORY_KEYS = ["category_key", "name", "parent_category_key", "position", "intro_text", "image_sha256", "seo_title", "seo_description", "hidden"];
const FAMILY_KEYS = [
  "public_family_key", "slug", "name", "description_short", "description_long",
  "primary_category_key", "secondary_category_keys", "image_main_sha256", "axes", "items",
  "seo_title", "seo_description", "slug_aliases", "first_published_at_utc", "category_positions", "characteristics", "documents",
  // 49e série (Owner, 25/11): the delivery lead time of the family, one text or null.
  "delivery_delay",
];
const AXIS_KEYS = ["axis_key", "label"];
const ITEM_KEYS = ["public_item_key", "status", "variant_axes", "public_media_refs", "public_sell_price_windows", "pack", "characteristics"];
const WINDOW_KEYS = [
  "rate_id", "valid_from_utc", "valid_until_utc", "quantity_min", "quantity_max",
  "unit_amount", "currency", "tax_basis_or_status", "offer_price_version_public", "price_nature", "reference_unit_amount",
];
const MEDIA_KEYS = ["sha256", "mime", "size", "derivatives", "alt", "public_name"];
const DERIVATIVE_KEYS = ["sha256", "width", "height", "mime", "size"];
const POSITION_KEYS = ["category_key", "position"];
const CHARACTERISTIC_KEYS = ["label", "value"];
const DOCUMENT_KEYS = ["label", "kind", "sha256", "mime", "size"];
const PACK_KEYS = ["paid_units", "free_units"];
const MANIFEST_KEYS = ["families", "items", "media"];
const REGISTRY_KEYS = ["public_item_key", "status", "superseded_by"];

export const PRICE_NATURES = ["BASE", "PROMOTION", "URGENCE"];
export const DOCUMENT_KINDS = ["TECHNICAL_SHEET", "NOTICE", "OTHER"];
export const DOCUMENT_MIME = "application/pdf";
export const MAX_DOCUMENT_SIZE = 30 * 1024 * 1024;
export const MEDIA_MIME_ALLOWED = v1.MEDIA_MIME_ALLOWED;
export const MAX_MEDIA_SIZE = v1.MAX_MEDIA_SIZE;
const MAX_QUANTITY = v1.MAX_QUANTITY;
const MAX_POSITION = 1000000;
/** The supplier's lead time as typed in the Factory (120 at most), as MAX_DELIVERY_DELAY in the Python reference. */
const MAX_DELIVERY_DELAY = 120;
const MAX_DIMENSION = 20000;
const MAX_DERIVATIVES = 8;
const MAX_CHARACTERISTICS = 200;
const MAX_DOCUMENTS = 50;
const MIME_FORMAT = /^(?:[a-z]+\/[a-z0-9.+-]{1,64})$/;

// Loose view of a document already shape-checked (every key present, every type right).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Doc = Record<string, any>;

class Bad extends Error {
  constructor(readonly rule: string) {
    super(rule);
  }
}

function need(condition: boolean, rule: string): void {
  if (!condition) throw new Bad(rule);
}

function list(value: Json | undefined, rule: string): Json[] {
  need(Array.isArray(value), rule);
  return value as Json[];
}

function obj(value: Json | undefined): JsonObject {
  return value as JsonObject;
}

function optionalText(value: Json | undefined, maximum: number, multiline = false): boolean {
  return value === null || f.isText(value, maximum, multiline);
}

function slugOk(value: Json | undefined): boolean {
  return f.matches(f.SLUG, value) && value.length <= 120;
}

function categoryKeyOk(value: Json | undefined): boolean {
  return f.matches(f.CATEGORY_KEY, value) && value.length <= 64;
}

// --- shape --------------------------------------------------------------------------------------

function shapeCharacteristics(value: Json | undefined, rule: string): void {
  const entries = list(value, rule);
  need(entries.length <= MAX_CHARACTERISTICS, rule);
  for (const entry of entries) {
    need(f.exactKeys(entry, CHARACTERISTIC_KEYS), rule);
    need(f.isText(obj(entry)["label"], 100) && f.isText(obj(entry)["value"], 500, true), rule);
  }
}

function shapeWindow(window: Json): void {
  need(f.exactKeys(window, WINDOW_KEYS), "window.keys");
  const w = obj(window);
  need(f.isToken(w["rate_id"]), "window.rate_id");
  need(f.isUtc(w["valid_from_utc"]), "window.valid_from_utc");
  const until = w["valid_until_utc"];
  need(until === null || (f.isUtc(until) && until > (w["valid_from_utc"] as string)), "window.valid_until_utc");
  need(f.isCount(w["quantity_min"], 1, MAX_QUANTITY), "window.quantity_min");
  const qmax = w["quantity_max"];
  need(qmax === null || (f.isCount(qmax, 1, MAX_QUANTITY) && qmax >= (w["quantity_min"] as number)), "window.quantity_max");
  const cents = f.moneyCents(w["unit_amount"]);
  need(cents !== null && cents > 0n, "window.unit_amount");
  need(w["currency"] === "EUR", "window.currency");
  need(typeof w["tax_basis_or_status"] === "string" && v1.TAX_BASES_V1.includes(w["tax_basis_or_status"]), "window.tax_basis_or_status");
  need(f.isToken(w["offer_price_version_public"]), "window.offer_price_version_public");
  const nature = w["price_nature"];
  need(nature === null || (typeof nature === "string" && PRICE_NATURES.includes(nature)), "window.price_nature");
  const reference = w["reference_unit_amount"];
  if (reference !== null) {
    const referenceCents = f.moneyCents(reference);
    // 3.20 (M02): the struck price the Calculator file gives, on any window (a fixed-price lot first); never computed by the Factory.
    need(referenceCents !== null && referenceCents > 0n, "window.reference_unit_amount");
  }
}

function shapeItem(value: Json): void {
  need(f.exactKeys(value, ITEM_KEYS), "item.keys");
  const item = obj(value);
  need(isKey(item["public_item_key"], "item"), "item.public_item_key");
  need(item["status"] === "READY", "item.status");
  const axes = item["variant_axes"];
  need(isObject(axes), "item.variant_axes");
  for (const key of Object.keys(axes as JsonObject)) {
    need(f.matches(f.AXIS_KEY, key) && f.isText((axes as JsonObject)[key], 100), "item.variant_axes");
  }
  for (const ref of list(item["public_media_refs"], "item.public_media_refs")) need(f.isHex64(ref), "item.public_media_refs");
  for (const window of list(item["public_sell_price_windows"], "item.public_sell_price_windows")) shapeWindow(window);
  const pack = item["pack"];
  if (pack !== null) {
    need(f.exactKeys(pack, PACK_KEYS), "item.pack");
    need(f.isCount(obj(pack)["paid_units"], 1, MAX_QUANTITY) && f.isCount(obj(pack)["free_units"], 1, MAX_QUANTITY), "item.pack");
  }
  shapeCharacteristics(item["characteristics"], "item.characteristics");
}

function shapeFamily(value: Json): void {
  need(f.exactKeys(value, FAMILY_KEYS), "family.keys");
  const family = obj(value);
  need(isKey(family["public_family_key"], "family"), "family.public_family_key");
  need(slugOk(family["slug"]), "family.slug");
  need(f.isText(family["name"], 200), "family.name");
  need(f.isText(family["description_short"], 1000, true), "family.description_short");
  need(f.isText(family["description_long"], 20000, true), "family.description_long");
  need(categoryKeyOk(family["primary_category_key"]), "family.primary_category_key");
  for (const key of list(family["secondary_category_keys"], "family.secondary_category_keys")) need(categoryKeyOk(key), "family.secondary_category_keys");
  need(f.isHex64(family["image_main_sha256"]), "family.image_main_sha256");
  const axes = list(family["axes"], "family.axes");
  for (const axis of axes) {
    need(f.exactKeys(axis, AXIS_KEYS), "family.axes");
    need(f.matches(f.AXIS_KEY, obj(axis)["axis_key"]) && f.isText(obj(axis)["label"], 100), "family.axes");
  }
  for (const item of list(family["items"], "family.items")) shapeItem(item);
  need(optionalText(family["seo_title"], 200), "family.seo_title");
  need(optionalText(family["seo_description"], 1000, true), "family.seo_description");
  for (const alias of list(family["slug_aliases"], "family.slug_aliases")) need(slugOk(alias), "family.slug_aliases");
  need(f.isUtc(family["first_published_at_utc"]), "family.first_published_at_utc");
  need(optionalText(family["delivery_delay"], MAX_DELIVERY_DELAY), "family.delivery_delay");
  for (const entry of list(family["category_positions"], "family.category_positions")) {
    need(f.exactKeys(entry, POSITION_KEYS), "family.category_positions");
    need(categoryKeyOk(obj(entry)["category_key"]) && f.isCount(obj(entry)["position"], 1, MAX_POSITION), "family.category_positions");
  }
  shapeCharacteristics(family["characteristics"], "family.characteristics");
  const documents = list(family["documents"], "family.documents");
  need(documents.length <= MAX_DOCUMENTS, "family.documents");
  for (const document of documents) {
    need(f.exactKeys(document, DOCUMENT_KEYS), "family.documents");
    const d = obj(document);
    need(
      f.isText(d["label"], 200) && typeof d["kind"] === "string" && DOCUMENT_KINDS.includes(d["kind"]) && f.isHex64(d["sha256"]) &&
        d["mime"] === DOCUMENT_MIME && f.isCount(d["size"], 1, MAX_DOCUMENT_SIZE),
      "family.documents",
    );
  }
}

function shapeCategory(value: Json): void {
  need(f.exactKeys(value, CATEGORY_KEYS), "category.keys");
  const category = obj(value);
  need(categoryKeyOk(category["category_key"]), "category.category_key");
  need(f.isText(category["name"], 200), "category.name");
  const parent = category["parent_category_key"];
  need(parent === null || categoryKeyOk(parent), "category.parent_category_key");
  need(f.isCount(category["position"], 1, MAX_POSITION), "category.position");
  need(optionalText(category["intro_text"], 5000, true), "category.intro_text");
  need(category["image_sha256"] === null || f.isHex64(category["image_sha256"]), "category.image_sha256");
  need(optionalText(category["seo_title"], 200), "category.seo_title");
  need(optionalText(category["seo_description"], 1000, true), "category.seo_description");
  need(typeof category["hidden"] === "boolean", "category.hidden");
}

function shapeMedia(value: Json): void {
  need(f.exactKeys(value, MEDIA_KEYS), "media.keys");
  const media = obj(value);
  need(f.isHex64(media["sha256"]), "media.sha256");
  need(f.matches(MIME_FORMAT, media["mime"]), "media.mime");
  need(f.isCount(media["size"], 1, MAX_DOCUMENT_SIZE), "media.size");
  const derivatives = list(media["derivatives"], "media.derivatives");
  need(derivatives.length <= MAX_DERIVATIVES, "media.derivatives");
  for (const derivative of derivatives) {
    need(f.exactKeys(derivative, DERIVATIVE_KEYS), "media.derivatives");
    const d = obj(derivative);
    need(
      f.isHex64(d["sha256"]) && f.isCount(d["width"], 1, MAX_DIMENSION) && f.isCount(d["height"], 1, MAX_DIMENSION) &&
        f.matches(MIME_FORMAT, d["mime"]) && f.isCount(d["size"], 1, MAX_MEDIA_SIZE),
      "media.derivatives",
    );
  }
  if (derivatives.length === 0) need((media["size"] as number) <= MAX_MEDIA_SIZE, "media.size");
  need(optionalText(media["alt"], 150), "media.alt");
  need(media["public_name"] === null || slugOk(media["public_name"]), "media.public_name");
}

function shapeCoverage(value: Json, sequence: number): void {
  need(f.exactKeys(value, COVERAGE_KEYS), "coverage.keys");
  const coverage = obj(value);
  need(f.isHex64(coverage["source_coverage_digest"]) && f.isHex64(coverage["expected_withdrawals_digest"]), "coverage.digests");
  for (const key of ["source_universe_count", "ready_count", "non_ready_count", "explicit_exclusion_count", "unknown_count"]) {
    need(f.isCount(coverage[key]), "coverage.counts");
  }
  const previousSequence = coverage["previous_catalogue_sequence"];
  const previousSha = coverage["previous_payload_sha256"];
  if (previousSequence === null) {
    need(previousSha === null, "coverage.previous");
  } else {
    need(f.isCount(previousSequence, 1) && previousSequence < sequence && f.isHex64(previousSha), "coverage.previous");
  }
  for (const withdrawal of list(coverage["expected_withdrawals"], "coverage.expected_withdrawals")) {
    need(f.exactKeys(withdrawal, WITHDRAWAL_KEYS), "coverage.expected_withdrawals");
    need(isKey(obj(withdrawal)["public_item_key"], "item"), "coverage.expected_withdrawals");
    const reason = obj(withdrawal)["reason"];
    need(typeof reason === "string" && v1.WITHDRAWAL_REASONS.includes(reason), "coverage.expected_withdrawals");
  }
}

function shape(value: Json): void {
  need(f.exactKeys(value, ENVELOPE_KEYS), "envelope.keys");
  const doc = obj(value);
  need(f.isToken(doc["publication_id"]) && f.isToken(doc["projection_id"]), "envelope.ids");
  need(f.isCount(doc["catalogue_sequence"], 1), "envelope.catalogue_sequence");
  need(f.isUtc(doc["as_of_utc"]) && f.isUtc(doc["generated_at_utc"]), "envelope.timestamps");
  need((doc["as_of_utc"] as string) <= (doc["generated_at_utc"] as string), "envelope.timestamps");
  need(doc["scope"] === SCOPE, "envelope.scope");
  need(f.isToken(doc["scope_key"]), "envelope.scope_key");
  need(typeof doc["data_label"] === "string" && DATA_LABELS.includes(doc["data_label"]), "envelope.data_label");
  need(f.isHex64(doc["basis_digest"]) && f.isHex64(doc["payload_sha256"]), "envelope.digests");
  shapeCoverage(doc["coverage"] as Json, doc["catalogue_sequence"] as number);
  for (const category of list(doc["categories"], "categories")) shapeCategory(category);
  for (const family of list(doc["families"], "families")) shapeFamily(family);
  for (const media of list(doc["media_refs"], "media_refs")) shapeMedia(media);
  need(f.exactKeys(doc["manifest_counts"], MANIFEST_KEYS), "manifest_counts.keys");
  for (const key of MANIFEST_KEYS) need(f.isCount(obj(doc["manifest_counts"])[key]), "manifest_counts.keys");
  for (const entry of list(doc["identity_registry"], "identity_registry")) {
    need(f.exactKeys(entry, REGISTRY_KEYS), "registry.keys");
    const e = obj(entry);
    need(isKey(e["public_item_key"], "item"), "registry.public_item_key");
    need(typeof e["status"] === "string" && v1.REGISTRY_STATUSES.includes(e["status"]), "registry.status");
    if (e["status"] === "SUPERSEDED") {
      need(isKey(e["superseded_by"], "item") && e["superseded_by"] !== e["public_item_key"], "registry.superseded_by");
    } else {
      need(e["superseded_by"] === null, "registry.superseded_by");
    }
  }
}

export function shapeProblem(doc: Json): string | null {
  try {
    shape(doc);
  } catch (error) {
    if (error instanceof Bad) return error.rule;
    throw error;
  }
  return null;
}

export function shapeOk(doc: Json): boolean {
  return shapeProblem(doc) === null;
}

// --- semantic rules -------------------------------------------------------------------------------

type Comparable = string | number;

function compareTuples(a: Comparable[], b: Comparable[]): number {
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
    const x = a[i] as Comparable;
    const y = b[i] as Comparable;
    if (x < y) return -1;
    if (x > y) return 1;
  }
  return a.length - b.length;
}

export function isSorted(values: Comparable[]): boolean {
  for (let i = 0; i + 1 < values.length; i += 1) if ((values[i] as Comparable) > (values[i + 1] as Comparable)) return false;
  return true;
}

export function isSortedTuples(values: Comparable[][]): boolean {
  for (let i = 0; i + 1 < values.length; i += 1) if (compareTuples(values[i] as Comparable[], values[i + 1] as Comparable[]) > 0) return false;
  return true;
}

export function isUnique(values: Comparable[]): boolean {
  return new Set(values).size === values.length;
}

export function allItems(doc: Doc): Doc[] {
  return (doc["families"] as Doc[]).flatMap((family) => family["items"] as Doc[]);
}

class Findings {
  readonly codes = new Set<string>();
  readonly rules = new Set<string>();

  invalid(rule: string): void {
    this.named("SNAPSHOT_INVALID", rule);
  }

  named(code: string, rule: string): void {
    this.codes.add(code);
    this.rules.add(rule);
  }
}

function categoryFindings(doc: Doc, out: Findings): void {
  const categories = doc["categories"] as Doc[];
  const keys = categories.map((category) => category["category_key"] as string);
  if (!isSorted(keys) || !isUnique(keys)) out.invalid("categories.order");
  const parents = new Map<string, string | null>();
  for (const category of categories) parents.set(category["category_key"], category["parent_category_key"]);
  for (const parent of parents.values()) if (parent !== null && !parents.has(parent)) out.named("CATEGORY_UNKNOWN", "category_unknown");
  for (const start of parents.keys()) {
    const seen = new Set<string>();
    let current: string | null | undefined = start;
    while (current !== null && current !== undefined && parents.has(current)) {
      if (seen.has(current)) {
        out.invalid("categories.cycle");
        break;
      }
      seen.add(current);
      current = parents.get(current);
    }
  }
  for (const family of doc["families"] as Doc[]) {
    const secondary = family["secondary_category_keys"] as string[];
    if (!parents.has(family["primary_category_key"]) || secondary.some((key) => !parents.has(key))) out.named("CATEGORY_UNKNOWN", "category_unknown");
    if (!isSorted(secondary) || !isUnique(secondary) || secondary.includes(family["primary_category_key"])) out.invalid("family.secondary_category_keys");
  }
}

function sameKeySet(a: string[], b: string[]): boolean {
  const left = new Set(a);
  const right = new Set(b);
  return left.size === right.size && Array.from(left).every((key) => right.has(key));
}

function labels(entries: Doc[]): string[] {
  return entries.map((entry) => entry["label"] as string);
}

function familyFindings(doc: Doc, out: Findings): void {
  const families = doc["families"] as Doc[];
  const familyKeys = families.map((family) => family["public_family_key"] as string);
  if (!isSorted(familyKeys)) out.invalid("families.order");
  if (!isUnique(familyKeys)) out.codes.add("IDENTITY_CONFLICT");
  if (!isUnique(families.flatMap((family) => [family["slug"] as string, ...(family["slug_aliases"] as string[])]))) out.invalid("families.slug_unique");
  if (!isUnique(allItems(doc).map((item) => item["public_item_key"] as string))) out.codes.add("IDENTITY_CONFLICT");
  for (const family of families) {
    const items = family["items"] as Doc[];
    if (items.length === 0) out.named("FAMILY_WITHOUT_ITEMS", "family_without_items");
    if (!isSorted(items.map((item) => item["public_item_key"] as string))) out.invalid("items.order");
    const axisKeys = (family["axes"] as Doc[]).map((axis) => axis["axis_key"] as string);
    if (!isUnique(axisKeys)) out.invalid("family.axes_unique");
    const combinations: string[] = [];
    for (const item of items) {
      if (!sameKeySet(Object.keys(item["variant_axes"]), axisKeys)) out.invalid("item.axes_match_family");
      combinations.push(new TextDecoder().decode(canonicalBytes(item["variant_axes"])));
      if (!isUnique(labels(item["characteristics"]))) out.invalid("item.characteristics_unique");
    }
    if (!isUnique(combinations)) out.invalid("family.combination_unique");
    const aliases = family["slug_aliases"] as string[];
    if (!isSorted(aliases) || !isUnique(aliases)) out.invalid("family.slug_aliases_order");
    const positioned = (family["category_positions"] as Doc[]).map((entry) => entry["category_key"] as string);
    const homes = new Set<string>([family["primary_category_key"], ...(family["secondary_category_keys"] as string[])]);
    if (!isSorted(positioned) || !isUnique(positioned) || positioned.some((key) => !homes.has(key))) out.invalid("family.category_positions");
    if (!isUnique(labels(family["characteristics"]))) out.invalid("family.characteristics_unique");
    const documents = (family["documents"] as Doc[]).map((document) => document["sha256"] as string);
    if (!isSorted(documents) || !isUnique(documents)) out.invalid("family.documents_order");
  }
}

function mediaFindings(doc: Doc, out: Findings): void {
  const mediaRefs = doc["media_refs"] as Doc[];
  const shas = mediaRefs.map((media) => media["sha256"] as string);
  if (!isSorted(shas) || !isUnique(shas)) out.invalid("media_refs.order");
  const served: string[] = [];
  for (const media of mediaRefs) {
    const derivatives = media["derivatives"] as Doc[];
    if (derivatives.length === 0 && !MEDIA_MIME_ALLOWED.includes(media["mime"])) out.codes.add("MEDIA_TYPE_REJECTED");
    if (derivatives.some((derivative) => !MEDIA_MIME_ALLOWED.includes(derivative["mime"]))) out.codes.add("MEDIA_TYPE_REJECTED");
    const widths = derivatives.map((derivative) => derivative["width"] as number);
    for (let i = 0; i + 1 < widths.length; i += 1) {
      if ((widths[i] as number) >= (widths[i + 1] as number)) {
        out.invalid("media.derivatives_order");
        break;
      }
    }
    for (const derivative of derivatives) served.push(derivative["sha256"]);
  }
  const declared = new Set(shas);
  if (!isUnique(served) || served.some((sha) => declared.has(sha))) out.invalid("media.derivatives_unique");
  const used = new Set<string>();
  for (const category of doc["categories"] as Doc[]) {
    if (category["image_sha256"] !== null) {
      used.add(category["image_sha256"]);
      if (!declared.has(category["image_sha256"])) out.named("MEDIA_MISSING", "media_ref_unknown");
    }
  }
  for (const family of doc["families"] as Doc[]) {
    used.add(family["image_main_sha256"]);
    if (!declared.has(family["image_main_sha256"])) out.named("MEDIA_MISSING", "media_ref_unknown");
    for (const item of family["items"] as Doc[]) {
      const refs = item["public_media_refs"] as string[];
      for (const ref of refs) used.add(ref);
      if (!isSorted(refs) || !isUnique(refs)) out.invalid("item.public_media_refs_order");
      if (refs.some((ref) => !declared.has(ref))) out.named("MEDIA_MISSING", "media_ref_unknown");
    }
  }
  for (const sha of declared) if (!used.has(sha)) out.invalid("media_refs.orphan");
}

function windowFindings(doc: Doc, out: Findings): void {
  const rateIds: string[] = [];
  for (const item of allItems(doc)) {
    const windows = item["public_sell_price_windows"] as v1.PriceWindow[];
    for (const window of windows) rateIds.push(window.rate_id);
    if (!isSortedTuples(windows.map((w) => [w.valid_from_utc, w.quantity_min, w.rate_id]))) out.invalid("windows.order");
    for (let i = 0; i < windows.length; i += 1) {
      for (let j = i + 1; j < windows.length; j += 1) {
        if (v1.windowsOverlap(windows[i] as v1.PriceWindow, windows[j] as v1.PriceWindow)) out.codes.add("PRICE_WINDOW_OVERLAP");
      }
    }
    if (windows.length === 0) out.named("SELL_MISSING", "item_without_window");
    else if (!windows.some((window) => v1.windowCovers(window, doc["as_of_utc"]))) out.codes.add("SELL_MISSING");
  }
  if (!isUnique(rateIds)) out.invalid("windows.rate_id_unique");
}

function registryFindings(doc: Doc, out: Findings): void {
  const registry = doc["identity_registry"] as Doc[];
  const keys = registry.map((entry) => entry["public_item_key"] as string);
  if (!isSorted(keys)) out.invalid("registry.order");
  if (!isUnique(keys)) out.codes.add("IDENTITY_CONFLICT");
  const published = new Set(allItems(doc).map((item) => item["public_item_key"] as string));
  const statuses = new Map<string, string>();
  for (const entry of registry) statuses.set(entry["public_item_key"], entry["status"]);
  for (const entry of registry) {
    if (published.has(entry["public_item_key"])) out.codes.add("IDENTITY_CONFLICT");
    if (entry["superseded_by"] !== null && statuses.has(entry["superseded_by"])) out.codes.add("IDENTITY_CONFLICT");
  }
  const withdrawals = doc["coverage"]["expected_withdrawals"] as Doc[];
  const withdrawn = withdrawals.map((withdrawal) => withdrawal["public_item_key"] as string);
  if (!isSorted(withdrawn) || !isUnique(withdrawn)) out.invalid("withdrawals.order");
  for (const withdrawal of withdrawals) {
    const status = statuses.get(withdrawal["public_item_key"]);
    if (v1.REGISTRY_STATUSES.includes(withdrawal["reason"]) && status !== withdrawal["reason"]) out.codes.add("IDENTITY_CONFLICT");
    if (!v1.REGISTRY_STATUSES.includes(withdrawal["reason"]) && status !== undefined) out.codes.add("IDENTITY_CONFLICT");
  }
}

export function semanticFindings(doc: Doc): [string[], string[]] {
  const out = new Findings();
  categoryFindings(doc, out);
  familyFindings(doc, out);
  mediaFindings(doc, out);
  windowFindings(doc, out);
  registryFindings(doc, out);
  return [Array.from(out.codes).sort(), Array.from(out.rules).sort()];
}

// --- integrity ------------------------------------------------------------------------------------

export function payloadSha256(doc: Doc): string {
  const preimage: Record<string, unknown> = {};
  for (const key of Object.keys(doc)) if (key !== "payload_sha256") preimage[key] = doc[key];
  return digest(DOMAIN_PAYLOAD, preimage);
}

export const withdrawalsDigest = v1.withdrawalsDigest;
export const integrityDetail = v1.integrityDetail;
export type Detail = v1.Detail;

export function integrityCodes(doc: Doc): string[] {
  const codes = new Set<string>();
  if (doc["payload_sha256"] !== payloadSha256(doc) || doc["coverage"]["expected_withdrawals_digest"] !== withdrawalsDigest(doc["coverage"])) codes.add("INTEGRITY_MISMATCH");
  const counts = doc["manifest_counts"];
  if (counts["families"] !== doc["families"].length || counts["items"] !== allItems(doc).length || counts["media"] !== doc["media_refs"].length) codes.add("MANIFEST_COUNTS_MISMATCH");
  return Array.from(codes).sort();
}

export function validateSnapshotDetailed(doc: Json): [string[], Detail] {
  if (!isObject(doc)) return [["SNAPSHOT_INVALID"], { rules: ["envelope.keys"] }];
  if (doc["contract_version"] !== CONTRACT_VERSION) return [["SCHEMA_UNSUPPORTED"], {}];
  const rule = shapeProblem(doc);
  if (rule !== null) return [["SNAPSHOT_INVALID"], { rules: [rule] }];
  const [codes, rules] = semanticFindings(doc);
  if (codes.length > 0) return [codes, rules.length > 0 ? { rules } : {}];
  const codes2 = integrityCodes(doc);
  return [codes2, integrityDetail(codes2)];
}

export function validateSnapshot(doc: Json): string[] {
  return validateSnapshotDetailed(doc)[0];
}

export function validateSnapshotBytes(data: Uint8Array): string[] {
  let doc: Json;
  try {
    doc = parseBytes(data, MAX_BYTES);
  } catch (error) {
    if (error instanceof MalformedPayload) return ["PAYLOAD_MALFORMED"];
    throw error;
  }
  if (!isCanonical(data, doc)) return ["INTEGRITY_MISMATCH"];
  return validateSnapshot(doc);
}

/** [sha256, mime, size] of every byte string the SITE must hold: derivatives of a derived image, the image otherwise, documents. */
export function servedMedia(doc: Doc): [string, string, number][] {
  const served: [string, string, number][] = [];
  for (const media of doc["media_refs"] as Doc[]) {
    const derivatives = media["derivatives"] as Doc[];
    if (derivatives.length > 0) for (const d of derivatives) served.push([d["sha256"], d["mime"], d["size"]]);
    else served.push([media["sha256"], media["mime"], media["size"]]);
  }
  for (const family of doc["families"] as Doc[]) for (const d of family["documents"] as Doc[]) served.push([d["sha256"], d["mime"], d["size"]]);
  return served;
}
