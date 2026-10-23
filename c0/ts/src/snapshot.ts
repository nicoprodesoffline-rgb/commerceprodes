// site_snapshot.v1: shape, semantic rules and integrity of one FULL_READY_CATALOG document.
// Twin of c0/python/c0_contracts/snapshot.py (same stages, same codes).

import * as f from "./formats";
import { isKey } from "./identity";
import { Json, JsonObject, MalformedPayload, canonicalBytes, digest, isCanonical, isObject, parseBytes } from "./jsonc";

export const CONTRACT_VERSION = "site_snapshot.v1";
export const SCOPE = "FULL_READY_CATALOG";
export const DATA_LABELS = ["STAGING_FIXTURE", "PRODUCTION"];
export const MAX_BYTES = 32 * 1024 * 1024;
export const DOMAIN_PAYLOAD = "prodes.c0.site_snapshot.v1";
export const DOMAIN_WITHDRAWALS = "prodes.c0.expected_withdrawals.v1";
export const DOMAIN_SOURCE_COVERAGE = "prodes.c0.source_coverage.v1";
export const DOMAIN_BASIS = "prodes.c0.basis.v1";

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
export const WITHDRAWAL_REASONS = [
  "NOT_READY_SELL_MISSING", "NOT_READY_MEDIA", "NOT_READY_CONTENT", "NOT_READY_CATEGORY",
  "EXPLICIT_EXCLUSION", "COMMERCIAL_WITHDRAWAL", "SUPERSEDED", "RETIRED",
];
const CATEGORY_KEYS = ["category_key", "name", "parent_category_key"];
const FAMILY_KEYS = [
  "public_family_key", "slug", "name", "description_short", "description_long",
  "primary_category_key", "secondary_category_keys", "image_main_sha256", "axes", "items",
];
const AXIS_KEYS = ["axis_key", "label"];
const ITEM_KEYS = ["public_item_key", "status", "variant_axes", "public_media_refs", "public_sell_price_windows"];
const WINDOW_KEYS = [
  "rate_id", "valid_from_utc", "valid_until_utc", "quantity_min", "quantity_max",
  "unit_amount", "currency", "tax_basis_or_status", "offer_price_version_public",
];
const MEDIA_KEYS = ["sha256", "mime", "size"];
const MANIFEST_KEYS = ["families", "items", "media"];
const REGISTRY_KEYS = ["public_item_key", "status", "superseded_by"];
export const REGISTRY_STATUSES = ["SUPERSEDED", "RETIRED"];
export const TAX_BASES_V1 = ["HT", "UNQUALIFIED"];
export const MEDIA_MIME_ALLOWED = ["image/png", "image/jpeg", "image/webp"];
export const MAX_MEDIA_SIZE = 20 * 1024 * 1024;
export const MAX_QUANTITY = 1000000;
const MAX_AXES = 8;
const MIME_FORMAT = /^(?:[a-z]+\/[a-z0-9.+-]{1,64})$/;

// Typed views used after shape validation (the shape check guarantees these fields).
export interface PriceWindow {
  rate_id: string;
  valid_from_utc: string;
  valid_until_utc: string | null;
  quantity_min: number;
  quantity_max: number | null;
  unit_amount: string;
  currency: string;
  tax_basis_or_status: string;
  offer_price_version_public: string;
}
export interface SnapshotItem {
  public_item_key: string;
  status: string;
  variant_axes: Record<string, string>;
  public_media_refs: string[];
  public_sell_price_windows: PriceWindow[];
}
export interface SnapshotFamily {
  public_family_key: string;
  slug: string;
  primary_category_key: string;
  secondary_category_keys: string[];
  image_main_sha256: string;
  axes: { axis_key: string; label: string }[];
  items: SnapshotItem[];
}
export interface Withdrawal {
  public_item_key: string;
  reason: string;
}
export interface Coverage {
  source_coverage_digest: string;
  source_universe_count: number;
  ready_count: number;
  non_ready_count: number;
  explicit_exclusion_count: number;
  unknown_count: number;
  previous_catalogue_sequence: number | null;
  previous_payload_sha256: string | null;
  expected_withdrawals: Withdrawal[];
  expected_withdrawals_digest: string;
}
export interface RegistryEntry {
  public_item_key: string;
  status: string;
  superseded_by: string | null;
}
export interface Snapshot {
  contract_version: string;
  publication_id: string;
  projection_id: string;
  catalogue_sequence: number;
  as_of_utc: string;
  generated_at_utc: string;
  scope_key: string;
  payload_sha256: string;
  coverage: Coverage;
  categories: { category_key: string; parent_category_key: string | null }[];
  families: SnapshotFamily[];
  media_refs: { sha256: string; mime: string; size: number }[];
  manifest_counts: { families: number; items: number; media: number };
  identity_registry: RegistryEntry[];
}

