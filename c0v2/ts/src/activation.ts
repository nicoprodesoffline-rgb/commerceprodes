// Receiver of a SITE that reads site_snapshot.v1 and site_snapshot.v2 (contract c0_site_v2.md §3).
// Twin of c0v2/python/c0_contracts_v2/activation.py. A v1 document goes to the frozen v1 receiver; a v2 document runs the same
// stages with the v2 rules. Same publication key (v2 signature domain), same site_activation.v1 acknowledgement.

import * as f from "../../../c0/ts/src/formats";
import { isKey } from "../../../c0/ts/src/identity";
import { Json, JsonObject, MalformedPayload, isCanonical, isObject, parseBytes, sha256Hex } from "../../../c0/ts/src/jsonc";
import * as signing from "../../../c0/ts/src/signing";
import * as v1 from "../../../c0/ts/src/activation";
import * as v1snap from "../../../c0/ts/src/snapshot";
import { Verdict, rejected, verdict } from "./errors";
import * as snap from "./snapshot";

export const DOMAIN_SIG_SNAPSHOT = "prodes.c0.sig.site_snapshot.v2";
export const READABLE_VERSIONS = [v1snap.CONTRACT_VERSION, snap.CONTRACT_VERSION];
const TRANSPORT_KEYS = ["key_id", "signature"];
const POLICY_KEYS = ["max_withdrawals_without_release", "released_expected_withdrawals_digest"];
const MANIFEST_KEYS = ["manifest_version", "scope_key", "as_of_utc", "entries"];
const MANIFEST_ENTRY_KEYS = ["public_item_key", "partition", "reason"];
const PARTITIONS = ["READY", "NON_READY", "EXCLUDED", "UNKNOWN"];

export const signatureContext = v1.signatureContext;
export const buildAck = v1.buildAck;
export const verifyAck = v1.verifyAck;

function startsWith(data: Uint8Array, offset: number, bytes: number[]): boolean {
  if (data.length < offset + bytes.length) return false;
  return bytes.every((byte, index) => data[offset + index] === byte);
}

