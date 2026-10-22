#!/usr/bin/env node
// Vendoring contrôlé du contrat C0 depuis le dépôt Factory, épinglé à un SHA.
//
//   node scripts/c0/sync.mjs --factory <chemin dépôt Factory> --sha <sha 40 hex> [--frozen-sha <sha>]
//
// Extrait par `git archive <sha>` (jamais le working tree) les chemins de ARCHIVE_PATHS, vérifie que
// chaque fichier extrait est octet pour octet le blob git attendu, REMPLACE entièrement c0/ du dépôt
// Commerce, puis écrit c0/C0_SOURCE.json (empreintes SHA-256 + tree_digest).
// --frozen-sha (défaut : --sha) = SHA du code gelé du contrat consigné dans frozen_code_sha.
// À n'utiliser que pour une nouvelle version GELÉE du contrat (voir docs/C0_VENDORING.md).

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ARCHIVE_PATHS, CONTRACT_VERSION, FACTORY_REPO, MANIFEST_REL, SHA_RE,
  gitBlobSha1, hashFiles, parseArgs, sortedObject, treeDigest, walkC0,
} from "./lib.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

function fail(message) {
  console.error(`C0_SYNC_FAILED ${message}`);
  process.exit(1);
}

function git(factory, args, opts = {}) {
  return execFileSync("git", ["-C", factory, ...args], { maxBuffer: 256 * 1024 * 1024, ...opts });
}

let args;
try {
  args = parseArgs(process.argv.slice(2), ["factory", "sha", "frozen-sha"]);
} catch (err) {
  fail(err.message);
}
if (!args.factory || !args.sha) fail("usage : --factory <chemin> --sha <sha 40 hex> [--frozen-sha <sha>]");
const factory = resolve(args.factory);
const sha = args.sha.toLowerCase();
const frozen = (args["frozen-sha"] ?? args.sha).toLowerCase();
if (!SHA_RE.test(sha) || !SHA_RE.test(frozen)) fail("les SHA doivent être complets (40 caractères hexadécimaux)");

const resolved = git(factory, ["rev-parse", "--verify", `${sha}^{commit}`]).toString().trim();
if (resolved !== sha) fail(`SHA introuvable ou ambigu dans ${factory} : ${sha}`);
git(factory, ["rev-parse", "--verify", `${frozen}^{commit}`]);

// Blobs attendus (mode 100644 uniquement : aucun lien, aucun exécutable, aucun sous-module).
const lsTree = git(factory, ["ls-tree", "-r", "-z", sha, "--", ...ARCHIVE_PATHS]).toString();
const expectedBlobs = {};
for (const entry of lsTree.split("\0").filter(Boolean)) {
  const [meta, path] = entry.split("\t");
  const [mode, type, oid] = meta.split(" ");
  if (mode !== "100644" || type !== "blob") fail(`entrée non prise en charge ${mode} ${type} ${path}`);
  expectedBlobs[path] = oid;
}
for (const p of ARCHIVE_PATHS) {
  if (!Object.keys(expectedBlobs).some((k) => k === p || k.startsWith(`${p}/`))) fail(`chemin absent au SHA ${sha} : ${p}`);
}

// Zone de transit dans le dépôt (même volume que c0/ : le renommage final est atomique).
const staging = mkdtempSync(join(REPO_ROOT, ".c0-sync-"));
try {
  const tar = git(factory, ["archive", "--format=tar", sha, "--", ...ARCHIVE_PATHS]);
  execFileSync("tar", ["-x", "-f", "-", "-C", staging], { input: tar });

  const { files, odd } = walkC0(staging);
  if (odd.length) fail(`entrées inattendues dans l'archive : ${odd.join(", ")}`);
  const expectedPaths = Object.keys(expectedBlobs).sort();
  if (JSON.stringify([...files].sort()) !== JSON.stringify(expectedPaths)) {
    fail("la liste des fichiers extraits diffère de git ls-tree");
  }
  for (const rel of files) {
    if (gitBlobSha1(readFileSync(join(staging, rel))) !== expectedBlobs[rel]) fail(`octets extraits ≠ blob git : ${rel}`);
  }

  const fileMap = sortedObject(hashFiles(staging, files));
  const manifest = {
    factory_repo: FACTORY_REPO,
    frozen_code_sha: frozen,
    archived_from_sha: sha,
    archive_paths: ARCHIVE_PATHS,
    contract_version: CONTRACT_VERSION,
    tree_digest_rule: "sha256 de la concaténation triée (octets UTF-8 du chemin) de \"<chemin>\\t<sha256>\\n\"",
    file_count: files.length,
    tree_digest: treeDigest(fileMap),
    files: fileMap,
  };
  writeFileSync(join(staging, MANIFEST_REL), `${JSON.stringify(manifest, null, 2)}\n`);

  // Remplacement complet de c0/ (pas de fusion) : l'ancien dossier, dist/ et node_modules/ compris, disparaît.
  const target = join(REPO_ROOT, "c0");
  if (existsSync(target)) rmSync(target, { recursive: true, force: true });
  renameSync(join(staging, "c0"), target);
  console.log(`C0_SYNC_OK archived_from=${sha} frozen=${frozen} files=${files.length} tree_digest=${manifest.tree_digest}`);
} finally {
  rmSync(staging, { recursive: true, force: true });
}
