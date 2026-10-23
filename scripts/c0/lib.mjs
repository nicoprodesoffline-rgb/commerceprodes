// C0 vendoring : briques partagées par sync.mjs et check.mjs (aucune dépendance hors Node).
// Voir docs/C0_VENDORING.md. Ce module ne modifie jamais un fichier de c0/ : il lit et hache.

import { createHash } from "node:crypto";
import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const FACTORY_REPO = "nicoprodesoffline-rgb/prodes-data-factory-poc";
export const CONTRACT_VERSION = ["site_snapshot.v1", "site_activation.v1", "site_business.v1", "site_events.v1"];
export const MANIFEST_NAME = "C0_SOURCE.json";
export const MANIFEST_REL = `c0/${MANIFEST_NAME}`;

// Chemins extraits par `git archive` du dépôt Factory. Les trois fichiers c0/ts/{package.json,
// tsconfig.json,package-lock.json} sont vendus aussi, pour réutiliser la configuration de compilation
// du jumeau telle quelle (TS 5.9.3, CommonJS) sans l'écrire à la main dans Commerce.
export const ARCHIVE_PATHS = [
  "c0/README.md",
  "c0/fixtures",
  "c0/ts/package-lock.json",
  "c0/ts/package.json",
  "c0/ts/src",
  "c0/ts/test",
  "c0/ts/tsconfig.json",
];

// Arbre du CODE gelé : doit être identique (objets tree git) entre archived_from_sha et frozen_code_sha,
// sinon sync.mjs refuse avec C0_FROZEN_CODE_MISMATCH. c0/python n'est pas vendu mais fait partie du gel.
export const FROZEN_CODE_PATHS = ["c0/fixtures", "c0/python", "c0/ts/src", "c0/ts/test"];

// Répertoires régénérables exclus de l'empreinte (à toute profondeur sous c0/).
export const EXCLUDED_DIRS = new Set(["dist", "node_modules"]);

export const SHA_RE = /^[0-9a-f]{40}$/;

export function sha256Hex(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

// Empreinte git d'un blob (SHA-1 de "blob <taille>\0<octets>") pour comparer l'extraction à l'objet git.
export function gitBlobSha1(bytes) {
  return createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
}

function byteCompare(a, b) {
  return Buffer.compare(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}

// Liste les fichiers de <root>/c0 (chemins POSIX relatifs à <root>, triés octet par octet), hors
// répertoires exclus et hors manifeste. Un lien symbolique ou un type inattendu est retourné dans `odd`.
export function walkC0(root) {
  const files = [];
  const odd = [];
  const base = join(root, "c0");
  const visit = (absDir, relDir) => {
    for (const name of readdirSync(absDir)) {
      const abs = join(absDir, name);
      const rel = `${relDir}/${name}`;
      const st = lstatSync(abs);
      if (st.isDirectory()) {
        if (EXCLUDED_DIRS.has(name)) continue;
        visit(abs, rel);
      } else if (st.isFile()) {
        if (rel === MANIFEST_REL) continue;
        files.push(rel);
      } else {
        odd.push(rel);
      }
    }
  };
  visit(base, "c0");
  files.sort(byteCompare);
  odd.sort(byteCompare);
  return { files, odd };
}

export function hashFiles(root, relPaths) {
  const out = {};
  for (const rel of relPaths) out[rel] = sha256Hex(readFileSync(join(root, rel)));
  return out;
}

// tree_digest = SHA-256 de la concaténation, triée par chemin (octets UTF-8), de "<chemin>\t<sha256>\n".
export function treeDigest(fileMap) {
  const lines = Object.keys(fileMap).sort(byteCompare).map((p) => `${p}\t${fileMap[p]}\n`);
  return sha256Hex(Buffer.from(lines.join(""), "utf8"));
}

export function sortedObject(fileMap) {
  const out = {};
  for (const k of Object.keys(fileMap).sort(byteCompare)) out[k] = fileMap[k];
  return out;
}

export function parseArgs(argv, known) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (!flag.startsWith("--") || !known.includes(flag.slice(2))) {
      throw new Error(`argument inconnu : ${flag} (attendus : ${known.map((k) => `--${k}`).join(" ")})`);
    }
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`valeur manquante pour ${flag}`);
    args[flag.slice(2)] = value;
    i += 1;
  }
  return args;
}
