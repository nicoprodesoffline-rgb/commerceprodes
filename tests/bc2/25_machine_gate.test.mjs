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

test("un client signé qui ne se trompe jamais n'est jamais bloqué par la limite de refus (centaines d'images)", () => {
  const e = env({ SITE_MACHINE_FAILURE_LIMIT: "3" });
  for (let i = 0; i < 500; i += 1) assert.equal(gate.machineGuard(h("198.51.100.1"), e, i).refusal, null);
});