class Bad extends Error {
  constructor(readonly rule: string) {
    super(rule);
  }
}

/** Shape rule; `rule` names it in detail.rules (same names and order as Python). */
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

// --- shape --------------------------------------------------------------------------------------

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
  need(typeof w["tax_basis_or_status"] === "string" && TAX_BASES_V1.includes(w["tax_basis_or_status"]), "window.tax_basis_or_status");
  need(f.isToken(w["offer_price_version_public"]), "window.offer_price_version_public");
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
}

function categoryKeyOk(value: Json | undefined): boolean {
  return f.matches(f.CATEGORY_KEY, value) && value.length <= 64;
}

function shapeFamily(value: Json): void {
  need(f.exactKeys(value, FAMILY_KEYS), "family.keys");
  const family = obj(value);
  need(isKey(family["public_family_key"], "family"), "family.public_family_key");
  need(f.matches(f.SLUG, family["slug"]) && (family["slug"] as string).length <= 120, "family.slug");
  need(f.isText(family["name"], 200), "family.name");
  need(f.isText(family["description_short"], 1000, true), "family.description_short");
  need(f.isText(family["description_long"], 20000, true), "family.description_long");
  need(categoryKeyOk(family["primary_category_key"]), "family.primary_category_key");
  for (const key of list(family["secondary_category_keys"], "family.secondary_category_keys")) need(categoryKeyOk(key), "family.secondary_category_keys");
  need(f.isHex64(family["image_main_sha256"]), "family.image_main_sha256");
  const axes = list(family["axes"], "family.axes");
  need(axes.length <= MAX_AXES, "family.axes");
  for (const axis of axes) {
    need(f.exactKeys(axis, AXIS_KEYS), "family.axes");
    need(f.matches(f.AXIS_KEY, obj(axis)["axis_key"]) && f.isText(obj(axis)["label"], 100), "family.axes");
  }
  for (const item of list(family["items"], "family.items")) shapeItem(item);
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
    need(typeof reason === "string" && WITHDRAWAL_REASONS.includes(reason), "coverage.expected_withdrawals");
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
  for (const category of list(doc["categories"], "categories")) {
    need(f.exactKeys(category, CATEGORY_KEYS), "category.keys");
    need(categoryKeyOk(obj(category)["category_key"]), "category.category_key");
    need(f.isText(obj(category)["name"], 200), "category.name");
    const parent = obj(category)["parent_category_key"];
    need(parent === null || categoryKeyOk(parent), "category.parent_category_key");
  }
  for (const family of list(doc["families"], "families")) shapeFamily(family);
  for (const media of list(doc["media_refs"], "media_refs")) {
    need(f.exactKeys(media, MEDIA_KEYS), "media.keys");
    need(f.isHex64(obj(media)["sha256"]), "media.sha256");
    need(f.matches(MIME_FORMAT, obj(media)["mime"]), "media.mime");
    need(f.isCount(obj(media)["size"], 1, MAX_MEDIA_SIZE), "media.size");
  }
  need(f.exactKeys(doc["manifest_counts"], MANIFEST_KEYS), "manifest_counts.keys");
  for (const key of MANIFEST_KEYS) need(f.isCount(obj(doc["manifest_counts"])[key]), "manifest_counts.keys");
  for (const entry of list(doc["identity_registry"], "identity_registry")) {
    need(f.exactKeys(entry, REGISTRY_KEYS), "registry.keys");
    const e = obj(entry);
    need(isKey(e["public_item_key"], "item"), "registry.public_item_key");
    need(typeof e["status"] === "string" && REGISTRY_STATUSES.includes(e["status"]), "registry.status");
    if (e["status"] === "SUPERSEDED") {
      need(isKey(e["superseded_by"], "item") && e["superseded_by"] !== e["public_item_key"], "registry.superseded_by");
    } else {
      need(e["superseded_by"] === null, "registry.superseded_by");
    }
  }
}

