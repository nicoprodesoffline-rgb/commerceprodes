/**
 * Cercle 5, ligne 5.21 : le stockage des réglages de vente actifs (table `site_commerce_active`, migration 022). Lecture revérifiée à chaque fois : des octets altérés ne sont JAMAIS servis
 * (fail-closed : « la boutique n'est pas prête »). Même modèle que les contenus v2 (lib/site-publish/content.ts).
 */
import type { Pool, PoolClient } from "pg";
import { parseBytes, type JsonObject } from "../../c0/ts/src/jsonc";
import { MAX_BYTES, validateCommerce, type CommerceDocument } from "./document";

export type StoredCommerce = { document: CommerceDocument; ack: JsonObject; documentBytes: Uint8Array; ackBytes: Uint8Array };

export async function readActiveCommerce(q: Pool | PoolClient): Promise<StoredCommerce | null> {
  const { rows } = await q.query("SELECT document_bytes, ack_bytes, payload_sha256, commerce_sequence FROM site_commerce_active WHERE singleton = 1");
  if (rows.length !== 1) return null;
  try {
    const documentBytes = new Uint8Array(rows[0].document_bytes);
    const verdict = validateCommerce(documentBytes);
    if (!verdict.accepted || verdict.document.payload_sha256 !== rows[0].payload_sha256 || String(verdict.document.commerce_sequence) !== String(rows[0].commerce_sequence)) return null;
    const ackBytes = new Uint8Array(rows[0].ack_bytes);
    return { document: verdict.document, ack: parseBytes(ackBytes, MAX_BYTES) as JsonObject, documentBytes, ackBytes };
  } catch {
    return null;
  }
}