const MAGIC: Readonly<Record<string, (data: Uint8Array) => boolean>> = {
  "image/png": (data) => startsWith(data, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  "image/jpeg": (data) => startsWith(data, 0, [0xff, 0xd8, 0xff]),
  "image/webp": (data) => startsWith(data, 0, [0x52, 0x49, 0x46, 0x46]) && startsWith(data, 8, [0x57, 0x45, 0x42, 0x50]),
  "application/pdf": (data) => startsWith(data, 0, [0x25, 0x50, 0x44, 0x46, 0x2d]),
};

export interface Active {
  snapshot: snap.Doc;
  ack: Json;
}

export type ActivationResult = Verdict & { stage: string; ack: Json; detail: snap.Detail };

export function signPublication(doc: snap.Doc, keyring: Json, keyId: string): JsonObject {
  return { key_id: keyId, signature: signing.sign(keyring, keyId, signing.SCOPE_PUBLISH, DOMAIN_SIG_SNAPSHOT, signatureContext(doc as v1snap.Snapshot)) };
}

export function mediaCodes(doc: snap.Doc, store: Map<string, Uint8Array>): string[] {
  const codes = new Set<string>();
  for (const [sha256, mime, size] of snap.servedMedia(doc)) {
    const data = store.get(sha256);
    if (data === undefined) {
      codes.add("MEDIA_MISSING");
      continue;
    }
    if (sha256Hex(data) !== sha256 || data.length !== size) {
      codes.add("MEDIA_HASH_MISMATCH");
      continue;
    }
    const check = MAGIC[mime];
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
  if (parsed["contract_version"] === v1snap.CONTRACT_VERSION) {
    const previous = active === null ? null : { snapshot: active.snapshot as unknown as v1snap.Snapshot, ack: active.ack };
    return v1.evaluatePublication(snapshotBytes, transport, previous, mediaStore, policy, nowUtc, keyring, ackKeyId);
  }
  if (parsed["contract_version"] !== snap.CONTRACT_VERSION) return stop("version", ["SCHEMA_UNSUPPORTED"]);
  const rule = snap.shapeProblem(parsed);
  if (rule !== null) return stop("shape", ["SNAPSHOT_INVALID"], "REJECTED", { rules: [rule] });
  const doc = parsed as snap.Doc;
  const [semantic, rules] = snap.semanticFindings(doc);
  if (semantic.length > 0) return stop("semantic", semantic, "REJECTED", rules.length > 0 ? { rules } : {});
  let codes = snap.integrityCodes(doc);
  if (codes.length > 0) return stop("integrity", codes, "REJECTED", snap.integrityDetail(codes));
  const v1doc = doc as unknown as v1snap.Snapshot;
  if (
    !f.exactKeys(transport, TRANSPORT_KEYS) ||
    !signing.verify(keyring, transport["key_id"], transport["signature"], signing.SCOPE_PUBLISH, DOMAIN_SIG_SNAPSHOT, signatureContext(v1doc))
  ) {
    const problem = signing.keyProblem(keyring, isObject(transport) ? transport["key_id"] : null);
    return stop("signature", ["SIGNATURE_INVALID"], "REJECTED", problem !== null ? { rules: [problem] } : {});
  }
  const previous = active !== null ? (active.snapshot as unknown as v1snap.Snapshot) : null;
  if (previous !== null && active !== null) {
    if (v1doc.catalogue_sequence < previous.catalogue_sequence) return stop("sequence", ["STALE_SEQUENCE"]);
    if (v1doc.catalogue_sequence === previous.catalogue_sequence) {
      if (v1doc.payload_sha256 === previous.payload_sha256) return { ...verdict(true, "REPLAY_ACK"), stage: "sequence", ack: active.ack, detail: {} };
      return stop("sequence", ["SEQUENCE_COLLISION"]);
    }
  }
  codes = mediaCodes(doc, mediaStore);
  if (codes.length > 0) return stop("media", codes);
  codes = v1.identityCodes(previous, v1doc);
  if (codes.length > 0) return stop("identity", codes);
  codes = v1.coverageCodes(v1doc);
  if (codes.length > 0) return stop("coverage", codes);
  const reason = v1.holdReason(previous, v1doc, policy as unknown as v1.Policy, nowUtc);
  if (reason !== null) return stop("hold", ["STAGE_HOLD"], "STAGE_HOLD", { hold_reason: reason });
  codes = v1.safetyCodes(previous, v1doc, nowUtc);
  if (codes.length > 0) return stop("safety", codes);
  return { ...verdict(true, "ACTIVATED"), stage: "activated", ack: buildAck(v1doc, nowUtc, keyring, ackKeyId), detail: {} };
}

function manifestOk(manifest: Json): manifest is JsonObject {
  if (!f.exactKeys(manifest, MANIFEST_KEYS) || manifest["manifest_version"] !== v1.MANIFEST_VERSION) return false;
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
  const doc = docValue as snap.Doc;
  const c = doc["coverage"];
  const entries = manifest["entries"] as JsonObject[];
  const count = (partition: string): number => entries.filter((entry) => entry["partition"] === partition).length;
  const ready = new Set(entries.filter((entry) => entry["partition"] === "READY").map((entry) => entry["public_item_key"] as string));
  const published = new Set(snap.allItems(doc).map((item) => item["public_item_key"] as string));
  const proven =
    manifest["scope_key"] === doc["scope_key"] &&
    manifest["as_of_utc"] === doc["as_of_utc"] &&
    v1.sourceCoverageDigest(manifest) === c["source_coverage_digest"] &&
    count("UNKNOWN") === 0 &&
    c["unknown_count"] === 0 &&
    c["source_universe_count"] === entries.length &&
    c["ready_count"] === count("READY") &&
    c["non_ready_count"] === count("NON_READY") &&
    c["explicit_exclusion_count"] === count("EXCLUDED") &&
    ready.size === published.size &&
    Array.from(ready).every((key) => published.has(key));
  return proven ? verdict(true, "COVERAGE_PROVEN") : rejected(["COVERAGE_UNPROVEN"]);
}
