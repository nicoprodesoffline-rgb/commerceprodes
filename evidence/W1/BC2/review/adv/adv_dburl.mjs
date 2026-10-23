// Reviewer BC2 — garde-fou SITE_DATABASE_URL : le nom de base contrôlé est-il celui auquel pg se connecte ?
import { createRequire } from "node:module";
import { sitePool } from "./common.mjs";
const require = createRequire(import.meta.url);
const { parse } = require("pg-connection-string");
const urls = [
  "postgres://prodes_site:local-dev-only@localhost:54318/prodes_factory",
  "postgres://prodes_site:local-dev-only@localhost:54318/prodes_site_rv_bc2?database=prodes_factory",
  "postgres://prodes_site:local-dev-only@localhost:54318/prodes_site_rv_bc2?database=postgres",
  "postgres://prodes_site:local-dev-only@jarvis:5432/prodes_site_prod",
  "postgres://prodes_site:local-dev-only@localhost:54318/prodes_site_rv_bc2?host=jarvis",
];
for (const u of urls) {
  let guard;
  try { guard = `ACCEPTÉ nom=${sitePool.siteDatabaseName(u)}`; } catch (e) { guard = `REFUSÉ ${e.code}`; }
  const p = parse(u);
  console.log(`${u.replace(/local-dev-only/, "***")}\n   garde=${guard} ; pg se connecterait à database=${p.database} host=${p.host}`);
}
// preuve de connexion réelle (base postgres de maintenance locale, jamais la base Factory)
const pool = sitePool.createPool(urls[2], 1);
const { rows } = await pool.query("SELECT current_database() AS db");
console.log(`CONNEXION RÉELLE via createPool(URL ?database=postgres) -> current_database()=${rows[0].db}`);
await pool.end();
