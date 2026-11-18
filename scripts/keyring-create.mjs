#!/usr/bin/env node
// Cercle 4, ligne 4.2 : fabrique ou fait tourner le trousseau de la liaison Factory -> SITE (format prodes.site_keyring.v1,
// docs/contracts/c0_transport_v1.md §2). Node sans dépendance : les vrais secrets naissent sur le serveur, qui n'a pas Python.
//
//   node scripts/keyring-create.mjs --nature real --prefix tampon- --out /etc/prodes/trousseau.json
//   node scripts/keyring-create.mjs --nature real --prefix tampon- --out <même fichier> --from <fichier> --rotate publish
//   node scripts/keyring-create.mjs --nature real --prefix tampon- --out <même fichier> --from <fichier> --retire tampon-publish-01
//
// Un secret par usage (publication, accusé, événements), 32 octets aléatoires. Le fichier est écrit en 0600, jamais écrasé
// (sauf le fichier --from lui-même, par remplacement atomique). Rien n'affiche jamais une valeur : la sortie ne porte que les
// identifiants, les portées et les statuts. Codes de sortie : 0 fait, 2 arguments invalides, 3 fichier existant ou trousseau illisible.
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, renameSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve, basename, join } from "node:path";

export const KEYRING_VERSION = "prodes.site_keyring.v1";
export const TEST_SECRET_PREFIX = "TEST_SECRET_NOT_FOR_PRODUCTION";
export const USAGES = { publish: "site_snapshot.publish", ack: "activation_ack", events: "site_events.read" };
const KEY_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;

class UsageError extends Error {
  constructor(message, code = 2) {
    super(message);
    this.code = code;
  }
}

export function makeKeyring({ nature, prefix, base = null, rotate = [], retire = [], random = randomBytes, now = new Date() }) {
  if (nature !== "test" && nature !== "real") throw new UsageError("--nature test ou real");
  if (!prefix || !KEY_ID.test(`${prefix}publish-01`)) throw new UsageError("--prefix : lettres, chiffres, . _ : -");
  if (base !== null && base.nature !== nature) throw new UsageError("la rotation garde la nature du trousseau");
  const keys = base === null ? [] : base.keys.map((entry) => ({ ...entry }));
  const taken = new Set(keys.map((entry) => entry.key_id));
  const wanted = base === null ? Object.keys(USAGES) : rotate;
  for (const usage of wanted) {
    if (!(usage in USAGES)) throw new UsageError(`usage inconnu : ${usage} (publish, ack, events)`);
    let serial = 1;
    while (taken.has(`${prefix}${usage}-${String(serial).padStart(2, "0")}`)) serial += 1;
    const keyId = `${prefix}${usage}-${String(serial).padStart(2, "0")}`;
    taken.add(keyId);
    const body = Buffer.from(random(32)).toString("hex");
    keys.push({ key_id: keyId, scope: USAGES[usage], status: "ACTIVE", secret_utf8: nature === "test" ? `${TEST_SECRET_PREFIX}/${body}` : body });
  }
  for (const keyId of retire) {
    const entry = keys.find((candidate) => candidate.key_id === keyId);
    if (!entry) throw new UsageError(`clé absente : ${keyId}`);
    entry.status = "RETIRED";
  }
  const created = base?.created_utc ?? now.toISOString().replace(/\.\d{3}Z$/, "Z");
  return { keyring_version: KEYRING_VERSION, nature, created_utc: created, keys };
}

export function summary(keyring) {
  return { keyring_version: keyring.keyring_version, nature: keyring.nature, keys: keyring.keys.map(({ key_id, scope, status }) => ({ key_id, scope, status })) };
}

function readKeyring(path) {
  let keyring;
  try {
    keyring = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new UsageError(`trousseau illisible : ${path}`, 3);
  }
  if (keyring?.keyring_version !== KEYRING_VERSION || !Array.isArray(keyring.keys)) throw new UsageError(`trousseau au format inattendu : ${path}`, 3);
  return keyring;
}

function writePrivate(path, keyring) {
  mkdirSync(dirname(path), { recursive: true });
  const temp = join(dirname(path), `.${basename(path)}.tmp`);
  try {
    writeFileSync(temp, `${JSON.stringify(keyring, null, 1)}\n`, { encoding: "utf8", mode: 0o600, flag: "w" });
    renameSync(temp, path);
  } catch (error) {
    rmSync(temp, { force: true });
    throw error;
  }
}

function parse(argv) {
  const options = { rotate: [], retire: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!["--nature", "--prefix", "--out", "--from", "--rotate", "--retire"].includes(name) || value === undefined) throw new UsageError(`argument inattendu : ${name}`);
    index += 1;
    if (name === "--rotate") options.rotate.push(value);
    else if (name === "--retire") options.retire.push(value);
    else options[name.slice(2)] = value;
  }
  if (!options.nature || !options.prefix || !options.out) throw new UsageError("--nature, --prefix et --out sont obligatoires");
  if (options.from && options.rotate.length === 0 && options.retire.length === 0) throw new UsageError("--from demande --rotate ou --retire");
  if (!options.from && (options.rotate.length || options.retire.length)) throw new UsageError("--rotate et --retire demandent --from");
  return options;
}

export function main(argv, out = process.stdout) {
  const options = parse(argv);
  const target = resolve(options.out);
  const base = options.from ? readKeyring(resolve(options.from)) : null;
  if (existsSync(target) && (!options.from || resolve(options.from) !== target)) throw new UsageError(`${options.out} existe déjà : rien n'est écrasé`, 3);
  const keyring = makeKeyring({ nature: options.nature, prefix: options.prefix, base, rotate: options.rotate, retire: options.retire });
  writePrivate(target, keyring);
  out.write(`${JSON.stringify(summary(keyring))}\n`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("keyring-create.mjs")) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = error instanceof UsageError ? error.code : 1;
  }
}
