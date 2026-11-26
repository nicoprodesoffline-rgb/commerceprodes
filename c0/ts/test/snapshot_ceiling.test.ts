// Cercle 9, 9.6 (Owner, 49e série, #130): the ceiling of a full snapshot is 128 MiB; accepted just under it, refused just over.
// The twin of tests/contracts/test_c0_snapshot_ceiling.py (v1; the v2 twin is c0v2/ts/test). Synthetic bytes only (an empty JSON object padded with spaces).

import { test } from "node:test";
import * as assert from "node:assert/strict";
import { parseBytes, MalformedPayload } from "../src/jsonc";
import { MAX_BYTES, validateSnapshotBytes } from "../src/snapshot";

const CEILING = 128 * 1024 * 1024;

function padded(size: number): Uint8Array {
  const data = new Uint8Array(size).fill(0x20);
  data[0] = 0x7b; // {
  data[1] = 0x7d; // }
  return data;
}

function refused(data: Uint8Array): boolean {
  try {
    parseBytes(data, MAX_BYTES);
    return false;
  } catch (error) {
    return error instanceof MalformedPayload;
  }
}

test("the ceiling is 128 MiB", () => {
  assert.equal(MAX_BYTES, CEILING);
});

test("a document of exactly the ceiling is read, one byte more is refused", () => {
  assert.equal(Object.keys(parseBytes(padded(CEILING), MAX_BYTES) as object).length, 0);  // an empty object (the parser's has no prototype)
  assert.equal(refused(padded(CEILING + 1)), true);
});

test("one byte over the ceiling is PAYLOAD_MALFORMED; just under it the size is no reason to refuse", () => {
  assert.deepEqual(validateSnapshotBytes(padded(CEILING + 1)), ["PAYLOAD_MALFORMED"]);
  assert.ok(!validateSnapshotBytes(padded(CEILING)).includes("PAYLOAD_MALFORMED"));
});
