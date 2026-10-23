// Anti-drift du C0 vendu (docs/C0_VENDORING.md) : node --test tests/c0/vendor.test.mjs
import { test } from "node:test";
import * as assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CHECK = join(ROOT, "scripts", "c0", "check.mjs");
const SYNC = join(ROOT, "scripts", "c0", "sync.mjs");
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
  assert.match(manifest.archived_from_sha, /^[0-9a-f]{40}$/);
  assert.deepEqual(manifest.frozen_code_identity.paths, ["c0/fixtures", "c0/python", "c0/ts/src", "c0/ts/test"]);
  assert.equal(manifest.factory_repo, "nicoprodesoffline-rgb/prodes-data-factory-poc");
  assert.deepEqual(manifest.contract_version, ["site_snapshot.v1", "site_activation.v1", "site_business.v1", "site_events.v1"]);
});

// Dépôt Git temporaire : G = « gel », D = docs seules changées (accepté), X = code changé (refusé).
function makeRepo() {
  const repo = mkdtempSync(join(tmpdir(), "c0-sync-repo-"));
  const g = (...a) => execFileSync("git", ["-C", repo, "-c", "user.name=test", "-c", "user.email=test@example.invalid",
    "-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null", ...a]).toString().trim();
  const write = (rel, text) => { mkdirSync(dirname(join(repo, rel)), { recursive: true }); writeFileSync(join(repo, rel), text); };
  g("init", "-q");
  for (const rel of ["c0/python/m.py", "c0/ts/src/a.ts", "c0/ts/test/a.test.ts", "c0/fixtures/VERDICTS.json",
    "c0/ts/package.json", "c0/ts/tsconfig.json", "c0/ts/package-lock.json"]) write(rel, `${rel}\n`);
  write("c0/README.md", "NOT_FROZEN\n");
  g("add", "-A"); g("commit", "-q", "-m", "gel");
  const frozen = g("rev-parse", "HEAD");
  write("c0/README.md", "C0_FROZEN\n"); g("commit", "-q", "-am", "docs");
  const docs = g("rev-parse", "HEAD");
  write("c0/ts/src/a.ts", "changed\n"); g("commit", "-q", "-am", "code");
  const code = g("rev-parse", "HEAD");
  return { repo, frozen, docs, code };
}

test("(d) un archived_from_sha dont le code diffère du gel est refusé : C0_FROZEN_CODE_MISMATCH", () => {
  const { repo, frozen, docs, code } = makeRepo();
  const dest = mkdtempSync(join(tmpdir(), "c0-sync-dest-"));
  try {
    const sync = (sha) => spawnSync(process.execPath, [SYNC, "--factory", repo, "--sha", sha, "--frozen-sha", frozen, "--dest", dest], { encoding: "utf8" });
    const bad = sync(code);
    assert.equal(bad.status, 1, bad.stdout + bad.stderr);
    assert.match(bad.stderr, /^C0_FROZEN_CODE_MISMATCH /m);
    assert.match(bad.stderr, /^c0\/ts\/src archived=[0-9a-f]{40} frozen=[0-9a-f]{40}$/m);
    assert.equal(existsSync(join(dest, "c0")), false, "rien ne doit être écrit en cas de refus");
    const good = sync(docs); // témoin : seules les docs diffèrent → accepté
    assert.equal(good.status, 0, good.stdout + good.stderr);
    const manifest = JSON.parse(readFileSync(join(dest, "c0", "C0_SOURCE.json"), "utf8"));
    assert.equal(manifest.frozen_code_sha, frozen);
    assert.equal(manifest.archived_from_sha, docs);
    const ok = runCheck(dest);
    assert.equal(ok.status, 0, ok.out);
  } finally {
    rmSync(repo, { recursive: true, force: true });
    rmSync(dest, { recursive: true, force: true });
  }
});
