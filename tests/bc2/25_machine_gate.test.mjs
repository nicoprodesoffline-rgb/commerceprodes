// Cercle 4, 4.10 — garde des routes de la Factory : liste d'adresses autorisées (vide par défaut), seuil de refus, fenêtre qui expire, adresse du frontal.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { join } from "node:path";
import { ROOT } from "./helpers.mjs";

const gate = createRequire(import.meta.url)(join(ROOT, ".bc2-build", "lib", "site-ratelimit", "machine-gate.js"));
const h = (value) => ({ get: (name) => (name === "x-forwarded-for" ? value : null) });
const env = (extra = {}) => ({ SITE_TRUSTED_PROXY_HOPS: "1", ...extra });
beforeEach(() => gate.resetMachineGuard());

test("liste vide par défaut : toute adresse passe au contrôle suivant ; liste renseignée : les autres reçoivent 403", async () => {
  assert.equal(gate.machineGuard(h("9.9.9.9, 198.51.100.1"), env(), 0).refusal, null);
  const only = env({ SITE_MACHINE_ALLOWLIST: "198.51.100.1, 198.51.100.2" });
  assert.equal(gate.machineGuard(h("x, 198.51.100.2"), only, 0).refusal, null);
  const refused = gate.machineGuard(h("198.51.100.1, 198.51.100.9"), only, 0).refusal;
  assert.equal(refused.status, 403, "une adresse forgée devant ne fait pas entrer : seule celle du frontal compte");
});

test("seuil de refus : au seuil, 429 ; la fenêtre d'une minute expire ; une autre adresse n'est pas touchée", () => {
  const e = env({ SITE_MACHINE_FAILURE_LIMIT: "3" });
  for (let i = 0; i < 3; i += 1) { const g = gate.machineGuard(h("198.51.100.1"), e, i * 1000); assert.equal(g.refusal, null); g.fail(); }
  const blocked = gate.machineGuard(h("198.51.100.1"), e, 4000).refusal;
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers.get("retry-after")) >= 1);
  assert.equal(gate.machineGuard(h("198.51.100.2"), e, 4000).refusal, null);
  assert.equal(gate.machineGuard(h("198.51.100.1"), e, 61_000).refusal, null, "les refus de plus d'une minute ne comptent plus");
});

test("un client signé qui ne se trompe jamais n'est jamais bloqué par la limite de refus (des milliers d'images, plus de 20 par seconde) : aucun plafond de débit sur les requêtes signées", () => {
  const e = env({ SITE_MACHINE_FAILURE_LIMIT: "3" });
  for (let i = 0; i < 5000; i += 1) assert.equal(gate.machineGuard(h("198.51.100.1"), e, i).refusal, null);
});

test("r2 — 413, 400 et 401 comptent comme des refus ; 404 (génération non déposée, réponse normale), 409, 422 et 200 non", async () => {
  const run = (status) => async () => new Response(null, { status });
  for (const status of [413, 400, 401]) {
    gate.resetMachineGuard();
    process.env.SITE_TRUSTED_PROXY_HOPS = "1";
    process.env.SITE_MACHINE_FAILURE_LIMIT = "3";
    const seen = [];
    for (let i = 0; i < 6; i += 1) seen.push((await gate.guarded(h("198.51.100.1"), run(status))).status);
    assert.deepEqual(seen, [status, status, status, 429, 429, 429], `${status} compte`);
  }
  for (const status of [404, 409, 422, 200]) {
    gate.resetMachineGuard();
    const seen = new Set();
    for (let i = 0; i < 20; i += 1) seen.add((await gate.guarded(h("198.51.100.1"), run(status))).status);
    assert.deepEqual([...seen], [status], `${status} ne compte pas`);
  }
  delete process.env.SITE_TRUSTED_PROXY_HOPS;
  delete process.env.SITE_MACHINE_FAILURE_LIMIT;
});
