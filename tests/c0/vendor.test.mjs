// Anti-drift du C0 vendu (docs/C0_VENDORING.md) : node --test tests/c0/vendor.test.mjs
import { test } from "node:test";
import * as assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CHECK = join(ROOT, "scripts", "c0", "check.mjs");
const SYNC = join(ROOT, "scripts", "c0", "sync.mjs");
const FROZEN = "f1cf9e277bd090a4e7947b39f2e3dd700eea9e42";
const TARGET = "c0/fixtures/VERDICTS.json";

// Valeurs attendues ÉPINGLÉES (F-02) : elles ne changent que dans un commit de re-sync revu (nouvelle
// version gelée). Un manifeste réécrit de façon cohérente (files + tree_digest recalculés) passe
// check.mjs, mais pas ces assertions.
const PINNED = {
  factory_repo: "nicoprodesoffline-rgb/prodes-data-factory-poc",
  frozen_code_sha: FROZEN,
  archived_from_sha: "b69c41c7072bb0307d75d8ca15a415fd7ced6659",
  file_count: 452,
  // Regel du 27/10 (fusion officielle W5+W6) : selectPriceIn (Owner A14) fait partie du code gelé, aucun amendement local.
  tree_digest: "b2e5505a9501cebaf0269ff44cd1bac70fb25c205f3eb5284a7a9e88712bcabb",
  contract_version: ["site_snapshot.v1", "site_activation.v1", "site_business.v1", "site_events.v1"],
  trees: {
    "c0/fixtures": "c2bf3496239b3e92e4a45f67ba55237495041208",
    "c0/python": "f2f0b1180424f9231469971e4f786ec38d8e70b0",
    "c0/ts/src": "b49a30044ca7a59038f89571c8f33d7669c00e11",
    "c0/ts/test": "64c20e6a54b307fb403a0f9c52b4aa3350e54f84",
  },
};

function assertPinned(manifest) {
  for (const k of ["factory_repo", "frozen_code_sha", "archived_from_sha", "file_count", "tree_digest"]) {
    assert.equal(manifest[k], PINNED[k], k);
  }
  assert.deepEqual(manifest.contract_version, PINNED.contract_version);
  // La copie vendue est exactement le code gelé : plus aucun amendement local.
  assert.equal(manifest.local_amendments, undefined);
  assert.deepEqual(manifest.frozen_code_identity.paths, Object.keys(PINNED.trees));
  assert.deepEqual(manifest.frozen_code_identity.trees, PINNED.trees);
}

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

