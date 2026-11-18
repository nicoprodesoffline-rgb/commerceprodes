import { test } from "node:test";
import assert from "node:assert/strict";
import { clientAddress, createLimiter } from "../../lib/site-ratelimit/limiter.ts";

const options = { limit: 2, windowMs: 1000, maxKeys: 2 };
test("fenêtre glissante : seuls les envois acceptés comptent, expiration exacte et délai arrondi", () => {
  const limiter = createLimiter(options);
  assert.deepEqual(limiter.take("a", 0), { ok: true, retryAfterSeconds: 0 });
  assert.equal(limiter.take("a", 500).ok, true);
  assert.deepEqual(limiter.take("a", 999), { ok: false, retryAfterSeconds: 1 });
  assert.equal(limiter.take("a", 1000).ok, true);
  assert.equal(limiter.take("a", 1499).ok, false);
  assert.equal(limiter.take("a", 1500).ok, true);
  const long = createLimiter({ ...options, limit: 1, windowMs: 2500 });
  long.take("a", 10000);
  assert.equal(long.take("a", 10001).retryAfterSeconds, 3);
});

test("les clés distinctes ont chacune leur quota et l'horloge est injectée", () => {
  const limiter = createLimiter({ ...options, limit: 1 });
  assert.equal(limiter.take("a", 12345).ok, true);
  assert.equal(limiter.take("a", 12345).ok, false);
  assert.equal(limiter.take("b", 12345).ok, true);
  assert.equal(limiter.take("a", 13345).ok, true);
});

test("la borne éjecte la clé la plus ancienne, sans éjecter les suivantes", () => {
  const limiter = createLimiter({ ...options, limit: 1 });
  limiter.take("a", 0);
  limiter.take("b", 1);
  limiter.take("c", 2);
  assert.equal(limiter.take("b", 3).ok, false);
  assert.equal(limiter.take("c", 3).ok, false);
  assert.equal(limiter.take("a", 3).ok, true);
});

test("les clés expirées sont purgées avant l'éviction, même hors ordre d'insertion", () => {
  const limiter = createLimiter(options);
  limiter.take("a", 0);
  limiter.take("b", 500);
  limiter.take("a", 750);
  limiter.take("c", 1500); // b expire, a conserve son envoi à 750 malgré son insertion antérieure.
  assert.equal(limiter.take("a", 1500).ok, true);
  assert.equal(limiter.take("a", 1500).ok, false, "l'envoi encore actif de a n'a pas été oublié");
  assert.equal(limiter.take("c", 1500).ok, true);
  assert.equal(limiter.take("c", 1500).ok, false);
});

test("une rafale reste bornée et n'étend pas la fenêtre", () => {
  const limiter = createLimiter({ limit: 120, windowMs: 60000, maxKeys: 1 });
  for (let i = 0; i < 120; i++) assert.equal(limiter.take("a", 0).ok, true);
  for (let i = 0; i < 1000; i++) assert.equal(limiter.take("a", 59000).ok, false);
  assert.equal(limiter.take("a", 60000).ok, true);
  limiter.take("b", 60000);
  assert.equal(limiter.take("a", 60000).ok, true);
});

test("les paramètres invalides sont refusés", () => {
  for (const name of ["limit", "windowMs", "maxKeys"]) {
    for (const value of [0, -1, 0.5, Infinity, NaN]) {
      assert.throws(() => createLimiter({ ...options, [name]: value }), RangeError);
    }
  }
});

test("cercle 4 (S05) : l'adresse est celle que le frontal a posée (n-ième en partant de la droite), jamais celle que le visiteur écrit", () => {
  const h = (value) => ({ get: () => value });
  const one = { SITE_TRUSTED_PROXY_HOPS: "1" };
  assert.equal(clientAddress(h("1.1.1.1, 198.51.100.7"), one), "198.51.100.7", "valeur forgée à gauche ignorée");
  assert.equal(clientAddress(h(" 2001:DB8::1 "), one), "2001:db8::1");
  assert.equal(clientAddress(h("9.9.9.9, 10.0.0.1, 198.51.100.7"), { SITE_TRUSTED_PROXY_HOPS: "2" }), "10.0.0.1");
  assert.equal(clientAddress(h("1.1.1.1, 198.51.100.7"), {}), "direct", "aucun frontal déclaré : l'en-tête n'est jamais lu");
  assert.equal(clientAddress(h("1.1.1.1"), { SITE_TRUSTED_PROXY_HOPS: "0" }), "direct");
  for (const raw of [null, "", "<script>", "a".repeat(129)]) assert.equal(clientAddress(h(raw), one), "inconnue");
  assert.equal(clientAddress(h("1.1.1.1"), { SITE_TRUSTED_PROXY_HOPS: "2" }), "inconnue", "moins de valeurs que de frontaux : rien de deviné");
  assert.equal(clientAddress({ get: (n) => (n === "x-real-ip" ? "203.0.113.5" : null) }, { SITE_TRUSTED_PROXY_HOPS: "1", SITE_CLIENT_ADDRESS_HEADER: "X-Real-IP" }), "203.0.113.5");
});
