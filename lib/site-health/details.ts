/**
 * Cercle 4, 4.9 (S03) — l'état détaillé du site, rendu par la sonde signée (lot T, eb : `GET /api/site/link/probe`). Ce module ne crée aucune route et ne signe rien ;
 * le public ne voit que `GET /api/site/health`. La génération et les contenus actifs sont lus par la sonde elle-même.
 * Chaque champ illisible vaut `null` (inconnu), jamais une valeur devinée ; un champ en erreur n'empêche pas les autres.
 *
 *   commit             SITE_COMMIT, posé par le déploiement (le commit réellement servi) ; « inconnu » s'il est absent ;
 *   db_bytes           taille de la base (pg_database_size) ;
 *   disk_free_bytes    espace libre, disk_total_bytes espace total du disque qui porte SITE_DISK_PATH (le dossier courant par défaut) ;
 *   server_time_utc    l'heure du serveur ;
 *   last_backup_*      lus dans le fichier d'état de la sauvegarde (SITE_BACKUP_STAMP_PATH : {date_utc, fichier, octets}) ; absent ou illisible = null (inconnu).
 */
import { readFile, statfs } from "node:fs/promises";
import type { Pool } from "pg";

export interface SiteDetails {
  commit: string;
  db_bytes: number | null;
  disk_free_bytes: number | null;
  disk_total_bytes: number | null;
  server_time_utc: string;
  last_backup_utc: string | null;
  last_backup_file: string | null;
  last_backup_bytes: number | null;
}

async function safe<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}

const UTC = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]{8,12}Z$/;

export async function readBackupStamp(path: string | undefined): Promise<{ date_utc: string; file: string | null; bytes: number | null } | null> {
  if (path === undefined || path === "") return null;
  return safe(async () => {
    const doc = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
    const date = doc["date_utc"];
    if (typeof date !== "string" || !UTC.test(date)) return null;
    const file = doc["fichier"];
    const bytes = doc["octets"];
    return { date_utc: date, file: typeof file === "string" && file.length <= 300 ? file : null, bytes: typeof bytes === "number" && Number.isSafeInteger(bytes) && bytes >= 0 ? bytes : null };
  });
}

export async function siteDetails(pool: Pool, env: Record<string, string | undefined> = process.env, now: Date = new Date()): Promise<SiteDetails> {
  const size = await safe(async () => Number((await pool.query("SELECT pg_database_size(current_database()) AS n")).rows[0].n));
  const disk = await safe(() => statfs(env["SITE_DISK_PATH"] || process.cwd()));
  const stamp = await readBackupStamp(env["SITE_BACKUP_STAMP_PATH"]);
  const commit = (env["SITE_COMMIT"] ?? "").trim();
  return {
    commit: /^[0-9a-f]{7,64}$/i.test(commit) ? commit.toLowerCase() : "inconnu",
    db_bytes: size,
    disk_free_bytes: disk === null ? null : Number(disk.bavail) * Number(disk.bsize),
    disk_total_bytes: disk === null ? null : Number(disk.blocks) * Number(disk.bsize),
    server_time_utc: now.toISOString(),
    last_backup_utc: stamp?.date_utc ?? null,
    last_backup_file: stamp?.file ?? null,
    last_backup_bytes: stamp?.bytes ?? null,
  };
}
