import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as codes from "../../components/site/codes.ts";
import { logRefusal } from "../../lib/site-business/refusal-log.ts";

test("un article retiré est expliqué en français sans label technique", () => {
  const message = codes.codeMessage("ITEM_RETIRED");
  assert.equal(message, "Cet article a été retiré du catalogue.");
  assert.doesNotMatch(message, /code|ITEM_RETIRED/i);
});

test("tous les codes de TEXT donnent un message sans code technique", () => {
  const source = readFileSync(new URL("../../components/site/codes.ts", import.meta.url), "utf8");
  const text = source.match(/const TEXT: Record<string, string> = \{([\s\S]*?)\n\};/)[1];
  const keys = [...text.matchAll(/^\s+([A-Z_]+):/gm)].map((match) => match[1]);
  assert.ok(keys.length > 0);
  for (const code of keys) {
    assert.notEqual(codes.codeMessage(code), "Demande refusée.", code);
    assert.doesNotMatch(codes.codeMessage(code), /[A-Z]{3,}_[A-Z_]+/, code);
  }
});

test("un code inconnu donne un refus générique", () => {
  assert.equal(codes.codeMessage("UNKNOWN_CODE"), "Demande refusée.");
});

test("reportCodes reste silencieux côté serveur et pour une liste vide, puis écrit une ligne navigateur", () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const previousWarn = console.warn;
  const calls = [];
  console.warn = (...args) => calls.push(args);
  try {
    delete globalThis.window;
    codes.reportCodes("test", ["A", "B"]);
    assert.deepEqual(calls, []);
    globalThis.window = {};
    codes.reportCodes("test", []);
    assert.deepEqual(calls, []);
    codes.reportCodes("test", ["A", "B"]);
    assert.deepEqual(calls, [["[prodes-site] codes", "test", "A,B"]]);
  } finally {
    console.warn = previousWarn;
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else delete globalThis.window;
  }
});

test("le journal serveur couvre verdict, aperçu partiel, reçu et transport sans données métier", () => {
  const previousWarn = console.warn;
  const calls = [];
  console.warn = (...args) => calls.push(args);
  try {
    const cases = [
      ["/api/site/quote", 410, { verdict: { error_codes: ["ITEM_RETIRED"] } }, ["ITEM_RETIRED"]],
      ["/api/site/order", 409, { error_codes: ["PRICE_CHANGED"] }, ["PRICE_CHANGED"]],
      ["/api/site/cart/preview", 200, { accepted: false, error_codes: ["ITEM_RETIRED"] }, ["ITEM_RETIRED"]],
      ["/api/site/receipt", 401, { error_codes: ["UNAUTHORIZED"] }, ["UNAUTHORIZED"]],
      ["/api/site/quote", 503, { site_status: "CATALOG_UNAVAILABLE" }, ["CATALOG_UNAVAILABLE"]],
      ["/api/site/receipt", 503, { outcome: "TRANSPORT_ERROR", error_codes: [] }, ["TRANSPORT_ERROR"]],
    ];
    for (const [route, status, body, expectedCodes] of cases) {
      calls.length = 0;
      logRefusal(route, status, { ...body, contact: "PRIVATE_CONTACT", total_amount: "PRIVATE_AMOUNT", access_token: "PRIVATE_TOKEN" });
      assert.equal(calls.length, 1);
      assert.equal(calls[0][0], "[prodes-site] refusal");
      assert.deepEqual(JSON.parse(calls[0][1]), { route, status, codes: expectedCodes });
      assert.doesNotMatch(calls[0][1], /PRIVATE_/);
    }
    calls.length = 0;
    logRefusal("/api/site/cart/preview", 200, { accepted: true, error_codes: [] });
    assert.deepEqual(calls, []);
  } finally {
    console.warn = previousWarn;
  }
});