/** Name of the first failing shape rule, or null. */
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

function isSorted(values: Comparable[]): boolean {
  for (let i = 0; i + 1 < values.length; i += 1) if ((values[i] as Comparable) > (values[i + 1] as Comparable)) return false;
  return true;
}

function isSortedTuples(values: Comparable[][]): boolean {
  for (let i = 0; i + 1 < values.length; i += 1) if (compareTuples(values[i] as Comparable[], values[i + 1] as Comparable[]) > 0) return false;
  return true;
}

function isUnique(values: Comparable[]): boolean {
  return new Set(values).size === values.length;
}

export function windowsOverlap(a: PriceWindow, b: PriceWindow): boolean {
  const time = (b.valid_until_utc === null || a.valid_from_utc < b.valid_until_utc) && (a.valid_until_utc === null || b.valid_from_utc < a.valid_until_utc);
  const quantity = (b.quantity_max === null || a.quantity_min <= b.quantity_max) && (a.quantity_max === null || b.quantity_min <= a.quantity_max);
  return time && quantity;
}

export function windowCovers(window: PriceWindow, instant: string, quantity: number | null = null): boolean {
  if (!(window.valid_from_utc <= instant)) return false;
  if (window.valid_until_utc !== null && !(instant < window.valid_until_utc)) return false;
  if (quantity === null) return true;
  return window.quantity_min <= quantity && (window.quantity_max === null || quantity <= window.quantity_max);
}

export function allItems(doc: Snapshot): SnapshotItem[] {
  return doc.families.flatMap((family) => family.items);
}

class Findings {
  readonly codes = new Set<string>();
  readonly rules = new Set<string>();

  invalid(rule: string): void {
    this.named("SNAPSHOT_INVALID", rule);
  }

  /** A code named by the authority (or kept by decision), with its rule in detail.rules. */
  named(code: string, rule: string): void {
    this.codes.add(code);
    this.rules.add(rule);
  }
}

function categoryFindings(doc: Snapshot, out: Findings): void {
  const keys = doc.categories.map((category) => category.category_key);
  if (!isSorted(keys) || !isUnique(keys)) out.invalid("categories.order");
  const parents = new Map<string, string | null>();
  for (const category of doc.categories) parents.set(category.category_key, category.parent_category_key);
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
  for (const family of doc.families) {
    const secondary = family.secondary_category_keys;
    if (!parents.has(family.primary_category_key) || secondary.some((key) => !parents.has(key))) out.named("CATEGORY_UNKNOWN", "category_unknown");
    if (!isSorted(secondary) || !isUnique(secondary) || secondary.includes(family.primary_category_key)) out.invalid("family.secondary_category_keys");
  }
}

function sameKeySet(a: string[], b: string[]): boolean {
  const left = new Set(a);
  const right = new Set(b);
  return left.size === right.size && Array.from(left).every((key) => right.has(key));
}

