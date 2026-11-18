// Cercle 5, 5.22 et 5.23 (P04) : cinq consultations de reçu par minute et par adresse ; SANS variable, la sixième reçoit 429 ; SITE_RECEIPT_LIMIT règle le plafond sans jamais le désactiver.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { load } from "./load-ts.mjs";

const { receiptLimitRefusal, resetReceiptLimit, RECEIPT_LIMIT_DEFAULT } = load("lib/site-ratelimit/receipt.ts");
const from = (address) => ({ get: (n) => (n === "x-forwarded-for" ? `1.1.1.1, ${address}` : null) });
const FRONT = { SITE_TRUSTED_PROXY_HOPS: "1" };
beforeEach(() => resetReceiptLimit());

test("sans variable : cinq consultations passent, la sixième reçoit 429 TOO_MANY_REQUESTS (comportement public inchangé)", async () => {
  assert.equal(RECEIPT_LIMIT_DEFAULT, 5);
  const h = from("203.0.113.20");
  for (let i = 0; i < 5; i++) assert.equal(receiptLimitRefusal(h, FRONT, 1000 + i), null, `consultation ${i + 1}`);
  const sixth = receiptLimitRefusal(h, FRONT, 1010);
  assert.equal(sixth.status, 429);
  const body = await sixth.json();
  assert.deepEqual(body.error_codes, ["TOO_MANY_REQUESTS"]);
  assert.equal(body.message, "Trop de demandes, réessayez dans une minute.");
  assert.ok(Number(sixth.headers.get("retry-after")) >= 1);
});

test("une valeur invalide retombe sur 5 : jamais de limite désactivée", () => {
  for (const bad of ["", " ", "0", "-3", "2.5", "abc", "1e9", "9999999"]) {
    resetReceiptLimit();
    const h = from("203.0.113.21");
    const env = { ...FRONT, SITE_RECEIPT_LIMIT: bad };
    for (let i = 0; i < 5; i++) assert.equal(receiptLimitRefusal(h, env, 5000 + i), null, `${JSON.stringify(bad)} : consultation ${i + 1}`);
    assert.notEqual(receiptLimitRefusal(h, env, 5010), null, `${JSON.stringify(bad)} : la sixième est refusée`);
  }
});

test("SITE_RECEIPT_LIMIT règle le plafond ; la minute passée l'adresse repart ; une autre adresse n'est pas touchée", () => {
  const env = { ...FRONT, SITE_RECEIPT_LIMIT: "2" };
  const h = from("203.0.113.22");
  assert.equal(receiptLimitRefusal(h, env, 10_000), null);
  assert.equal(receiptLimitRefusal(h, env, 10_001), null);
  assert.notEqual(receiptLimitRefusal(h, env, 10_002), null);
  assert.equal(receiptLimitRefusal(from("203.0.113.23"), env, 10_003), null);
  assert.equal(receiptLimitRefusal(h, env, 70_001), null, "60 s après la première consultation admise");
  resetReceiptLimit();
  const wide = { ...FRONT, SITE_RECEIPT_LIMIT: "1000" };
  for (let i = 0; i < 20; i++) assert.equal(receiptLimitRefusal(h, wide, 90_000 + i), null);
});

test("les deux routes du reçu (reçu et document) partagent le même plafond, lu sous le même nom", async () => {
  const { readFileSync } = await import("node:fs");
  const http = readFileSync(new URL("../../lib/site-transactions/http.ts", import.meta.url), "utf8");
  assert.equal((http.match(/receiptLimited\(req\) \?\? guarded/g) ?? []).length, 2);
  assert.match(readFileSync(new URL("../../lib/site-ratelimit/receipt.ts", import.meta.url), "utf8"), /env\["SITE_RECEIPT_LIMIT"\]/);
});
