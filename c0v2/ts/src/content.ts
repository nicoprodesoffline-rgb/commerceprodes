// site_content.v2: the shop's contents by the signed channel (contract c0_site_v2.md §4).
// Twin of c0v2/python/c0_contracts_v2/content.py: same stages, same rules, same names, same order.

import * as f from "../../../c0/ts/src/formats";
import { isKey } from "../../../c0/ts/src/identity";
import { Json, JsonObject, MalformedPayload, digest, isCanonical, isObject, parseBytes } from "../../../c0/ts/src/jsonc";
import * as signing from "../../../c0/ts/src/signing";
import { utcSeconds } from "../../../c0/ts/src/activation";
import { Verdict, rejected, verdict } from "./errors";
import { Doc, isSorted, isSortedTuples, isUnique } from "./snapshot";

export const CONTRACT_VERSION = "site_content.v2";
export const ACK_CONTRACT_VERSION = "site_content_activation.v2";
export const MAX_BYTES = 8 * 1024 * 1024;
export const DOMAIN_PAYLOAD = "prodes.c0.site_content.v2";
export const DOMAIN_ACTIVE = "prodes.c0.active_content.v2";
export const DOMAIN_SIG_CONTENT = "prodes.c0.sig.site_content.v2";
export const DOMAIN_SIG_ACK = "prodes.c0.sig.site_content_ack.v2";

const ENVELOPE_KEYS = [
  "contract_version", "publication_id", "content_sequence", "generated_at_utc", "catalogue_sequence",
  "shop", "announcement", "maintenance", "redirects", "pages", "relations", "payload_sha256",
];
const SHOP_KEYS = ["phone", "email", "address", "opening_hours", "delivery_note", "footer_links", "novelty_days", "novelty_count"];
const LINK_KEYS = ["label", "path"];
const ANNOUNCEMENT_KEYS = ["text", "link", "starts_at_utc", "ends_at_utc"];
const MAINTENANCE_KEYS = ["active", "message"];
const REDIRECT_KEYS = ["from_path", "to_path", "status"];
const PAGE_KEYS = ["key", "slug", "title", "revision", "seo_title", "seo_description", "canonical", "sections", "nav"];
const NAV_KEYS = ["show_in_bar", "order"];
const SECTION_KEYS = ["type", "data"];
const QUESTION_KEYS = ["question", "answer"];
const RELATION_KEYS = ["source", "target", "kind", "order"];
const ACK_KEYS = [
  "contract_version", "outcome", "publication_id", "content_sequence", "payload_sha256", "active_digest",
  "activated_at_utc", "key_id", "signature",
];
const TRANSPORT_KEYS = ["key_id", "signature"];

/** Section types: [keys data may carry, keys it must carry]. */
export const SECTION_DATA: Readonly<Record<string, readonly [readonly string[], readonly string[]]>> = {
  hero: [["title", "text", "link", "link_label", "image_sha256"], ["title"]],
  category_grid: [["title", "categories"], ["categories"]],
  product_carousel: [["title", "families"], ["families"]],
  text_image: [["title", "text", "media_sha", "image_alt"], ["text", "media_sha"]],
  faq: [["title", "questions"], ["questions"]],
  rich_text: [["title", "text"], ["text"]],
};
export const RELATION_KINDS = ["COMPLEMENTAIRE", "LIE", "UPSELL"];
export const REDIRECT_STATUSES = [301, 308];
const MAX_PAGES = 500;
const MAX_SECTIONS = 30;
const MAX_REFERENCES = 24;
const MAX_QUESTIONS = 100;
const MAX_REDIRECTS = 20000;
const MAX_FOOTER_LINKS = 20;
const MAX_NOVELTY_DAYS = 365; // 3.20 (N04): how long a family stays new, set in SITE › Boutique, 60 to start
const MAX_NOVELTY_COUNT = 200; // 3.20 (N04): how many new families at most, 24 to start
const MAX_NAV_ORDER = 1000000;