test("(b) un drift simulé (octet modifié, fichier ajouté, dist/ ou node_modules/ imbriqué, fichier supprimé) est refusé : C0_VENDOR_DRIFT", () => {
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
    nested_dist: (tmp) => {
      // F-01 : seuls c0/ts/dist et c0/ts/node_modules sont exclus ; un dist/ ailleurs est inspecté.
      mkdirSync(join(tmp, "c0/fixtures/cases/dist"), { recursive: true });
      writeFileSync(join(tmp, "c0/fixtures/cases/dist/hidden.json"), "{}\n");
      return /^ADDED c0\/fixtures\/cases\/dist\/hidden\.json$/m;
    },
    nested_node_modules: (tmp) => {
      mkdirSync(join(tmp, "c0/ts/src/node_modules/evil"), { recursive: true });
      writeFileSync(join(tmp, "c0/ts/src/node_modules/evil/index.ts"), "export {};\n");
      return /^ADDED c0\/ts\/src\/node_modules\/evil\/index\.ts$/m;
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

test("(c) C0_SOURCE.json correspond aux valeurs épinglées (gel f1cf9e27…, archive b69c41c7…, trees, tree_digest)", () => {
  assertPinned(JSON.parse(readFileSync(join(ROOT, "c0", "C0_SOURCE.json"), "utf8")));
});

test("(e) un manifeste forgé de façon cohérente passe check.mjs mais est rejeté par les valeurs épinglées", () => {
  const tmp = copyC0();
  try {
    const p = join(tmp, TARGET);
    const bytes = readFileSync(p);
    bytes[0] ^= 0x01;
    writeFileSync(p, bytes);
    const mpath = join(tmp, "c0", "C0_SOURCE.json");
    const m = JSON.parse(readFileSync(mpath, "utf8"));
    m.files[TARGET] = createHash("sha256").update(bytes).digest("hex");
    const keys = Object.keys(m.files).sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
    m.tree_digest = createHash("sha256").update(keys.map((k) => `${k}\t${m.files[k]}\n`).join("")).digest("hex");
    writeFileSync(mpath, `${JSON.stringify(m, null, 2)}\n`);
    const r = runCheck(tmp);
    assert.equal(r.status, 0, `limite connue de check.mjs (cohérence interne seulement)\n${r.out}`);
    assert.throws(() => assertPinned(m), /tree_digest/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// Dépôt Git temporaire : G = « gel », D = docs seules changées (accepté), X = code changé (refusé),
// X' = configuration seule changée (refusé).
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
  // X' : code remis à l'identique, seule la configuration de compilation change (F-04).
  write("c0/ts/src/a.ts", "c0/ts/src/a.ts\n"); write("c0/ts/tsconfig.json", "{\"strict\": false}\n");
  g("commit", "-q", "-am", "config");
  const config = g("rev-parse", "HEAD");
  return { repo, frozen, docs, code, config };
}

test("(d) un archived_from_sha dont le code diffère du gel est refusé : C0_FROZEN_CODE_MISMATCH", () => {
  const { repo, frozen, docs, code, config } = makeRepo();
  const dest = mkdtempSync(join(tmpdir(), "c0-sync-dest-"));
  try {
    const sync = (sha) => spawnSync(process.execPath, [SYNC, "--factory", repo, "--sha", sha, "--frozen-sha", frozen, "--dest", dest], { encoding: "utf8" });
    const bad = sync(code);
    assert.equal(bad.status, 1, bad.stdout + bad.stderr);
    assert.match(bad.stderr, /^C0_FROZEN_CODE_MISMATCH /m);
    assert.match(bad.stderr, /^c0\/ts\/src archived=[0-9a-f]{40} frozen=[0-9a-f]{40}$/m);
    assert.equal(existsSync(join(dest, "c0")), false, "rien ne doit être écrit en cas de refus");
    const cfg = sync(config); // F-04 : configuration de compilation modifiée seule → refus
    assert.equal(cfg.status, 1, cfg.stdout + cfg.stderr);
    assert.match(cfg.stderr, /^C0_FROZEN_CODE_MISMATCH /m);
    assert.match(cfg.stderr, /^c0\/ts\/tsconfig\.json archived=[0-9a-f]{40} frozen=[0-9a-f]{40}$/m);
    assert.doesNotMatch(cfg.stderr, /^c0\/ts\/src /m);
    assert.equal(existsSync(join(dest, "c0")), false);
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

test("(f) SHA inconnu ou dépôt invalide : C0_SYNC_FAILED, exit 1, sans trace de pile", () => {
  const { repo, frozen } = makeRepo();
  const notRepo = mkdtempSync(join(tmpdir(), "c0-not-a-repo-"));
  const dest = mkdtempSync(join(tmpdir(), "c0-sync-dest-"));
  try {
    for (const [factory, sha] of [[repo, "2".repeat(40)], [notRepo, frozen]]) {
      const r = spawnSync(process.execPath, [SYNC, "--factory", factory, "--sha", sha, "--frozen-sha", frozen, "--dest", dest], { encoding: "utf8" });
      assert.equal(r.status, 1, r.stdout + r.stderr);
      assert.match(r.stderr, /^C0_SYNC_FAILED \S/);
      assert.doesNotMatch(r.stderr, /^\s+at /m, "aucune trace de pile");
      assert.equal(existsSync(join(dest, "c0")), false);
    }
  } finally {
    for (const d of [repo, notRepo, dest]) rmSync(d, { recursive: true, force: true });
  }
});
