// Cercle 9, 9.6 (Owner, 49e série, #130): the v2 snapshot reads the same ceiling as v1, 128 MiB; accepted just under it, refused just over.
// Synthetic bytes only (an empty JSON object padded with spaces).

import { test } from "node:test";
import * as assert from "node:assert/strict";
import { MAX_BYTES, validateSnapshotBytes } from "../src/snapshot";

const CEILING = 128 * 1024 * 1024;

function padded(size: number): Uint8Array {
  const data = new Uint8Array(size).fill(0x20);
  data[0] = 0x7b; // {
  data[1] = 0x7d; // }
  return data;
}

test("the v2 ceiling is 128 MiB, the one of v1", () => {
  assert.equal(MAX_BYTES, CEILING);
});

test("one byte over the ceiling is PAYLOAD_MALFORMED; just under it the size is no reason to refuse", () => {
  assert.deepEqual(validateSnapshotBytes(padded(CEILING + 1)), ["PAYLOAD_MALFORMED"]);
  assert.ok(!validateSnapshotBytes(padded(CEILING)).includes("PAYLOAD_MALFORMED"));
});
