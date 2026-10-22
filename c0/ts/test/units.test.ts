// C0 unit checks, TypeScript side: identity vectors, canonical bytes, pinned digest vector.

import { test } from "node:test";
import * as assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ALPHABET, MAX_SEQUENCE, decodeSequence, keyProblem, makeKey, Namespace } from "../src/identity";
import { JsonObject, canonicalBytes, digest, parseBytes } from "../src/jsonc";
import { centsToMoney, moneyCents } from "../src/formats";
import { FIXTURES } from "../src/runner";

const vectors = parseBytes(readFileSync(join(FIXTURES, "identity_vectors.json")), 1 << 20) as JsonObject;

test("identity: valid vectors encode and decode identically to Python", () => {
  assert.equal(vectors["alphabet"], ALPHABET);
  for (const entry of vectors["valid"] as JsonObject[]) {
    const namespace = entry["namespace"] as Namespace;
    const sequence = entry["sequence"] as number;
    assert.equal(makeKey(namespace, sequence), entry["key"]);
    assert.equal(keyProblem(entry["key"], namespace), null);
    assert.equal(decodeSequence(entry["key"] as string, namespace), sequence);
    assert.equal((entry["key"] as string).length, 12);
  }
});

test("identity: invalid vectors refused with the same code as Python", () => {
  for (const entry of vectors["invalid"] as JsonObject[]) {
    assert.equal(keyProblem(entry["value"], entry["namespace"] as Namespace), entry["error"], String(entry["value"]));
  }
});

test("identity: every substitution and every transposition is detected (5 keys per namespace)", () => {
  for (const namespace of ["item", "family"] as Namespace[]) {
    for (const sequence of [1, 31, 1001, 123456789, MAX_SEQUENCE]) {
      const key = makeKey(namespace, sequence);
      for (let position = 3; position < 12; position += 1) {
        for (const symbol of ALPHABET) {
          if (symbol === key[position]) continue;
          const mutated = key.slice(0, position) + symbol + key.slice(position + 1);
          assert.notEqual(keyProblem(mutated, namespace), null, mutated);
        }
      }
      for (let i = 3; i < 12; i += 1) {
        for (let j = i + 1; j < 12; j += 1) {
          if (key[i] === key[j]) continue;
          const chars = Array.from(key);
          [chars[i], chars[j]] = [chars[j] as string, chars[i] as string];
          assert.notEqual(keyProblem(chars.join(""), namespace), null, chars.join(""));
        }
      }
    }
  }
  assert.throws(() => makeKey("item", 0));
  assert.throws(() => makeKey("item", MAX_SEQUENCE + 1));
});

test("canonical bytes and pinned digest vector (same as the Python suite)", () => {
  const value = { b: "é", a: [1, -2] };
  assert.equal(new TextDecoder().decode(canonicalBytes(value)), '{"a":[1,-2],"b":"é"}');
  assert.equal(digest("prodes.c0.test.v1", value), "353736678401dd08c0541f589cf4babe3ecc136431c027e01a13e33a09c9e35c");
  assert.throws(() => canonicalBytes({ x: 1.5 }));
  assert.throws(() => canonicalBytes({ x: 9007199254740992 }));
});

test("money is exact BigInt cents, never Number", () => {
  assert.equal(moneyCents("38.50"), 3850n);
  assert.equal(moneyCents("38.5"), null);
  assert.equal(moneyCents("12.345"), null);
  assert.equal(centsToMoney(99999999999n * 1000000n), "999999999990000.00");
  assert.equal(centsToMoney(5n), "0.05");
});
