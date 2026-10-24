import { createRequire } from "node:module";
import { sitePool } from "./common.mjs";
const require = createRequire(import.meta.url);
const { parse } = require("pg-connection-string");
const urls = [
  "postgres://u:p@localhost:54318@jarvis:5432/prodes_site_x",
  "postgres://u:p@%6Aarvis:5432/prodes_site_x",
  "postgres://u:p@localhost,jarvis:5432/prodes_site_x",
  "postgres://u:p@localhost:54318/prodes_site_x?HOST=jarvis",
  "postgres://u:p@localhost:54318/prodes_site_x?Host=jarvis&sslmode=disable",
  "postgres://u:p@[::1]:54318/prodes_site_x",
  "postgres://u:p@%2Ftmp:54318/prodes_site_x",
  "postgres://u:p@100.101.102.103:5432/prodes_site_x",
  "postgres://u:p@localhost:54318/prodes_site_x?application_name=x&fallback_application_name=y",
  "postgres://u:p@0.0.0.0:54318/prodes_site_x",
];
for (const u of urls) for (const allow of [undefined, "1"]) {
  let g; try { g = `ACCEPTÉ nom=${sitePool.siteDatabaseName(u, { SITE_ALLOW_REMOTE_DB: allow })}`; } catch (e) { g = `REFUSÉ (${e.message})`; }
  let p; try { const c = parse(u); p = `pg→host=${c.host} db=${c.database}`; } catch (e) { p = `pg parse erreur ${e.message}`; }
  console.log(`${u} ALLOW=${allow ?? "-"} : garde=${g} ; ${p}`);
}
