/**
 * Cercle 4, lot T : les deux routes de transport sans signature C0 (docs/contracts/c0_transport_v1.md §4 et §5).
 *   POST /api/site/publish/media/missing  {"media": [{"sha256", "size"}]} -> {"outcome": "MEDIA_MISSING", "missing": [...]}
 *   GET  /api/site/link/probe             -> l'état du SITE (sonde signée de l'écran Liaison), rien d'autre n'est envoyé
 * L'anti-rejeu daté, la clé et la signature de la réponse sont tenus par `handleTransport` (lib/site-publish/http.ts).
 */
import type { Pool } from "pg";
import { getActiveGeneration } from "../site-db/generation";
import { siteDetails } from "../site-health/details";
import type { ReceiverResponse } from "../site-publish/receiver";
import { instant } from "../site-publish/transport-gate";

export const MAX_MISSING_ENTRIES = 5000;
export const MAX_MISSING_BYTES = 1024 * 1024;
export const PROBE_VERSION = "prodes.site_link_probe.v1";
const SHA = /^[0-9a-f]{64}$/;

function json(status: number, value: unknown): ReceiverResponse {
  return { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }, body: new TextEncoder().encode(JSON.stringify(value)) };
}

/** Les empreintes demandées que le SITE n'a pas, dans l'ordre de la demande (4.3). */
export async function missingMedia(pool: Pool, body: Uint8Array): Promise<ReceiverResponse> {
  let wanted: string[];
  try {
    const doc = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body)) as { media?: unknown };
    if (!Array.isArray(doc.media) || doc.media.length > MAX_MISSING_ENTRIES) throw new Error("media");
    wanted = doc.media.map((entry) => {
      const sha = (entry as { sha256?: unknown }).sha256;
      if (typeof sha !== "string" || !SHA.test(sha)) throw new Error("sha256");
      return sha;
    });
  } catch {
    return json(400, { accepted: false, outcome: "TRANSPORT_ERROR", operation: "MEDIA_MISSING", transport_error: "REQUEST_INVALID", error_codes: [] });
  }
  const unique = [...new Set(wanted)];
  const { rows } = unique.length === 0 ? { rows: [] as { sha256: string }[] } : await pool.query("SELECT sha256 FROM site_media WHERE sha256 = ANY($1::char(64)[])", [unique]);
  const present = new Set(rows.map((row: { sha256: string }) => row.sha256));
  return json(200, { outcome: "MEDIA_MISSING", missing: unique.filter((sha) => !present.has(sha)) });
}

/** La sonde (4.5, S03) : version, génération et contenus actifs, base, disque, heure, sauvegarde. Hors fenêtre : l'heure seule. */
export async function probe(pool: Pool, keyId: string | null, nonce: string | null, stale: boolean, now: Date = new Date()): Promise<ReceiverResponse> {
  const base = { probe_version: PROBE_VERSION, server_time_utc: instant(now), request_nonce: nonce, key_id_seen: keyId };
  if (stale) return json(200, { ...base, outcome: "CLOCK_SKEW" });
  const details = await siteDetails(pool, process.env, now);
  const active = await getActiveGeneration(pool).catch(() => null);
  const content = await pool.query("SELECT payload_sha256 FROM site_content_active WHERE singleton = 1").then((r) => r.rows[0]?.payload_sha256 ?? null, () => null);
  const site = {
    commit: details.commit,
    active_publication: active && active.snapshot ? { publication_id: active.snapshot.publication_id, catalogue_sequence: active.catalogue_sequence } : null,
    active_content_sha256: content,
    db_bytes: details.db_bytes,
    disk_free_bytes: details.disk_free_bytes,
    disk_total_bytes: details.disk_total_bytes,
    last_backup_utc: details.last_backup_utc,
  };
  return json(200, { ...base, outcome: "OK", site });
}
