// Cercle 5, 5.23 (P04) : le sixième envoi en une minute depuis une même adresse reçoit « trop de demandes, réessayez dans une minute ».
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { load } from "./load-ts.mjs";

const { requestLimitRefusal, resetRequestLimits, TOO_MANY } = load("lib/site-ratelimit/requests.ts");
const from = (address) => ({ get: (n) => (n === "x-forwarded-for" ? `1.1.1.1, ${address}` : null) });
const ENV = { SITE_TRUSTED_PROXY_HOPS: "1" };
beforeEach(() => resetRequestLimits());

test("P04 : cinq envois passent, le sixième est refusé avec le message du contrat et un délai", async () => {
  const h = from("203.0.113.7");
  for (let i = 0; i < 5; i++) assert.equal(requestLimitRefusal(h, "send", ENV, 1000 + i), null, `envoi ${i + 1}`);
  const sixth = requestLimitRefusal(h, "send", ENV, 1010);
  assert.equal(sixth.status, 429);
  const body = await sixth.json();
  assert.equal(body.message, "Trop de demandes, réessayez dans une minute.");
  assert.equal(TOO_MANY, body.message);
  assert.deepEqual(body.error_codes, ["RATE_LIMITED"]);
  assert.equal(body.accepted, false);
  assert.ok(Number(sixth.headers.get("retry-after")) >= 1 && Number(sixth.headers.get("retry-after")) <= 60);
});

test("vingt envois en une minute : cinq acceptés, quinze refusés ; une autre adresse n'est pas touchée", () => {
  const h = from("203.0.113.8");
  const results = Array.from({ length: 20 }, (_, i) => requestLimitRefusal(h, "send", ENV, 5000 + i) === null);
  assert.equal(results.filter(Boolean).length, 5);
  assert.equal(requestLimitRefusal(from("203.0.113.9"), "send", ENV, 5100), null);
});

test("la minute passée, l'adresse repart ; un envoi refusé ne rallonge pas l'attente", () => {
  const h = from("203.0.113.10");
  for (let i = 0; i < 5; i++) requestLimitRefusal(h, "send", ENV, 10_000);
  assert.notEqual(requestLimitRefusal(h, "send", ENV, 40_000), null);
  assert.equal(requestLimitRefusal(h, "send", ENV, 70_001), null, "60 s après le premier envoi accepté");
});

test("le reçu a son seau ; la limite se règle (SITE_REQUEST_LIMIT) ; sans frontal toutes les demandes partagent la clé « direct »", () => {
  const h = from("203.0.113.11");
  for (let i = 0; i < 5; i++) requestLimitRefusal(h, "send", ENV, 20_000);
  assert.notEqual(requestLimitRefusal(h, "send", ENV, 20_001), null);
  assert.equal(requestLimitRefusal(h, "receipt", ENV, 20_002), null, "le seau du reçu est à part");
  resetRequestLimits();
  const two = { ...ENV, SITE_REQUEST_LIMIT: "2" };
  assert.equal(requestLimitRefusal(h, "send", two, 30_000), null);
  assert.equal(requestLimitRefusal(h, "send", two, 30_001), null);
  assert.notEqual(requestLimitRefusal(h, "send", two, 30_002), null);
  resetRequestLimits();
  for (let i = 0; i < 5; i++) assert.equal(requestLimitRefusal(h, "send", {}, 40_000 + i), null);
  assert.notEqual(requestLimitRefusal(from("198.51.100.1"), "send", {}, 40_010), null, "SITE_TRUSTED_PROXY_HOPS absent : la clé est « direct » pour tous");
});
