// site_activation.v1: receiver decision, ACK, and coverage checks on both sides.
// Twin of c0/python/c0_contracts/activation.py (same stage order, same codes, same result keys).

import * as f from "./formats";
import { isKey } from "./identity";
import { Json, JsonObject, MalformedPayload, digest, isCanonical, isObject, parseBytes, sha256Hex } from "./jsonc";
import * as signing from "./signing";
import * as snap from "./snapshot";
import { Verdict, rejected, verdict } from "./errors";

export const ACK_CONTRACT_VERSION = "site_activation.v1";
export const DOMAIN_ACTIVE = "prodes.c0.active_generation.v1";
const ACK_KEYS = [
  "contract_version", "outcome", "publication_id", "projection_id", "catalogue_sequence",
  "payload_sha256", "scope_key", "active_digest", "activated_at_utc", "key_id", "signature",
];
const TRANSPORT_KEYS = ["key_id", "signature"];
const POLICY_KEYS = ["max_withdrawals_without_release", "released_expected_withdrawals_digest"];
export const MANIFEST_VERSION = "c0.private_coverage_manifest.v1";
const MANIFEST_KEYS = ["manifest_version", "scope_key", "as_of_utc", "entries"];
const MANIFEST_ENTRY_KEYS = ["public_item_key", "partition", "reason"];
const PARTITIONS = ["READY", "NON_READY", "EXCLUDED", "UNKNOWN"];

function startsWith(data: Uint8Array, offset: number, bytes: number[]): boolean {
  if (data.length < offset + bytes.length) return false;
  return bytes.every((byte, index) => data[offset + index] === byte);
}

