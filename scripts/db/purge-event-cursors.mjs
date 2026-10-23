#!/usr/bin/env node
// Purge des curseurs de poll `site_event_cursor` et des nonces `site_event_poll_nonce` (DF-0115, W4 lot I).
//
//   SITE_DATABASE_URL=postgres://prodes_site:local-dev-only@localhost:54318/prodes_site_xxx \
//     node scripts/db/purge-event-cursors.mjs [--cursor-retention-hours 168] [--nonce-retention-hours 24] [--dry-run]
//
// Politique (docs/SITE_TRANSPORT_STAGING.md, annexe BC4) : un curseur émis il y a plus de la rétention est supprimé,
// SAUF le plus récent de chaque clé site_events.read ; un nonce dont issued_at est plus ancien que la rétention est
// supprimé (un poll aussi ancien est de toute façon refusé POLL_STALE : la fenêtre est ≤ 1 h). Rétention < 1 h refusée.
// Aucun événement n'est touché (site_outbox_event n'est jamais purgé ici). Sortie : une ligne JSON.
// Même garde-fou de base que migrate.mjs : base prodes_site* locale, jamais JARVIS.
import pg from "pg";
import { siteDatabaseName } from "./migrate.mjs";

function parseArgs(argv) {
  const out = { cursorRetentionHours: 168, nonceRetentionHours: 24, dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") out.dryRun = true;
    else if (arg === "--cursor-retention-hours" || arg === "--nonce-retention-hours") {
      const value = argv[i + 1];
      i += 1;
      if (!/^[1-9][0-9]{0,4}$/.test(value ?? "")) throw new Error(`${arg} : entier d'heures attendu (reçu ${JSON.stringify(value)})`);
      out[arg === "--cursor-retention-hours" ? "cursorRetentionHours" : "nonceRetentionHours"] = Number(value);
    } else throw new Error(`argument inconnu : ${arg}`);
  }
  return out;
}

const url = process.env.SITE_DATABASE_URL;
if (!url) {
  console.error("SITE_DATABASE_URL absente : aucune valeur par défaut (refus)");
  process.exit(2);
}
let options;
try {
  siteDatabaseName(url);
  options = parseArgs(process.argv.slice(2));
} catch (error) {
  console.error(`PURGE_REFUSED ${error.message}`);
  process.exit(2);
}
const client = new pg.Client({ connectionString: url });
try {
  await client.connect();
  const { rows } = await client.query(
    "SELECT cursors_deleted::text, cursors_kept::text, nonces_deleted::text FROM site_purge_event_cursors(make_interval(hours => $1), make_interval(hours => $2), $3)",
    [options.cursorRetentionHours, options.nonceRetentionHours, options.dryRun],
  );
  const r = rows[0];
  console.log(JSON.stringify({
    outcome: options.dryRun ? "PURGE_DRY_RUN" : "PURGED",
    db: siteDatabaseName(url),
    cursor_retention_hours: options.cursorRetentionHours,
    nonce_retention_hours: options.nonceRetentionHours,
    cursors_deleted: Number(r.cursors_deleted),
    cursors_kept: Number(r.cursors_kept),
    nonces_deleted: Number(r.nonces_deleted),
  }));
} catch (error) {
  console.error(`PURGE_FAILED ${error.message}`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => undefined);
}
