/**
 * Cercle 3 (3.26, B14) — stockage des aperçus de pages. Le jeton est tiré ICI, au hasard (128 bits) : personne ne peut le deviner, la Factory comprise. Un aperçu vit 30 minutes au
 * plus (le contrat refuse un document qui en demande davantage) et n'est jamais un état actif. Les aperçus expirés sont supprimés à chaque dépôt ; une lecture ne rend jamais un expiré.
 */
import { randomBytes } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { isObject, parseBytes, type Json } from "../../c0/ts/src/jsonc";

export const PREVIEW_MAX_AGE_SECONDS = 1800;
const ID = /^[0-9a-f]{32}$/;
type Q = Pool | PoolClient;

export function newPreviewId(): string {
  return randomBytes(16).toString("hex");
}

export async function savePreview(q: Q, bytes: Uint8Array, expiresAtUtc: string): Promise<string> {
  await q.query("DELETE FROM site_content_preview WHERE expires_at <= now()");
  const id = newPreviewId();
  await q.query("INSERT INTO site_content_preview (preview_id, content_bytes, expires_at) VALUES ($1, $2, $3::timestamptz)", [id, Buffer.from(bytes), expiresAtUtc]);
  return id;
}

/** Le document d'aperçu non expiré de ce jeton, ou null (jeton mal formé, inconnu, expiré). */
export async function readPreview(q: Q, id: string): Promise<Record<string, any> | null> {
  if (!ID.test(id)) return null;
  const { rows } = await q.query("SELECT content_bytes FROM site_content_preview WHERE preview_id = $1 AND expires_at > now()", [id]);
  if (rows.length !== 1) return null;
  try {
    const doc: Json = parseBytes(new Uint8Array(rows[0].content_bytes), 8 * 1024 * 1024);
    return isObject(doc) ? (doc as Record<string, any>) : null;
  } catch {
    return null;
  }
}
