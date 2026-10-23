#!/usr/bin/env node
// Applique les migrations SQL brutes db/migrations/NNN_<nom>.sql sur la base SITE (SITE_DATABASE_URL).
//
//   SITE_DATABASE_URL=postgres://prodes_site:local-dev-only@localhost:54318/prodes_site_bc2 node scripts/db/migrate.mjs
//
// - Table `schema_migrations(version, name, sha256, applied_at)` ; chaque migration dans SA transaction.
// - Idempotent : une migration déjà appliquée est sautée si son SHA-256 est inchangé, sinon ÉCHEC
//   (`MIGRATION_DRIFT`) : on n'édite jamais une migration appliquée, on en ajoute une nouvelle.
// - Verrou consultatif : deux migrations concurrentes ne se chevauchent pas.
// - Plages : BC2 = 001-009, BC4 = 010-019 (docs/SITE_DB_SCHEMA.md).
// - Garde-fou : la base doit s'appeler prodes_site* (jamais une base Factory).
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DIR = join(ROOT, "db", "migrations");
const FILE_RE = /^(\d{3})_[a-z0-9_]+\.sql$/;
const LOCK_KEY = 4242001; // pg_advisory_xact_lock : migrations SITE

export function siteDatabaseName(url) {
  const name = decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
  if (!/^prodes_site[a-z0-9_]*$/.test(name)) throw new Error(`SITE_DATABASE_URL vise '${name}' : seules les bases prodes_site* sont admises`);
  return name;
}

export function listMigrations(dir = DIR) {
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const out = [];
  for (const file of files) {
    const m = FILE_RE.exec(file);
    if (!m) throw new Error(`nom de migration invalide : ${file}`);
    const sql = readFileSync(join(dir, file));
    out.push({ version: m[1], name: file, sha256: createHash("sha256").update(sql).digest("hex"), sql: sql.toString("utf8") });
  }
  const versions = out.map((x) => x.version);
  if (new Set(versions).size !== versions.length) throw new Error("numéro de migration en double");
  return out;
}

export async function migrate(url, log = console.log) {
  siteDatabaseName(url);
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  const applied = [];
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version char(3) PRIMARY KEY, name text NOT NULL, sha256 char(64) NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`);
    for (const mig of listMigrations()) {
      await client.query("BEGIN");
      try {
        await client.query("SELECT pg_advisory_xact_lock($1)", [LOCK_KEY]);
        const { rows } = await client.query("SELECT sha256 FROM schema_migrations WHERE version = $1", [mig.version]);
        if (rows.length === 1) {
          if (rows[0].sha256 !== mig.sha256) throw new Error(`MIGRATION_DRIFT ${mig.name} : appliquée avec sha256=${rows[0].sha256}, fichier=${mig.sha256}`);
          await client.query("COMMIT");
          log(`skip ${mig.name}`);
          continue;
        }
        await client.query(mig.sql);
        await client.query("INSERT INTO schema_migrations (version, name, sha256) VALUES ($1, $2, $3)", [mig.version, mig.name, mig.sha256]);
        await client.query("COMMIT");
        applied.push(mig.name);
        log(`apply ${mig.name} sha256=${mig.sha256}`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    await client.end();
  }
  return applied;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const url = process.env.SITE_DATABASE_URL;
  if (!url) {
    console.error("SITE_DATABASE_URL absente : aucune valeur par défaut (refus)");
    process.exit(2);
  }
  migrate(url).then(
    (applied) => console.log(`MIGRATIONS_OK db=${siteDatabaseName(url)} applied=${applied.length}`),
    (error) => {
      console.error(`MIGRATIONS_FAILED ${error.message}`);
      process.exit(1);
    },
  );
}
