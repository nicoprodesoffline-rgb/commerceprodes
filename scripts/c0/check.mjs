#!/usr/bin/env node
// Contrôle anti-drift du C0 vendu : recalcule les empreintes de c0/ (hors dist/, node_modules/ et
// le manifeste lui-même) et les compare à c0/C0_SOURCE.json.
//
//   node scripts/c0/check.mjs [--root <racine du dépôt>]
//
// Succès : « C0_VENDOR_OK sha=<frozen_code_sha> files=<n> » (code 0).
// Échec  : « C0_VENDOR_DRIFT ... » suivi de lignes ADDED / MISSING / MODIFIED / UNSUPPORTED (code 1).

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MANIFEST_REL, SHA_RE, hashFiles, parseArgs, treeDigest, walkC0 } from "./lib.mjs";

const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

function drift(reason, lines = []) {
  console.error(`C0_VENDOR_DRIFT ${reason}`);
  for (const line of lines) console.error(line);
  process.exit(1);
}

let args;
try {
  args = parseArgs(process.argv.slice(2), ["root"]);
} catch (err) {
  drift(err.message);
}
const root = resolve(args.root ?? DEFAULT_ROOT);
const manifestPath = join(root, MANIFEST_REL);
if (!existsSync(manifestPath)) drift(`manifeste absent : ${MANIFEST_REL}`);

let manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
} catch (err) {
  drift(`manifeste illisible : ${err.message}`);
}
const recorded = manifest.files;
if (!recorded || typeof recorded !== "object") drift("manifeste sans champ files");
if (!SHA_RE.test(String(manifest.frozen_code_sha))) drift("frozen_code_sha absent ou invalide");
if (treeDigest(recorded) !== manifest.tree_digest) drift("tree_digest du manifeste incohérent avec son champ files");

const { files, odd } = walkC0(root);
const actual = hashFiles(root, files);
const problems = [];
for (const p of odd) problems.push(`UNSUPPORTED ${p}`);
for (const p of files) {
  if (!(p in recorded)) problems.push(`ADDED ${p}`);
  else if (recorded[p] !== actual[p]) problems.push(`MODIFIED ${p} attendu=${recorded[p]} obtenu=${actual[p]}`);
}
for (const p of Object.keys(recorded)) if (!(p in actual)) problems.push(`MISSING ${p}`);
if (problems.length) drift(`sha=${manifest.frozen_code_sha} divergences=${problems.length}`, problems);
if (manifest.file_count !== undefined && manifest.file_count !== files.length) drift("file_count incohérent");

console.log(`C0_VENDOR_OK sha=${manifest.frozen_code_sha} files=${files.length} tree_digest=${manifest.tree_digest}`);