const MAGIC: Readonly<Record<string, (data: Uint8Array) => boolean>> = {
  "image/png": (data) => startsWith(data, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  "image/jpeg": (data) => startsWith(data, 0, [0xff, 0xd8, 0xff]),
  "image/webp": (data) => startsWith(data, 0, [0x52, 0x49, 0x46, 0x46]) && startsWith(data, 8, [0x57, 0x45, 0x42, 0x50]),
};

export interface Policy {
  max_withdrawals_without_release: number | null;
  released_expected_withdrawals_digest: string | null;
}

export interface Active {
  snapshot: snap.Snapshot;
  ack: Json;
}

export type ActivationResult = Verdict & { stage: string; ack: Json; detail: snap.Detail };

export function signatureContext(doc: snap.Snapshot): JsonObject {
  return {
    catalogue_sequence: doc.catalogue_sequence,
    payload_sha256: doc.payload_sha256,
    projection_id: doc.projection_id,
    publication_id: doc.publication_id,
    scope_key: doc.scope_key,
  };
}

export function activeDigest(doc: snap.Snapshot): string {
  return digest(DOMAIN_ACTIVE, signatureContext(doc));
}

export function buildAck(doc: snap.Snapshot, activatedAtUtc: string, keyring: Json, ackKeyId: string): JsonObject {
  const ack: JsonObject = {
    contract_version: ACK_CONTRACT_VERSION,
    outcome: "ACTIVATED",
    ...signatureContext(doc),
    active_digest: activeDigest(doc),
    activated_at_utc: activatedAtUtc,
    key_id: ackKeyId,
  };
  ack["signature"] = signing.sign(keyring, ackKeyId, signing.SCOPE_ACK, signing.DOMAIN_SIG_ACK, ack);
  return ack;
}

export function verifyAck(ack: Json, keyring: Json, publication: snap.Snapshot): Verdict {
  if (!f.exactKeys(ack, ACK_KEYS) || ack["contract_version"] !== ACK_CONTRACT_VERSION || ack["outcome"] !== "ACTIVATED") {
    return rejected(["INTEGRITY_MISMATCH"]);
  }
  const typed =
    f.isCount(ack["catalogue_sequence"], 1) &&
    ["publication_id", "projection_id", "scope_key", "key_id"].every((key) => f.isToken(ack[key])) &&
    ["payload_sha256", "active_digest", "signature"].every((key) => f.isHex64(ack[key])) &&
    f.isUtc(ack["activated_at_utc"]);
  if (!typed) return rejected(["INTEGRITY_MISMATCH"]); // review R-04
  const body: JsonObject = {};
  for (const key of Object.keys(ack)) if (key !== "signature") body[key] = ack[key] as Json;
  if (!signing.verify(keyring, ack["key_id"], ack["signature"], signing.SCOPE_ACK, signing.DOMAIN_SIG_ACK, body)) {
    return rejected(["SIGNATURE_INVALID"]);
  }
  const expected = signatureContext(publication);
  const mismatch = Object.keys(expected).some((key) => ack[key] !== expected[key]);
  if (mismatch || ack["active_digest"] !== digest(DOMAIN_ACTIVE, expected)) return rejected(["INTEGRITY_MISMATCH"]);
  return verdict(true, "ACK_VALID");
}

// --- coverage, receiver side ------------------------------------------------------------------

function publishedKeys(doc: snap.Snapshot): Set<string> {
  return new Set(snap.allItems(doc).map((item) => item.public_item_key));
}

function difference(a: Set<string>, b: Set<string>): Set<string> {
  return new Set(Array.from(a).filter((key) => !b.has(key)));
}

function setEquals(a: Set<string>, b: Set<string>): boolean {
  return a.size === b.size && Array.from(a).every((key) => b.has(key));
}

export function identityCodes(previous: snap.Snapshot | null, doc: snap.Snapshot): string[] {
  if (previous === null) return [];
  const newRegistry = new Map<string, snap.RegistryEntry>();
  for (const entry of doc.identity_registry) newRegistry.set(entry.public_item_key, entry);
  const published = publishedKeys(doc);
  for (const entry of previous.identity_registry) {
    const key = entry.public_item_key;
    if (published.has(key)) return ["IDENTITY_CONFLICT"];
    const current = newRegistry.get(key);
    if (current === undefined) return ["IDENTITY_CONFLICT"];
    if (entry.status === "RETIRED" && current.status !== "RETIRED") return ["IDENTITY_CONFLICT"]; // RETIRED is terminal
    if (entry.status === "SUPERSEDED" && current.status === "SUPERSEDED" && current.superseded_by !== entry.superseded_by) {
      return ["IDENTITY_CONFLICT"]; // superseded_by is immutable (review R-03)
    }
  }
  return [];
}

export function coverageCodes(doc: snap.Snapshot): string[] {
  const c = doc.coverage;
  const partitions = c.ready_count + c.non_ready_count + c.explicit_exclusion_count;
  if (c.unknown_count !== 0 || c.source_universe_count !== partitions) return ["COVERAGE_UNPROVEN"];
  if (c.ready_count !== doc.manifest_counts.items) return ["COVERAGE_UNPROVEN"];
  return [];
}

/** Tolerance on the producer clock: as_of_utc may exceed the SITE server clock by at most this (R-07). */
export const AS_OF_FUTURE_TOLERANCE_SECONDS = 300;

/** Seconds since the epoch of a C0 UTC instant (already format-checked). */
export function utcSeconds(instant: string): number {
  const [year, month, day, hour, minute, second] = instant.slice(0, 19).split(/[-T:]/).map(Number) as [number, number, number, number, number, number];
  return Date.UTC(year, month - 1, day, hour, minute, second) / 1000;
}

/** Why the publication is held (STAGE_HOLD), or null. nowUtc is the SITE server clock. */
export function holdReason(previous: snap.Snapshot | null, doc: snap.Snapshot, policy: Policy, nowUtc: string): string | null {
  const c = doc.coverage;
  if (utcSeconds(doc.as_of_utc) > utcSeconds(nowUtc) + AS_OF_FUTURE_TOLERANCE_SECONDS) return "AS_OF_IN_FUTURE";
  const withdrawn = new Set(c.expected_withdrawals.map((withdrawal) => withdrawal.public_item_key));
  if (previous === null) {
    if (c.previous_catalogue_sequence !== null || withdrawn.size > 0) return "NO_ACTIVE_BASE";
  } else {
    if (c.previous_catalogue_sequence !== previous.catalogue_sequence) return "BASE_MISMATCH";
    if (c.previous_payload_sha256 !== previous.payload_sha256) return "BASE_MISMATCH";
    if (!setEquals(difference(publishedKeys(previous), publishedKeys(doc)), withdrawn)) return "UNEXPLAINED_WITHDRAWALS";
  }
  const limit = policy.max_withdrawals_without_release;
  if (limit !== null && withdrawn.size > limit) {
    if (policy.released_expected_withdrawals_digest !== c.expected_withdrawals_digest) return "RELEASE_REQUIRED";
  }
  return null;
}

export function holdCodes(previous: snap.Snapshot | null, doc: snap.Snapshot, policy: Policy, nowUtc: string): string[] {
  return holdReason(previous, doc, policy, nowUtc) === null ? [] : ["STAGE_HOLD"];
}

export function checkCoverage(previous: snap.Snapshot | null, doc: snap.Snapshot, policy: Policy, nowUtc: string): string[] {
  for (const codes of [identityCodes(previous, doc), coverageCodes(doc), holdCodes(previous, doc, policy, nowUtc)]) {
    if (codes.length > 0) return codes;
  }
  return [];
}

export function safetyCodes(previous: snap.Snapshot | null, doc: snap.Snapshot, nowUtc: string): string[] {
  if (previous !== null && doc.as_of_utc < previous.as_of_utc) return ["CATALOG_UNSAFE"];
  for (const item of snap.allItems(doc)) {
    if (!item.public_sell_price_windows.some((w) => w.valid_until_utc === null || w.valid_until_utc > nowUtc)) return ["CATALOG_UNSAFE"];
  }
  return [];
}

export function mediaCodes(doc: snap.Snapshot, store: Map<string, Uint8Array>): string[] {
  const codes = new Set<string>();
  for (const media of doc.media_refs) {
    const data = store.get(media.sha256);
    if (data === undefined) {
      codes.add("MEDIA_MISSING");
      continue;
    }
    if (sha256Hex(data) !== media.sha256 || data.length !== media.size) {
      codes.add("MEDIA_HASH_MISMATCH");
      continue;
    }
    const check = MAGIC[media.mime];
    if (check === undefined || !check(data)) codes.add("MEDIA_TYPE_REJECTED");
  }
  return Array.from(codes).sort();
}

function policyOk(policy: Json): policy is JsonObject {
  if (!f.exactKeys(policy, POLICY_KEYS)) return false;
  const limit = policy["max_withdrawals_without_release"];
  const released = policy["released_expected_withdrawals_digest"];
  return (limit === null || f.isCount(limit)) && (released === null || f.isHex64(released));
}

export function evaluatePublication(
  snapshotBytes: Uint8Array,
  transport: Json,
  active: Active | null,
  mediaStore: Map<string, Uint8Array>,
  policy: Json,
  nowUtc: string,
  keyring: Json,
  ackKeyId: string,
): ActivationResult {
  if (!policyOk(policy) || !f.isUtc(nowUtc)) throw new Error("receiver configuration is invalid (fixture error, not a verdict)");
  const stop = (stage: string, codes: string[], outcome = "REJECTED", detail: snap.Detail = {}): ActivationResult => ({
    ...rejected(codes, outcome),
    stage,
    ack: null,
    detail,
  });
  let parsed: Json;
  try {
    parsed = parseBytes(snapshotBytes, snap.MAX_BYTES);
  } catch (error) {
    if (error instanceof MalformedPayload) return stop("parse", ["PAYLOAD_MALFORMED"]);
    throw error;
  }
  if (!isCanonical(snapshotBytes, parsed)) return stop("canonical", ["INTEGRITY_MISMATCH"]);
  if (!isObject(parsed)) return stop("shape", ["SNAPSHOT_INVALID"], "REJECTED", { rules: ["envelope.keys"] });
  if (parsed["contract_version"] !== snap.CONTRACT_VERSION) return stop("version", ["SCHEMA_UNSUPPORTED"]);
  const rule = snap.shapeProblem(parsed);
  if (rule !== null) return stop("shape", ["SNAPSHOT_INVALID"], "REJECTED", { rules: [rule] });
  const doc = parsed as unknown as snap.Snapshot;
  const [semantic, rules] = snap.semanticFindings(doc);
  if (semantic.length > 0) return stop("semantic", semantic, "REJECTED", rules.length > 0 ? { rules } : {});
  let codes: string[];
  codes = snap.integrityCodes(doc);
  if (codes.length > 0) return stop("integrity", codes, "REJECTED", snap.integrityDetail(codes));
  if (
    !f.exactKeys(transport, TRANSPORT_KEYS) ||
    !signing.verify(keyring, transport["key_id"], transport["signature"], signing.SCOPE_PUBLISH, signing.DOMAIN_SIG_SNAPSHOT, signatureContext(doc))
  ) {
    const problem = signing.keyProblem(keyring, isObject(transport) ? transport["key_id"] : null);
    return stop("signature", ["SIGNATURE_INVALID"], "REJECTED", problem !== null ? { rules: [problem] } : {});
  }
  const previous = active !== null ? active.snapshot : null;
  if (previous !== null && active !== null) {
    if (doc.catalogue_sequence < previous.catalogue_sequence) return stop("sequence", ["STALE_SEQUENCE"]);
    if (doc.catalogue_sequence === previous.catalogue_sequence) {
      if (doc.payload_sha256 === previous.payload_sha256) return { ...verdict(true, "REPLAY_ACK"), stage: "sequence", ack: active.ack, detail: {} };
      return stop("sequence", ["SEQUENCE_COLLISION"]);
    }
  }
  codes = mediaCodes(doc, mediaStore);
  if (codes.length > 0) return stop("media", codes);
  codes = identityCodes(previous, doc);
  if (codes.length > 0) return stop("identity", codes);
  codes = coverageCodes(doc);
  if (codes.length > 0) return stop("coverage", codes);
  const reason = holdReason(previous, doc, policy as unknown as Policy, nowUtc);
  if (reason !== null) return stop("hold", ["STAGE_HOLD"], "STAGE_HOLD", { hold_reason: reason });
  codes = safetyCodes(previous, doc, nowUtc);
  if (codes.length > 0) return stop("safety", codes);
  return { ...verdict(true, "ACTIVATED"), stage: "activated", ack: buildAck(doc, nowUtc, keyring, ackKeyId), detail: {} };
}

// --- coverage, producer side ------------------------------------------------------------------

export function sourceCoverageDigest(manifest: Json): string {
  return digest(snap.DOMAIN_SOURCE_COVERAGE, manifest);
}

function manifestOk(manifest: Json): manifest is JsonObject {
  if (!f.exactKeys(manifest, MANIFEST_KEYS) || manifest["manifest_version"] !== MANIFEST_VERSION) return false;
  if (!f.isToken(manifest["scope_key"]) || !f.isUtc(manifest["as_of_utc"])) return false;
  const entries = manifest["entries"];
  if (!Array.isArray(entries)) return false;
  for (const entry of entries) {
    if (!f.exactKeys(entry, MANIFEST_ENTRY_KEYS) || !isKey(entry["public_item_key"], "item")) return false;
    if (typeof entry["partition"] !== "string" || !PARTITIONS.includes(entry["partition"])) return false;
    if (entry["partition"] === "READY") {
      if (entry["reason"] !== null) return false;
    } else if (!f.isToken(entry["reason"])) {
      return false;
    }
  }
  const keys = entries.map((entry) => (entry as JsonObject)["public_item_key"] as string);
  const sorted = [...keys].sort();
  return keys.every((key, index) => key === sorted[index]) && new Set(keys).size === keys.length;
}

export function checkSourceCoverage(manifest: Json, docValue: Json): Verdict {
  const codes = snap.validateSnapshot(docValue);
  if (codes.length > 0) return rejected(codes);
  if (!manifestOk(manifest)) return rejected(["COVERAGE_UNPROVEN"]);
  const doc = docValue as unknown as snap.Snapshot;
  const c = doc.coverage;
  const entries = manifest["entries"] as JsonObject[];
  const count = (partition: string): number => entries.filter((entry) => entry["partition"] === partition).length;
  const ready = new Set(entries.filter((entry) => entry["partition"] === "READY").map((entry) => entry["public_item_key"] as string));
  const proven =
    manifest["scope_key"] === doc.scope_key &&
    manifest["as_of_utc"] === doc.as_of_utc &&
    sourceCoverageDigest(manifest) === c.source_coverage_digest &&
    count("UNKNOWN") === 0 &&
    c.unknown_count === 0 &&
    c.source_universe_count === entries.length &&
    c.ready_count === count("READY") &&
    c.non_ready_count === count("NON_READY") &&
    c.explicit_exclusion_count === count("EXCLUDED") &&
    setEquals(ready, publishedKeys(doc));
  return proven ? verdict(true, "COVERAGE_PROVEN") : rejected(["COVERAGE_UNPROVEN"]);
}
