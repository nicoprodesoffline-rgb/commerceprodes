// C0 parity, TypeScript side: every fixture case gives the declared verdict and the expected bytes.
// Writes dist/verdicts.ts.json (canonical JSON, no timestamp) for c0/tools/compare_verdicts.py.

import { test } from "node:test";
import * as assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { ERROR_CODES, NOT_TESTABLE_IN_C0 } from "../src/errors";
import { Json, JsonObject, MalformedPayload, canonicalBytes, concat, isObject, parseBytes, sha256Hex, utf8 } from "../src/jsonc";
import { FIXTURES, FIXTURE_MAX_BYTES, caseFiles, readCase, registryEntry, runCase } from "../src/runner";

const D11_SCENARIOS = [
  "F_SIMPLE_READY", "F_GMCE_VARIANTS", "F_ESUNNY_FORBIDDEN", "F_A_B_OFFERS",
  "F_SELL_WINDOWS", "F_FULL_CORRUPT", "F_QUOTE_ORDER", "F_IDENTITY",
];
const TS_REGISTRY = resolve(__dirname, "..", "verdicts.ts.json");

interface Declared {
  accepted: boolean;
  outcome: string;
  error_codes: string[];
  expect: Record<string, Json>;
}

function readJson(path: string): JsonObject {
  return parseBytes(readFileSync(path), FIXTURE_MAX_BYTES) as JsonObject;
}

const verdicts = readJson(join(FIXTURES, "VERDICTS.json"))["cases"] as unknown as Record<string, Declared>;
const expected = readJson(join(FIXTURES, "EXPECTED_DIGESTS.json"));

function getPath(value: Json, dotted: string): Json {
  let current: Json = value;
  for (const part of dotted.split(".")) {
    if (Array.isArray(current)) current = current[Number(part)] as Json;
    else if (isObject(current)) current = current[part] as Json;
    else return null;
  }
  return current;
}

test("every case matches its declared verdict and result digest; registry written", () => {
  const results = expected["results"] as Record<string, string>;
  const files = caseFiles();
  const ids = files.map((path) => readCase(path).case_id).sort();
  assert.deepEqual(ids, Object.keys(verdicts).sort(), "case files and VERDICTS.json disagree");
  const registry: Record<string, Json> = {};
  const failures: string[] = [];
  for (const path of files) {
    const item = readCase(path);
    const declared = verdicts[item.case_id] as Declared;
    if (item.data_label !== "STAGING_FIXTURE") failures.push(`${item.case_id}: data_label`);
    const result = runCase(item);
    const got = { accepted: result["accepted"], outcome: result["outcome"], error_codes: result["error_codes"] };
    const want = { accepted: declared.accepted, outcome: declared.outcome, error_codes: declared.error_codes };
    if (JSON.stringify(got) !== JSON.stringify(want)) failures.push(`${item.case_id}: verdict ${JSON.stringify(got)} != ${JSON.stringify(want)}`);
    for (const [dotted, value] of Object.entries(declared.expect)) {
      if (JSON.stringify(getPath(result, dotted)) !== JSON.stringify(value)) failures.push(`${item.case_id}: ${dotted}`);
    }
    const entry = registryEntry(result);
    if (entry["result_sha256"] !== results[item.case_id]) failures.push(`${item.case_id}: result_sha256 ${String(entry["result_sha256"])} != ${String(results[item.case_id])}`);
    registry[item.case_id] = entry;
  }
  const documents: Record<string, Json> = {};
  for (const [relativePath, digests] of Object.entries(expected["documents"] as Record<string, JsonObject>)) {
    const data = readFileSync(join(FIXTURES, relativePath));
    if (sha256Hex(data) !== digests["file_sha256"]) failures.push(`${relativePath}: file_sha256`);
    let canonical: string | null;
    try {
      canonical = sha256Hex(canonicalBytes(parseBytes(data, FIXTURE_MAX_BYTES)));
    } catch (error) {
      if (!(error instanceof MalformedPayload)) throw error;
      canonical = null;
    }
    if (canonical !== digests["canonical_sha256"]) failures.push(`${relativePath}: canonical_sha256 ${String(canonical)}`);
    documents[relativePath] = canonical;
  }
  mkdirSync(resolve(__dirname, ".."), { recursive: true });
  writeFileSync(TS_REGISTRY, concat(canonicalBytes({ implementation: "typescript", cases: registry, documents }), utf8("\n")));
  assert.deepEqual(failures, []);
});

test("media are real bytes with their computed SHA-256", () => {
  for (const [relativePath, digest] of Object.entries(expected["media"] as Record<string, string>)) {
    const data = readFileSync(join(FIXTURES, relativePath));
    assert.equal(sha256Hex(data), digest, relativePath);
    if (relativePath.endsWith(".png")) assert.deepEqual(Array.from(data.slice(0, 8)), [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  }
});

test("each D11 scenario has accepted and refused cases", () => {
  for (const scenario of D11_SCENARIOS) {
    const entries = Object.entries(verdicts).filter(([id]) => id.startsWith(scenario + ".")).map(([, entry]) => entry);
    assert.ok(entries.some((entry) => entry.accepted), `${scenario}: no accepted case`);
    assert.ok(entries.some((entry) => !entry.accepted), `${scenario}: no refused case`);
  }
});

test("every testable error code has a negative case", () => {
  const emitted = new Set(Object.values(verdicts).flatMap((entry) => entry.error_codes));
  for (const code of Object.keys(ERROR_CODES)) {
    if (NOT_TESTABLE_IN_C0.includes(code)) assert.ok(!emitted.has(code), code);
    else assert.ok(emitted.has(code), `${code} never emitted`);
  }
  for (const code of emitted) assert.ok(Object.prototype.hasOwnProperty.call(ERROR_CODES, code), code);
});