function familyFindings(doc: Snapshot, out: Findings): void {
  const familyKeys = doc.families.map((family) => family.public_family_key);
  if (!isSorted(familyKeys)) out.invalid("families.order");
  if (!isUnique(familyKeys)) out.codes.add("IDENTITY_CONFLICT");
  if (!isUnique(doc.families.map((family) => family.slug))) out.invalid("families.slug_unique");
  if (!isUnique(allItems(doc).map((item) => item.public_item_key))) out.codes.add("IDENTITY_CONFLICT");
  for (const family of doc.families) {
    if (family.items.length === 0) out.named("FAMILY_WITHOUT_ITEMS", "family_without_items");
    if (!isSorted(family.items.map((item) => item.public_item_key))) out.invalid("items.order");
    const axisKeys = family.axes.map((axis) => axis.axis_key);
    if (!isUnique(axisKeys)) out.invalid("family.axes_unique");
    const combinations: string[] = [];
    for (const item of family.items) {
      if (!sameKeySet(Object.keys(item.variant_axes), axisKeys)) out.invalid("item.axes_match_family");
      combinations.push(new TextDecoder().decode(canonicalBytes(item.variant_axes)));
    }
    if (!isUnique(combinations)) out.invalid("family.combination_unique");
  }
}

function mediaFindings(doc: Snapshot, out: Findings): void {
  const shas = doc.media_refs.map((media) => media.sha256);
  if (!isSorted(shas) || !isUnique(shas)) out.invalid("media_refs.order");
  if (doc.media_refs.some((media) => !MEDIA_MIME_ALLOWED.includes(media.mime))) out.codes.add("MEDIA_TYPE_REJECTED");
  const declared = new Set(shas);
  const used = new Set<string>();
  for (const family of doc.families) {
    used.add(family.image_main_sha256);
    if (!declared.has(family.image_main_sha256)) out.named("MEDIA_MISSING", "media_ref_unknown");
    for (const item of family.items) {
      const refs = item.public_media_refs;
      for (const ref of refs) used.add(ref);
      if (!isSorted(refs) || !isUnique(refs)) out.invalid("item.public_media_refs_order");
      if (refs.some((ref) => !declared.has(ref))) out.named("MEDIA_MISSING", "media_ref_unknown");
    }
  }
  for (const sha of declared) if (!used.has(sha)) out.invalid("media_refs.orphan");
}

function windowFindings(doc: Snapshot, out: Findings): void {
  const rateIds: string[] = [];
  for (const item of allItems(doc)) {
    const windows = item.public_sell_price_windows;
    for (const window of windows) rateIds.push(window.rate_id);
    if (!isSortedTuples(windows.map((w) => [w.valid_from_utc, w.quantity_min, w.rate_id]))) out.invalid("windows.order");
    for (let i = 0; i < windows.length; i += 1) {
      for (let j = i + 1; j < windows.length; j += 1) {
        if (windowsOverlap(windows[i] as PriceWindow, windows[j] as PriceWindow)) out.codes.add("PRICE_WINDOW_OVERLAP");
      }
    }
    if (windows.length === 0) out.named("SELL_MISSING", "item_without_window");
    else if (!windows.some((window) => windowCovers(window, doc.as_of_utc))) out.codes.add("SELL_MISSING");
  }
  if (!isUnique(rateIds)) out.invalid("windows.rate_id_unique");
}

