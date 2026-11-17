// Fixture case runner of the v2 contracts, twin of c0v2/python/c0_contracts_v2/runner.py (same case files, same results).

import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import * as v1activation from "../../../c0/ts/src/activation";
import { Json, JsonObject, MalformedPayload, canonicalBytes, isObject, parseBytes, sha256Hex } from "../../../c0/ts/src/jsonc";
import * as v1snap from "../../../c0/ts/src/snapshot";
import * as activation from "./activation";
import * as content from "./content";
import { Doc } from "./snapshot";

export const FIXTURE_MAX_BYTES = 64 * 1024 * 1024;

/** c0v2/fixtures, found from the compiled file (c0v2/ts/dist/c0v2/ts/src) or from the source tree. */
function findFixtures(): string {
  let current = __dirname;
  for (let depth = 0; depth < 8; depth += 1) {
    const candidate = resolve(current, "c0v2", "fixtures");
    try {
      readFileSync(join(candidate, "VERDICTS.json"));
      return candidate;
    } catch {
      current = resolve(current, "..");
    }
  }
  throw new Error("c0v2/fixtures not found");
}

export const FIXTURES = findFixtures();

type Resolved = Json | Uint8Array | Resolved[] | { [key: string]: Resolved };
type Data = { [key: string]: Resolved };

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

function bytes(value: Resolved | undefined): Uint8Array {
  if (!(value instanceof Uint8Array)) throw new Error("bytes expected");
  return value;
}

function json(value: Resolved | undefined): Json {
  return value as Json;
}

export function runFunction(name: string, data: Data): JsonObject {
  switch (name) {
    case "evaluate_publication":
    case "evaluate_publication_v1": {
      const store = new Map<string, Uint8Array>();
      for (const entry of data["media_store"] as Data[]) store.set(entry["sha256"] as string, bytes(entry["file"]));
      const active = data["active"] as Data | null;
      const args = [bytes(data["snapshot"]), json(data["transport"])] as const;
      const rest = [store, json(data["policy"]), data["now_utc"] as string, json(data["keyring"]), data["ack_key_id"] as string] as const;
      if (name === "evaluate_publication") {
        const previous = active === null ? null : { snapshot: active["snapshot"] as unknown as Doc, ack: json(active["ack"]) };
        return activation.evaluatePublication(...args, previous, ...rest) as unknown as JsonObject;
      }
      const previous = active === null ? null : { snapshot: active["snapshot"] as unknown as v1snap.Snapshot, ack: json(active["ack"]) };
      return v1activation.evaluatePublication(...args, previous, ...rest) as unknown as JsonObject;
    }
    case "check_source_coverage":
      return activation.checkSourceCoverage(json(data["manifest"]), json(data["snapshot"])) as unknown as JsonObject;
    case "verify_ack":
      return activation.verifyAck(json(data["ack"]), json(data["keyring"]), data["publication"] as unknown as v1snap.Snapshot) as unknown as JsonObject;
    case "evaluate_content": {
      const active = data["active"] as Data | null;
      return content.evaluateContent(
        bytes(data["content"]),
        json(data["transport"]),
        active === null ? null : { content: active["content"] as unknown as Doc, ack: json(active["ack"]) },
        json(data["catalogue"]),
        data["now_utc"] as string,
        json(data["keyring"]),
        data["ack_key_id"] as string,
      ) as unknown as JsonObject;
    }
    case "verify_content_ack":
      return content.verifyAck(json(data["ack"]), json(data["keyring"]), data["content"] as unknown as Doc) as unknown as JsonObject;
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

export function readCase(path: string): Case {
  return JSON.parse(new TextDecoder().decode(readFileSync(path))) as Case;
}

export function runCase(item: Case, root: string = FIXTURES): JsonObject {
  return runFunction(item.function, resolveRefs(item.input, root) as Data);
}

export function resultSha256(result: JsonObject): string {
  return sha256Hex(canonicalBytes(result));
}

export function caseFiles(root: string = FIXTURES): string[] {
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile() && entry.name.endsWith(".json")) files.push(path);
    }
  };
  walk(join(root, "cases"));
  return files.sort();
}

export { MalformedPayload };
