// C0 v2 parity, TypeScript side: every v2 fixture case gives its declared verdict and the result digest of
// c0v2/fixtures/EXPECTED_DIGESTS.json, computed by the Python reference (V02). Documents: same canonical bytes, same digests.

import { test } from "node:test";
import * as assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Json, JsonObject, canonicalBytes, isObject, parseBytes, sha256Hex } from "../../../c0/ts/src/jsonc";
import { ERROR_CODES } from "../src/errors";
import { payloadSha256 as contentPayload } from "../src/content";
import { Doc, payloadSha256 as snapshotPayload } from "../src/snapshot";
import { FIXTURES, FIXTURE_MAX_BYTES, caseFiles, readCase, resultSha256, runCase } from "../src/runner";

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

test("V01-V09: every v2 case matches its declared verdict and the Python result digest", () => {
  const results = expected["results"] as Record<string, string>;
  const files = caseFiles();
  assert.deepEqual(files.map((path) => readCase(path).case_id).sort(), Object.keys(verdicts).sort(), "case files and VERDICTS.json disagree");
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
    if (resultSha256(result) !== results[item.case_id]) failures.push(`${item.case_id}: result digest differs from Python`);
  }
  assert.deepEqual(failures, []);
});

test("V02: documents, payload digests and media are the same bytes as in Python", () => {
  const failures: string[] = [];
  for (const [relative, digests] of Object.entries(expected["documents"] as Record<string, JsonObject>)) {
    const data = readFileSync(join(FIXTURES, relative));
    if (sha256Hex(data) !== digests["file_sha256"]) failures.push(`${relative}: file`);
    if (sha256Hex(canonicalBytes(parseBytes(data, FIXTURE_MAX_BYTES))) !== digests["canonical_sha256"]) failures.push(`${relative}: canonical`);
  }
  for (const [relative, entry] of Object.entries(expected["payloads"] as Record<string, JsonObject>)) {
    const doc = readJson(join(FIXTURES, relative)) as Doc;
    const recomputed = entry["contract_version"] === "site_snapshot.v2" ? snapshotPayload(doc) : contentPayload(doc);
    if (recomputed !== entry["payload_sha256"]) failures.push(`${relative}: payload_sha256`);
  }
  for (const [relative, digest] of Object.entries(expected["media"] as Record<string, string>)) {
    if (sha256Hex(readFileSync(join(FIXTURES, relative))) !== digest) failures.push(`${relative}: media`);
  }
  assert.deepEqual(failures, []);
});

test("every code of a v2 verdict is declared", () => {
  for (const [caseId, declared] of Object.entries(verdicts)) {
    for (const code of declared.error_codes) assert.ok(Object.prototype.hasOwnProperty.call(ERROR_CODES, code), `${caseId}: ${code}`);
  }
});