function registryFindings(doc: Snapshot, out: Findings): void {
  const registry = doc.identity_registry;
  const keys = registry.map((entry) => entry.public_item_key);
  if (!isSorted(keys)) out.invalid("registry.order");
  if (!isUnique(keys)) out.codes.add("IDENTITY_CONFLICT");
  const published = new Set(allItems(doc).map((item) => item.public_item_key));
  const statuses = new Map<string, string>();
  for (const entry of registry) statuses.set(entry.public_item_key, entry.status);
  for (const entry of registry) {
    if (published.has(entry.public_item_key)) out.codes.add("IDENTITY_CONFLICT");
    if (entry.superseded_by !== null && statuses.has(entry.superseded_by)) out.codes.add("IDENTITY_CONFLICT");
  }
  const withdrawals = doc.coverage.expected_withdrawals;
  const withdrawn = withdrawals.map((withdrawal) => withdrawal.public_item_key);
  if (!isSorted(withdrawn) || !isUnique(withdrawn)) out.invalid("withdrawals.order");
  for (const withdrawal of withdrawals) {
    const status = statuses.get(withdrawal.public_item_key);
    if (REGISTRY_STATUSES.includes(withdrawal.reason) && status !== withdrawal.reason) out.codes.add("IDENTITY_CONFLICT");
    if (!REGISTRY_STATUSES.includes(withdrawal.reason) && status !== undefined) out.codes.add("IDENTITY_CONFLICT");
  }
}

/** [codes, rules]: every failing code (sorted) and the named rules behind SNAPSHOT_INVALID. */
export function semanticFindings(doc: Snapshot): [string[], string[]] {
  const out = new Findings();
  categoryFindings(doc, out);
  familyFindings(doc, out);
  mediaFindings(doc, out);
  windowFindings(doc, out);
  registryFindings(doc, out);
  return [Array.from(out.codes).sort(), Array.from(out.rules).sort()];
}

export function semanticCodes(doc: Snapshot): string[] {
  return semanticFindings(doc)[0];
}

// --- integrity ------------------------------------------------------------------------------------

export function payloadSha256(doc: JsonObject | Snapshot): string {
  const preimage: Record<string, unknown> = {};
  for (const key of Object.keys(doc)) if (key !== "payload_sha256") preimage[key] = (doc as unknown as Record<string, unknown>)[key];
  return digest(DOMAIN_PAYLOAD, preimage);
}

export function withdrawalsDigest(coverage: Coverage): string {
  return digest(DOMAIN_WITHDRAWALS, {
    previous_catalogue_sequence: coverage.previous_catalogue_sequence,
    previous_payload_sha256: coverage.previous_payload_sha256,
    expected_withdrawals: coverage.expected_withdrawals,
  });
}

export function integrityCodes(doc: Snapshot): string[] {
  const codes = new Set<string>();
  if (doc.payload_sha256 !== payloadSha256(doc) || doc.coverage.expected_withdrawals_digest !== withdrawalsDigest(doc.coverage)) codes.add("INTEGRITY_MISMATCH");
  const counts = doc.manifest_counts;
  if (counts.families !== doc.families.length || counts.items !== allItems(doc).length || counts.media !== doc.media_refs.length) codes.add("MANIFEST_COUNTS_MISMATCH");
  return Array.from(codes).sort();
}

export type Detail = { rules?: string[]; hold_reason?: string };

export function integrityDetail(codes: string[]): Detail {
  return codes.includes("MANIFEST_COUNTS_MISMATCH") ? { rules: ["manifest_counts_mismatch"] } : {};
}

/** [codes, detail] of the first failing stage among version, shape, semantic, integrity. */
export function validateSnapshotDetailed(doc: Json): [string[], Detail] {
  if (!isObject(doc)) return [["SNAPSHOT_INVALID"], { rules: ["envelope.keys"] }];
  if (doc["contract_version"] !== CONTRACT_VERSION) return [["SCHEMA_UNSUPPORTED"], {}];
  const rule = shapeProblem(doc);
  if (rule !== null) return [["SNAPSHOT_INVALID"], { rules: [rule] }];
  const typed = doc as unknown as Snapshot;
  const [codes, rules] = semanticFindings(typed);
  if (codes.length > 0) return [codes, rules.length > 0 ? { rules } : {}];
  const codes2 = integrityCodes(typed);
  return [codes2, integrityDetail(codes2)];
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

export function validateSnapshot(doc: Json): string[] {
  return validateSnapshotDetailed(doc)[0];
}
