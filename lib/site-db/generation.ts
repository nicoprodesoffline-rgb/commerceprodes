/**
 * Lecture de la génération ACTIVE du SITE, pour BC3/BC4. Contrat : docs/SITE_DB_SCHEMA.md.
 *
 * - Toujours relue en base (aucun cache mémoire comme vérité).
 * - Le snapshot est relu depuis les OCTETS stockés (`snapshot_bytes`) par le lecteur strict C0 ;
 *   `status: "UNSAFE"` (fail-closed) si le pointeur et la génération ne concordent pas, si la ligne n'est
 *   pas `ACTIVE` ou si le `payload_sha256` recalculé sur les octets diffère. Aucun marquage opérationnel
 *   « UNSAFE » n'existe en W1 (voir docs/SITE_DB_SCHEMA.md).
 */
import type { PoolClient } from "pg";
import { isCanonical, parseBytes, type Json } from "../../c0/ts/src/jsonc";
import { MAX_BYTES, payloadSha256, type Snapshot } from "../../c0/ts/src/snapshot";
import { getPool, type Queryable } from "./pool";

export interface ActiveGeneration {
  generation_id: number;
  catalogue_sequence: number;
  payload_sha256: string;
  snapshot: Snapshot;
  status: "ACTIVE" | "UNSAFE";
}

interface PointerRow {
  generation_id: string | null;
  p_sequence: string | null;
  p_sha: string | null;
  g_status: string | null;
  g_sequence: string | null;
  g_sha: string | null;
  snapshot_bytes: Buffer | null;
}

const SELECT_ACTIVE = `
  SELECT p.generation_id, p.catalogue_sequence AS p_sequence, p.payload_sha256 AS p_sha,
         g.status AS g_status, g.catalogue_sequence AS g_sequence, g.payload_sha256 AS g_sha, g.snapshot_bytes
    FROM site_active_pointer p
    LEFT JOIN site_generation g ON g.id = p.generation_id
   WHERE p.singleton = 1`;

/** bigint PostgreSQL (chaîne) -> entier JS exact, sinon erreur (C0 : entiers <= 2^53-1). */
export function toSafeInt(value: string | number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(n) || String(n) !== String(value)) throw new Error(`entier hors plage sûre : ${value}`);
  return n;
}

function interpret(row: PointerRow | undefined): ActiveGeneration | null {
  if (row === undefined) throw new Error("site_active_pointer : ligne unique absente (migration 002 non appliquée ?)");
  if (row.generation_id === null) return null;
  const bytes = row.snapshot_bytes === null ? null : new Uint8Array(row.snapshot_bytes);
  let doc: Json = null;
  let consistent = bytes !== null && row.g_status === "ACTIVE" && row.g_sequence === row.p_sequence && row.g_sha === row.p_sha;
  if (bytes !== null) {
    try {
      doc = parseBytes(bytes, MAX_BYTES);
      consistent = consistent && isCanonical(bytes, doc) && payloadSha256(doc as unknown as Snapshot) === row.p_sha;
    } catch {
      consistent = false;
    }
  }
  return {
    generation_id: toSafeInt(row.generation_id),
    catalogue_sequence: toSafeInt(row.p_sequence as string),
    payload_sha256: row.p_sha as string,
    snapshot: doc as unknown as Snapshot,
    status: consistent ? "ACTIVE" : "UNSAFE",
  };
}

/** Génération ACTIVE (lecture simple, sans verrou), ou null si aucune activation n'a eu lieu. */
export async function getActiveGeneration(client?: Queryable): Promise<ActiveGeneration | null> {
  const q: Queryable = client ?? getPool();
  const { rows } = await q.query<PointerRow>(SELECT_ACTIVE);
  return interpret(rows[0]);
}

/**
 * Même lecture, DANS la transaction de l'appelant, avec un verrou PARTAGÉ (`FOR SHARE`) sur la ligne du
 * pointeur : aucune activation (qui prend `FOR UPDATE`) ne peut basculer la génération avant le COMMIT
 * ou le ROLLBACK de l'appelant. L'appelant doit avoir ouvert la transaction (BEGIN).
 */
export async function readActiveForUpdate(client: PoolClient): Promise<ActiveGeneration | null> {
  const { rows } = await client.query<PointerRow>(`${SELECT_ACTIVE} FOR SHARE OF p`);
  return interpret(rows[0]);
}
