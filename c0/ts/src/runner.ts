// Fixture case runner, twin of c0/python/c0_contracts/runner.py.
// References inside a case input: {"$doc": path} (strict parse), {"$bytes": path}, {"$media": path}.

import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import * as activation from "./activation";
import * as business from "./business";
import * as events from "./events";
import { decodeSequence, keyProblem, Namespace } from "./identity";
import { Json, JsonObject, MalformedPayload, canonicalBytes, isObject, parseBytes, sha256Hex } from "./jsonc";
import * as snap from "./snapshot";
import { rejected, verdict } from "./errors";

export const FIXTURE_MAX_BYTES = 64 * 1024 * 1024;
export const FIXTURES = resolve(__dirname, "..", "..", "..", "fixtures");

type Resolved = Json | Uint8Array | Resolved[] | { [key: string]: Resolved };

export function loadJson(path: string): Json {
  return parseBytes(readFileSync(path), FIXTURE_MAX_BYTES);
}

export function resolveRefs(value: Json, root: string): Resolved {
  if (isObject(value)) {
    const keys = Object.keys(value);
    if (keys.length === 1) {
      const key = keys[0] as string;
      const target = value[key];
      if (key === "$doc" && typeof target === "string") return loadJson(join(root, target));
      if ((key === "$bytes" || key === "$media") && typeof target === "string") return readFileSync(join(root, target));
    }
    const out: { [key: string]: Resolved } = {};
    for (const key of keys) out[key] = resolveRefs(value[key] as Json, root);
    return out;
  }
  if (Array.isArray(value)) return value.map((item) => resolveRefs(item, root));
  return value;
}

type Data = { [key: string]: Resolved };

function bytes(value: Resolved | undefined): Uint8Array {
  if (!(value instanceof Uint8Array)) throw new Error("bytes expected");
  return value;
}

function json(value: Resolved | undefined): Json {
  return value as Json;
}

export function runFunction(name: string, data: Data): JsonObject {
  switch (name) {
    case "canonical_bytes": {
      try {
        const value = parseBytes(bytes(data["document"]), FIXTURE_MAX_BYTES);
        return { ...verdict(true, "CANONICAL"), canonical_sha256: sha256Hex(canonicalBytes(value)) };
      } catch (error) {
        if (error instanceof MalformedPayload) return { ...rejected(["PAYLOAD_MALFORMED"]), canonical_sha256: null };
        throw error;
      }
    }
    case "check_public_key": {
      const namespace = data["namespace"] as Namespace;
      const problem = keyProblem(data["value"], namespace);
      if (problem !== null) return { ...rejected([problem]), sequence: null };
      return { ...verdict(true, "VALID"), sequence: decodeSequence(data["value"] as string, namespace) };
    }
    case "evaluate_publication": {
      const store = new Map<string, Uint8Array>();
      for (const entry of data["media_store"] as Data[]) store.set(entry["sha256"] as string, bytes(entry["file"]));
      const active = data["active"] as Data | null;
      const result = activation.evaluatePublication(
        bytes(data["snapshot"]),
        json(data["transport"]),
        active === null ? null : { snapshot: active["snapshot"] as unknown as snap.Snapshot, ack: json(active["ack"]) },
        store,
        json(data["policy"]),
        data["now_utc"] as string,
        json(data["keyring"]),
        data["ack_key_id"] as string,
      );
      return result as unknown as JsonObject;
    }
    case "check_source_coverage":
      return activation.checkSourceCoverage(json(data["manifest"]), json(data["snapshot"])) as unknown as JsonObject;
    case "verify_ack":
      return activation.verifyAck(json(data["ack"]), json(data["keyring"]), data["publication"] as unknown as snap.Snapshot) as unknown as JsonObject;
    case "select_price":
      return business.selectPrice(json(data["generation"]), json(data["public_item_key"]), json(data["variant_axes"]), json(data["quantity"]), json(data["instant_utc"])) as unknown as JsonObject;
    case "validate_quote_request":
      return business.validateQuoteRequest(bytes(data["request"]), json(data["generation"]), json(data["register"]), data["now_utc"] as string) as unknown as JsonObject;
    case "validate_order_submit":
      return business.validateOrderSubmit(bytes(data["request"]), json(data["generation"]), json(data["register"]), data["now_utc"] as string) as unknown as JsonObject;
    case "lookup_receipt":
      return business.lookupReceipt(json(data["request"]), json(data["records"])) as unknown as JsonObject;
    case "validate_event":
      return events.validateEvent(bytes(data["event"]), json(data["consumed"])) as unknown as JsonObject;
    case "validate_poll_request":
      return events.validatePollRequest(json(data["request"]), json(data["keyring"]), json(data["issued_cursors"])) as unknown as JsonObject;
    default:
      throw new Error(`unknown function ${name}`);
  }
}

export interface Case {
  case_id: string;
  scenario: string;
  data_label: string;
  function: string;
  input: Json;
}

export function runCase(item: Case, root: string = FIXTURES): JsonObject {
  return runFunction(item.function, resolveRefs(item.input, root) as Data);
}

export function registryEntry(result: JsonObject): JsonObject {
  return {
    accepted: result["accepted"] as Json,
    outcome: result["outcome"] as Json,
    error_codes: result["error_codes"] as Json,
    result_sha256: sha256Hex(canonicalBytes(result)),
  };
}

export function walk(directory: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) out.push(...walk(path));
    else if (entry.isFile()) out.push(path);
  }
  return out.sort();
}

export function posixRelative(root: string, path: string): string {
  return relative(root, path).split(sep).join("/");
}

export function caseFiles(root: string = FIXTURES): string[] {
  return walk(join(root, "cases")).filter((path) => path.endsWith(".json"));
}

export function readCase(path: string): Case {
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(readFileSync(path))) as Case;
}
