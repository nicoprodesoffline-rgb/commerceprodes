// Anti-drift du C0 vendu (docs/C0_VENDORING.md) : node --test tests/c0/vendor.test.mjs
import { test } from "node:test";
import * as assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CHECK = join(ROOT, "scripts", "c0", "check.mjs");
const FROZEN = "b88f5cdf2ca64eca8de4d19c077262e11f9e7e54";
const TARGET = "c0/fixtures/VERDICTS.json";

function runCheck(root) {
  const args = root ? [CHECK, "--root", root] : [CHECK];
  const r = spawnSync(process.execPath, args, { encoding: "utf8" });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

// Copie de c0/ (sans dist/ ni node_modules/) dans une racine temporaire.
function copyC0() {
  const tmp = mkdtempSync(join(tmpdir(), "c0-vendor-test-"));
  cpSync(join(ROOT, "c0"), join(tmp, "c0"), {
    recursive: true,
    filter: (src) => !["dist", "node_modules"].includes(basename(src)),
  });
  return tmp;
}

test("(a) le C0 vendu correspond à son manifeste : C0_VENDOR_OK", () => {
  const r = runCheck();
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, new RegExp(`^C0_VENDOR_OK sha=${FROZEN} files=\\d+`, "m"));
});

test("(b) un drift simulé (octet modifié, fichier ajouté, fichier supprimé) est refusé : C0_VENDOR_DRIFT", () => {
  const cases = {
    modified: (tmp) => {
      const p = join(tmp, TARGET);
      const bytes = readFileSync(p);
      bytes[0] ^= 0x01; // un seul octet
      writeFileSync(p, bytes);
      return new RegExp(`^MODIFIED ${TARGET} `, "m");
    },
    added: (tmp) => {
      writeFileSync(join(tmp, "c0/fixtures/EXTRA.json"), "{}\n");
      return /^ADDED c0\/fixtures\/EXTRA\.json$/m;
    },
    missing: (tmp) => {
      unlinkSync(join(tmp, TARGET));
      return new RegExp(`^MISSING ${TARGET}$`, "m");
    },
  };
  for (const [name, mutate] of Object.entries(cases)) {
    const tmp = copyC0();
    try {
      const control = runCheck(tmp);
      assert.equal(control.status, 0, `témoin ${name} : la copie intacte doit passer\n${control.out}`);
      const expected = mutate(tmp);
      const r = runCheck(tmp);
      assert.equal(r.status, 1, `${name} : ${r.out}`);
      assert.match(r.out, /^C0_VENDOR_DRIFT /m, name);
      assert.match(r.out, expected, name);
      assert.doesNotMatch(r.out, /C0_VENDOR_OK/, name);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }
});

test("(c) C0_SOURCE.json pointe le code gelé b88f5cdf…", () => {
  const manifest = JSON.parse(readFileSync(join(ROOT, "c0", "C0_SOURCE.json"), "utf8"));
  assert.equal(manifest.frozen_code_sha, FROZEN);
  assert.equal(manifest.factory_repo, "nicoprodesoffline-rgb/prodes-data-factory-poc");
  assert.deepEqual(manifest.contract_version, ["site_snapshot.v1", "site_activation.v1", "site_business.v1", "site_events.v1"]);
});