export const PAGE_PATH = /^(?:\/(?:[a-z0-9_-]+(?:\/[a-z0-9_-]+)*)?)$/;
export const LOCAL_PATH = /^(?:\/(?![/\\])[A-Za-z0-9._~!$&'()*+,;=@%/?-]{0,499})$/;

class Bad extends Error {
  constructor(readonly rule: string) {
    super(rule);
  }
}

function need(condition: boolean, rule: string): void {
  if (!condition) throw new Bad(rule);
}

function list(value: Json | undefined, rule: string, maximum: number): Json[] {
  need(Array.isArray(value) && value.length <= maximum, rule);
  return value as Json[];
}

function obj(value: Json | undefined): JsonObject {
  return value as JsonObject;
}

function optionalText(value: Json | undefined, maximum: number, multiline = false): boolean {
  return value === null || f.isText(value, maximum, multiline);
}

export function isLocalPath(value: unknown): value is string {
  return f.matches(LOCAL_PATH, value);
}

function has(data: JsonObject, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(data, key);
}

// --- shape --------------------------------------------------------------------------------------

function shapeShop(value: Json | undefined): void {
  need(f.exactKeys(value, SHOP_KEYS), "shop.keys");
  const shop = obj(value);
  need(shop["phone"] === null || f.matches(f.PHONE, shop["phone"]), "shop.phone");
  need(shop["email"] === null || f.matches(f.EMAIL, shop["email"]), "shop.email");
  need(optionalText(shop["address"], 500, true), "shop.address");
  need(optionalText(shop["opening_hours"], 500, true), "shop.opening_hours");
  need(optionalText(shop["delivery_note"], 200), "shop.delivery_note");
  for (const link of list(shop["footer_links"], "shop.footer_links", MAX_FOOTER_LINKS)) {
    need(f.exactKeys(link, LINK_KEYS) && f.isText(obj(link)["label"], 60) && isLocalPath(obj(link)["path"]), "shop.footer_links");
  }
  need(f.isCount(shop["novelty_days"], 1, MAX_NOVELTY_DAYS), "shop.novelty_days");
  need(f.isCount(shop["novelty_count"], 1, MAX_NOVELTY_COUNT), "shop.novelty_count");
}

function shapeAnnouncement(value: Json | undefined): void {
  if (value === null) return;
  need(f.exactKeys(value, ANNOUNCEMENT_KEYS), "announcement.keys");
  const announcement = obj(value);
  need(f.isText(announcement["text"], 300), "announcement.text");
  need(announcement["link"] === null || isLocalPath(announcement["link"]), "announcement.link");
  need(f.isUtc(announcement["starts_at_utc"]), "announcement.starts_at_utc");
  const ends = announcement["ends_at_utc"];
  need(ends === null || (f.isUtc(ends) && ends > (announcement["starts_at_utc"] as string)), "announcement.ends_at_utc");
}

function shapeMaintenance(value: Json | undefined): void {
  need(f.exactKeys(value, MAINTENANCE_KEYS), "maintenance.keys");
  const maintenance = obj(value);
  need(typeof maintenance["active"] === "boolean", "maintenance.active");
  need(optionalText(maintenance["message"], 1000, true) && (maintenance["message"] !== null || !maintenance["active"]), "maintenance.message");
}

function shapeRedirect(value: Json): void {
  need(f.exactKeys(value, REDIRECT_KEYS), "redirect.keys");
  const redirect = obj(value);
  need(isLocalPath(redirect["from_path"]), "redirect.from_path");
  need(isLocalPath(redirect["to_path"]), "redirect.to_path");
  need(f.isInt(redirect["status"]) && REDIRECT_STATUSES.includes(redirect["status"]), "redirect.status");
}

function references(value: Json | undefined, ok: (entry: Json) => boolean): boolean {
  return Array.isArray(value) && value.length >= 1 && value.length <= MAX_REFERENCES && value.every(ok) && new Set(value).size === value.length;
}

function shapeSection(value: Json): void {
  need(f.exactKeys(value, SECTION_KEYS) && typeof obj(value)["type"] === "string" && has(SECTION_DATA as unknown as JsonObject, obj(value)["type"] as string) && isObject(obj(value)["data"]), "section.keys");
  const kind = obj(value)["type"] as string;
  const [allowed, required] = SECTION_DATA[kind] as readonly [readonly string[], readonly string[]];
  const data = obj(obj(value)["data"]);
  need(Object.keys(data).every((key) => allowed.includes(key)) && required.every((key) => has(data, key)), "section.keys");
  need(!has(data, "title") || f.isText(data["title"], 200), "section.title");
  if (kind === "hero") {
    need(!has(data, "text") || f.isText(data["text"], 10000, true), "section.text");
    need(!has(data, "link") || isLocalPath(data["link"]), "section.link");
    need(!has(data, "link_label") || f.isText(data["link_label"], 40), "section.link_label");
    need(!has(data, "image_sha256") || f.isHex64(data["image_sha256"]), "section.image_sha256");
  } else if (kind === "category_grid") {
    need(references(data["categories"], (key) => f.matches(f.CATEGORY_KEY, key) && key.length <= 64), "section.categories");
  } else if (kind === "product_carousel") {
    need(references(data["families"], (key) => isKey(key, "family")), "section.families");
  } else if (kind === "text_image") {
    need(f.isText(data["text"], 10000, true), "section.text");
    need(f.isHex64(data["media_sha"]), "section.media_sha");
    need(!has(data, "image_alt") || data["image_alt"] === "" || f.isText(data["image_alt"], 150), "section.image_alt");
  } else if (kind === "faq") {
    const questions = data["questions"];
    need(Array.isArray(questions) && questions.length >= 1 && questions.length <= MAX_QUESTIONS, "section.questions");
    for (const entry of questions as Json[]) {
      need(f.exactKeys(entry, QUESTION_KEYS) && f.isText(obj(entry)["question"], 300) && f.isText(obj(entry)["answer"], 5000, true), "section.questions");
    }
  } else {
    need(f.isText(data["text"], 20000, true), "section.text");
  }
}

function shapePage(value: Json): void {
  need(f.exactKeys(value, PAGE_KEYS), "page.keys");
  const page = obj(value);
  need(f.isToken(page["key"]), "page.key");
  need(f.matches(PAGE_PATH, page["slug"]) && page["slug"].length <= 200, "page.slug");
  need(f.isText(page["title"], 200), "page.title");
  need(f.isCount(page["revision"], 1), "page.revision");
  need(optionalText(page["seo_title"], 200), "page.seo_title");
  need(optionalText(page["seo_description"], 1000, true), "page.seo_description");
  need(page["canonical"] === null || (f.matches(PAGE_PATH, page["canonical"]) && page["canonical"].length <= 200), "page.canonical");
  const sections = page["sections"];
  need(Array.isArray(sections) && sections.length >= 1 && sections.length <= MAX_SECTIONS, "page.sections");
  for (const section of sections as Json[]) shapeSection(section);
  const nav = page["nav"];
  need(f.exactKeys(nav, NAV_KEYS) && typeof nav["show_in_bar"] === "boolean" && f.isCount(nav["order"], 0, MAX_NAV_ORDER), "page.nav");
}

function shape(value: Json): void {
  need(f.exactKeys(value, ENVELOPE_KEYS), "envelope.keys");
  const doc = obj(value);
  need(f.isToken(doc["publication_id"]), "envelope.publication_id");
  need(f.isCount(doc["content_sequence"], 1), "envelope.content_sequence");
  need(f.isUtc(doc["generated_at_utc"]), "envelope.generated_at_utc");
  need(doc["catalogue_sequence"] === null || f.isCount(doc["catalogue_sequence"], 1), "envelope.catalogue_sequence");
  need(f.isHex64(doc["payload_sha256"]), "envelope.payload_sha256");
  shapeShop(doc["shop"]);
  shapeAnnouncement(doc["announcement"]);
  shapeMaintenance(doc["maintenance"]);
  for (const redirect of list(doc["redirects"], "redirects", MAX_REDIRECTS)) shapeRedirect(redirect);
  for (const page of list(doc["pages"], "pages", MAX_PAGES)) shapePage(page);
  for (const relation of list(doc["relations"], "relations", MAX_REDIRECTS)) {
    need(f.exactKeys(relation, RELATION_KEYS), "relation.keys");
    const r = obj(relation);
    need(isKey(r["source"], "family") && isKey(r["target"], "family"), "relation.families");
    need(typeof r["kind"] === "string" && RELATION_KINDS.includes(r["kind"]), "relation.kind");
    need(f.isCount(r["order"], 1), "relation.order");
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

// --- semantic rules -------------------------------------------------------------------------------

export interface Refs {
  categories: Set<string>;
  families: Set<string>;
  media: Set<string>;
}

/** What a content may name: the categories, families and images of the catalogue served (v1 or v2). */
export function catalogueRefs(catalogue: Json): Refs {
  const doc = (isObject(catalogue) ? catalogue : {}) as Doc;
  return {
    categories: new Set(((doc["categories"] ?? []) as Doc[]).map((entry) => entry["category_key"] as string)),
    families: new Set(((doc["families"] ?? []) as Doc[]).map((entry) => entry["public_family_key"] as string)),
    media: new Set(((doc["media_refs"] ?? []) as Doc[]).map((entry) => entry["sha256"] as string)),
  };
}

/** Every rubrique, family and image a page names is in the catalogue the SITE serves. */
export function pageReferencesServed(page: Doc, refs: Refs): boolean {
  for (const section of page["sections"] as Doc[]) {
    const data = section["data"] as Doc;
    if (((data["categories"] ?? []) as string[]).some((key) => !refs.categories.has(key))) return false;
    if (((data["families"] ?? []) as string[]).some((key) => !refs.families.has(key))) return false;
    if (["media_sha", "image_sha256"].some((key) => has(data, key) && !refs.media.has(data[key]))) return false;
  }
  return true;
}

export function semanticFindings(doc: Doc, refs: Refs): [string[], string[]] {
  const codes = new Set<string>();
  const rules = new Set<string>();
  const invalid = (rule: string): void => {
    codes.add("CONTENT_INVALID");
    rules.add(rule);
  };
  const redirects = doc["redirects"] as Doc[];
  const sources = redirects.map((redirect) => redirect["from_path"] as string);
  const sourceSet = new Set(sources);
  if (!isSorted(sources) || !isUnique(sources)) invalid("redirects.order");
  if (redirects.some((redirect) => redirect["from_path"] === redirect["to_path"])) invalid("redirects.self");
  if (redirects.some((redirect) => sourceSet.has(redirect["to_path"]))) invalid("redirects.chain");
  const pages = doc["pages"] as Doc[];
  const slugs = pages.map((page) => page["slug"] as string);
  if (!isSorted(slugs) || !isUnique(slugs)) invalid("pages.order");
  if (!isUnique(pages.map((page) => page["key"] as string))) invalid("pages.key_unique");
  if (slugs.some((slug) => sourceSet.has(slug))) invalid("redirects.page");
  for (const page of pages) if (!pageReferencesServed(page, refs)) codes.add("REFERENCE_MISSING");
  const relations = doc["relations"] as Doc[];
  if (!isSortedTuples(relations.map((r) => [r["source"], r["kind"], r["order"], r["target"]]))) invalid("relations.order");
  const pairs: string[] = [];
  const orders = new Map<string, number>();
  let self = false;
  for (const relation of relations) {
    pairs.push(`${relation["source"]}\u0000${relation["target"]}`);
    if (relation["source"] === relation["target"]) self = true;
    const group = `${relation["source"]}\u0000${relation["kind"]}`;
    if (relation["order"] !== (orders.get(group) ?? 0) + 1) invalid("relations.order");
    orders.set(group, relation["order"]);
    if (!refs.families.has(relation["source"]) || !refs.families.has(relation["target"])) codes.add("REFERENCE_MISSING");
  }
  if (!isUnique(pairs) || self) invalid("relations.pair");
  return [Array.from(codes).sort(), Array.from(rules).sort()];
}

// --- integrity, signature, acknowledgement -----------------------------------------------------------

export function payloadSha256(doc: Doc): string {
  const preimage: Record<string, unknown> = {};
  for (const key of Object.keys(doc)) if (key !== "payload_sha256") preimage[key] = doc[key];
  return digest(DOMAIN_PAYLOAD, preimage);
}

export function signatureContext(doc: Doc): JsonObject {
  return { content_sequence: doc["content_sequence"], payload_sha256: doc["payload_sha256"], publication_id: doc["publication_id"] };
}

export function activeDigest(doc: Doc): string {
  return digest(DOMAIN_ACTIVE, signatureContext(doc));
}

export function signContent(doc: Doc, keyring: Json, keyId: string): JsonObject {
  return { key_id: keyId, signature: signing.sign(keyring, keyId, signing.SCOPE_PUBLISH, DOMAIN_SIG_CONTENT, signatureContext(doc)) };
}

export function buildAck(doc: Doc, activatedAtUtc: string, keyring: Json, ackKeyId: string): JsonObject {
  const ack: JsonObject = {
    contract_version: ACK_CONTRACT_VERSION,
    outcome: "ACTIVATED",
    ...signatureContext(doc),
    active_digest: activeDigest(doc),
    activated_at_utc: activatedAtUtc,
    key_id: ackKeyId,
  };
  ack["signature"] = signing.sign(keyring, ackKeyId, signing.SCOPE_ACK, DOMAIN_SIG_ACK, ack);
  return ack;
}

export function verifyAck(ack: Json, keyring: Json, content: Doc): Verdict {
  if (!f.exactKeys(ack, ACK_KEYS) || ack["contract_version"] !== ACK_CONTRACT_VERSION || ack["outcome"] !== "ACTIVATED") return rejected(["INTEGRITY_MISMATCH"]);
  const typed =
    f.isCount(ack["content_sequence"], 1) && f.isToken(ack["publication_id"]) && f.isToken(ack["key_id"]) &&
    ["payload_sha256", "active_digest", "signature"].every((key) => f.isHex64(ack[key])) && f.isUtc(ack["activated_at_utc"]);
  if (!typed) return rejected(["INTEGRITY_MISMATCH"]);
  const body: JsonObject = {};
  for (const key of Object.keys(ack)) if (key !== "signature") body[key] = ack[key] as Json;
  if (!signing.verify(keyring, ack["key_id"], ack["signature"], signing.SCOPE_ACK, DOMAIN_SIG_ACK, body)) return rejected(["SIGNATURE_INVALID"]);
  const expected = signatureContext(content);
  if (Object.keys(expected).some((key) => ack[key] !== expected[key]) || ack["active_digest"] !== digest(DOMAIN_ACTIVE, expected)) return rejected(["INTEGRITY_MISMATCH"]);
  return verdict(true, "ACK_VALID");
}

export interface ActiveContent {
  content: Doc;
  ack: Json;
}

export type ContentResult = Verdict & { stage: string; ack: Json; detail: { rules?: string[] } };

export function evaluateContent(
  contentBytes: Uint8Array,
  transport: Json,
  active: ActiveContent | null,
  catalogue: Json,
  nowUtc: string,
  keyring: Json,
  ackKeyId: string,
): ContentResult {
  if (!f.isUtc(nowUtc)) throw new Error("receiver configuration is invalid (fixture error, not a verdict)");
  const stop = (stage: string, codes: string[], detail: { rules?: string[] } = {}): ContentResult => ({ ...rejected(codes), stage, ack: null, detail });
  let parsed: Json;
  try {
    parsed = parseBytes(contentBytes, MAX_BYTES);
  } catch (error) {
    if (error instanceof MalformedPayload) return stop("parse", ["PAYLOAD_MALFORMED"]);
    throw error;
  }
  if (!isCanonical(contentBytes, parsed)) return stop("canonical", ["INTEGRITY_MISMATCH"]);
  if (!isObject(parsed)) return stop("shape", ["CONTENT_INVALID"], { rules: ["envelope.keys"] });
  if (parsed["contract_version"] !== CONTRACT_VERSION) return stop("version", ["SCHEMA_UNSUPPORTED"]);
  const rule = shapeProblem(parsed);
  if (rule !== null) return stop("shape", ["CONTENT_INVALID"], { rules: [rule] });
  const doc = parsed as Doc;
  const [codes, rules] = semanticFindings(doc, catalogueRefs(catalogue));
  if (codes.length > 0) return stop("semantic", codes, rules.length > 0 ? { rules } : {});
  if (doc["payload_sha256"] !== payloadSha256(doc)) return stop("integrity", ["INTEGRITY_MISMATCH"]);
  if (
    !f.exactKeys(transport, TRANSPORT_KEYS) ||
    !signing.verify(keyring, transport["key_id"], transport["signature"], signing.SCOPE_PUBLISH, DOMAIN_SIG_CONTENT, signatureContext(doc))
  ) {
    const problem = signing.keyProblem(keyring, isObject(transport) ? transport["key_id"] : null);
    return stop("signature", ["SIGNATURE_INVALID"], problem !== null ? { rules: [problem] } : {});
  }
  if (active !== null) {
    const previous = active.content;
    if (doc["content_sequence"] < previous["content_sequence"]) return stop("sequence", ["STALE_SEQUENCE"]);
    if (doc["content_sequence"] === previous["content_sequence"]) {
      if (doc["payload_sha256"] === previous["payload_sha256"]) return { ...verdict(true, "REPLAY_ACK"), stage: "sequence", ack: active.ack, detail: {} };
      return stop("sequence", ["SEQUENCE_COLLISION"]);
    }
  }
  return { ...verdict(true, "ACTIVATED"), stage: "activated", ack: buildAck(doc, nowUtc, keyring, ackKeyId), detail: {} };
}

// --- preview of a draft page (line 3.26, B14) ------------------------------------------------------

export const PREVIEW_CONTRACT_VERSION = "site_content_preview.v2";
export const PREVIEW_MAX_BYTES = 1024 * 1024;
/** The SITE keeps a preview 30 minutes at most: a later expiry is refused, so the contract carries the cap. */
export const PREVIEW_MAX_SECONDS = 1800;
export const DOMAIN_PREVIEW = "prodes.c0.site_content_preview.v2";
export const DOMAIN_SIG_PREVIEW = "prodes.c0.sig.site_content_preview.v2";
const PREVIEW_KEYS = ["contract_version", "page", "generated_at_utc", "expires_at_utc", "payload_sha256"];

function shapePreview(value: Json): void {
  need(f.exactKeys(value, PREVIEW_KEYS), "envelope.keys");
  const doc = obj(value);
  need(f.isUtc(doc["generated_at_utc"]), "envelope.generated_at_utc");
  need(f.isUtc(doc["expires_at_utc"]) && doc["expires_at_utc"] > (doc["generated_at_utc"] as string), "envelope.expires_at_utc");
  need(f.isHex64(doc["payload_sha256"]), "envelope.payload_sha256");
  shapePage(doc["page"] as Json);
}

export function previewPayloadSha256(doc: Doc): string {
  const preimage: Record<string, unknown> = {};
  for (const key of Object.keys(doc)) if (key !== "payload_sha256") preimage[key] = doc[key];
  return digest(DOMAIN_PREVIEW, preimage);
}

export function previewSignatureContext(doc: Doc): JsonObject {
  return { generated_at_utc: doc["generated_at_utc"], payload_sha256: doc["payload_sha256"] };
}

export function signPreview(doc: Doc, keyring: Json, keyId: string): JsonObject {
  return { key_id: keyId, signature: signing.sign(keyring, keyId, signing.SCOPE_PUBLISH, DOMAIN_SIG_PREVIEW, previewSignatureContext(doc)) };
}

export type PreviewResult = Verdict & { stage: string; detail: { rules?: string[] }; expires_at_utc?: string; page?: Json };

/** Receiver decision for the preview of ONE draft page: never activated, never acknowledged (twin of ``evaluate_preview``). */
export function evaluatePreview(previewBytes: Uint8Array, transport: Json, catalogue: Json, nowUtc: string, keyring: Json): PreviewResult {
  if (!f.isUtc(nowUtc)) throw new Error("receiver configuration is invalid (fixture error, not a verdict)");
  const stop = (stage: string, codes: string[], detail: { rules?: string[] } = {}): PreviewResult => ({ ...rejected(codes), stage, detail });
  let parsed: Json;
  try {
    parsed = parseBytes(previewBytes, PREVIEW_MAX_BYTES);
  } catch (error) {
    if (error instanceof MalformedPayload) return stop("parse", ["PAYLOAD_MALFORMED"]);
    throw error;
  }
  if (!isCanonical(previewBytes, parsed)) return stop("canonical", ["INTEGRITY_MISMATCH"]);
  if (!isObject(parsed)) return stop("shape", ["CONTENT_INVALID"], { rules: ["envelope.keys"] });
  if (parsed["contract_version"] !== PREVIEW_CONTRACT_VERSION) return stop("version", ["SCHEMA_UNSUPPORTED"]);
  try {
    shapePreview(parsed);
  } catch (error) {
    if (error instanceof Bad) return stop("shape", ["CONTENT_INVALID"], { rules: [error.rule] });
    throw error;
  }
  const doc = parsed as Doc;
  if (!pageReferencesServed(doc["page"], catalogueRefs(catalogue))) return stop("semantic", ["REFERENCE_MISSING"]);
  if (doc["payload_sha256"] !== previewPayloadSha256(doc)) return stop("integrity", ["INTEGRITY_MISMATCH"]);
  if (
    !f.exactKeys(transport, TRANSPORT_KEYS) ||
    !signing.verify(keyring, transport["key_id"], transport["signature"], signing.SCOPE_PUBLISH, DOMAIN_SIG_PREVIEW, previewSignatureContext(doc))
  ) {
    const problem = signing.keyProblem(keyring, isObject(transport) ? transport["key_id"] : null);
    return stop("signature", ["SIGNATURE_INVALID"], problem !== null ? { rules: [problem] } : {});
  }
  const remaining = utcSeconds(doc["expires_at_utc"]) - utcSeconds(nowUtc);
  if (remaining <= 0 || remaining > PREVIEW_MAX_SECONDS) return stop("expiry", ["PREVIEW_EXPIRED"]);
  return { ...verdict(true, "PREVIEW_VALID"), stage: "valid", detail: {}, expires_at_utc: doc["expires_at_utc"], page: doc["page"] };
}
