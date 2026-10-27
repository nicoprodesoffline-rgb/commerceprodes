/**
 * Lecture de la génération ACTIVE du SITE, pour BC3/BC4. Contrat : docs/SITE_DB_SCHEMA.md.
 *
 * - Le POINTEUR et l'identité physique de la ligne de génération sont relus en base À CHAQUE appel (sonde légère,
 *   sans les octets du document). Le document, lui, n'est relu, reparsé et reverifié (forme canonique, SHA-256) que
 *   lorsque la sonde diffère de celle de la dernière vérification complète réussie (W6-P, cache de vérification).
 *   La clé de la sonde (voir `cacheKey`) couvre : identifiant, séquence, SHA du pointeur ET de la ligne, statut,
 *   version physique de la ligne (`xmin`, `ctid` : tout UPDATE, même déclencheur d'immutabilité désactivé, les change)
 *   et taille des octets. Un document modifié sous la même (identifiant, séquence, SHA) est donc relu, reverifié et
 *   refusé (`UNSAFE`), jamais servi depuis le cache. Seul un résultat `ACTIVE` vérifié est mis en cache, pour au plus
 *   `GENERATION_CACHE_MAX_AGE_MS` (5 min) : au-delà, relecture et revérification complètes même sonde inchangée.
 *   Tout résultat de lecture complète (`UNSAFE` compris) est gelé avant d'être partagé entre lecteurs simultanés.
 * - Le snapshot est relu depuis les OCTETS stockés (`snapshot_bytes`) par le lecteur strict C0 ;
 *   `status: "UNSAFE"` (fail-closed) si le pointeur et la génération ne concordent pas, si la ligne n'est
 *   pas `ACTIVE` ou si le `payload_sha256` recalculé sur les octets diffère. Aucun marquage opérationnel
 *   « UNSAFE » n'existe en W1 (voir docs/SITE_DB_SCHEMA.md).
 */
import type { PoolClient } from "pg";
import { isCanonical, parseBytes, type Json } from "../../c0/ts/src/jsonc";
import { MAX_BYTES, payloadSha256, type Snapshot } from "../../c0/ts/src/snapshot";
import { getPool, type Queryable } from "./pool";
import { markVerified } from "./verified";

export interface ActiveGeneration {
  generation_id: number;
  catalogue_sequence: number;
  payload_sha256: string;
  /** `null` dès que `status` vaut `UNSAFE` (review F-05) : jamais un document non vérifié. */
  snapshot: Snapshot | null;
  status: "ACTIVE" | "UNSAFE";
}

interface ProbeRow {
  generation_id: string | null;
  p_sequence: string | null;
  p_sha: string | null;
  g_status: string | null;
  g_sequence: string | null;
  g_sha: string | null;
  /** Version physique de la ligne (xmin, ctid) et taille des octets : lues dans la MÊME instruction que les octets. */
  g_xmin: string | null;
  g_ctid: string | null;
  g_len: string | null;
}

interface PointerRow extends ProbeRow {
  snapshot_bytes: Buffer | null;
}

const PROBE_COLUMNS = `
  SELECT p.generation_id, p.catalogue_sequence AS p_sequence, p.payload_sha256 AS p_sha,
         g.status AS g_status, g.catalogue_sequence AS g_sequence, g.payload_sha256 AS g_sha,
         g.xmin::text AS g_xmin, g.ctid::text AS g_ctid, octet_length(g.snapshot_bytes)::text AS g_len`;
const FROM_ACTIVE = `
    FROM site_active_pointer p
    LEFT JOIN site_generation g ON g.id = p.generation_id
   WHERE p.singleton = 1`;
const SELECT_PROBE = `${PROBE_COLUMNS}${FROM_ACTIVE}`;
const SELECT_ACTIVE = `${PROBE_COLUMNS}, g.snapshot_bytes${FROM_ACTIVE}`;

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
      consistent = consistent && isCanonical(bytes, doc) && payloadSha256(doc as unknown as Snapshot) === row.p_sha; // MUTATION_POINT:verify
    } catch {
      consistent = false;
    }
  }
  return {
    generation_id: toSafeInt(row.generation_id),
    catalogue_sequence: toSafeInt(row.p_sequence as string),
    payload_sha256: row.p_sha as string,
    snapshot: consistent ? (doc as unknown as Snapshot) : null,
    status: consistent ? "ACTIVE" : "UNSAFE",
  };
}

/** Gèle récursivement un document vérifié : il est partagé entre requêtes, aucune requête ne doit pouvoir le modifier. */
export function deepFreeze<T>(root: T): T {
  const stack: unknown[] = [root];
  while (stack.length > 0) {
    const value = stack.pop();
    if (value === null || typeof value !== "object" || ArrayBuffer.isView(value)) continue;
    for (const child of Object.values(value)) stack.push(child);
    Object.freeze(value);
  }
  return root;
}

/**
 * Clé de la dernière vérification complète. `null` = ligne absente ou incomplète : jamais mise en cache.
 * Toute composante qui change (pointeur basculé, statut, SHA, séquence, version physique de la ligne, taille des
 * octets) impose une relecture et une vérification COMPLÈTES.
 */
function cacheKey(row: ProbeRow): string | null {
  if (row.generation_id === null || row.g_status === null || row.g_xmin === null || row.g_ctid === null || row.g_len === null) return null;
  return [row.generation_id, row.p_sequence, row.p_sha, row.g_status, row.g_sequence, row.g_sha, row.g_xmin, row.g_ctid, row.g_len].join("|"); // MUTATION_POINT:key
}

/** Âge maximal d'une vérification complète (relecture de sécurité W6-P) : au-delà, relecture et revérification COMPLÈTES même si la sonde est inchangée. */
export const GENERATION_CACHE_MAX_AGE_MS = 5 * 60 * 1000;

const defaultClock = (): number => Date.now();
let clock: () => number = defaultClock;

/** Horloge du cache (tests seulement : vieillir le cache sans attendre). `resetGenerationCache` la rétablit. */
export function setGenerationCacheClock(now: () => number): void {
  clock = now;
}

let verified: { key: string; value: ActiveGeneration; at: number } | null = null;
const inflight = new Map<string, Promise<ActiveGeneration | null>>();
const stats = { probes: 0, hits: 0, full_loads: 0 };

/** Compteurs d'observation (tests, diagnostic) : sondes légères, réponses servies du cache, lectures complètes. */
export function generationCacheStats(): { probes: number; hits: number; full_loads: number } {
  return { ...stats };
}

/** Vide le cache (tests, changement de base). Sans effet sur la sécurité : la prochaine lecture est complète. */
export function resetGenerationCache(): void {
  verified = null;
  clock = defaultClock;
  inflight.clear();
  stats.probes = 0;
  stats.hits = 0;
  stats.full_loads = 0;
}

async function readActive(q: Queryable, lock: string): Promise<ActiveGeneration | null> {
  const probe = (await q.query<ProbeRow>(`${SELECT_PROBE}${lock}`)).rows[0];
  stats.probes += 1;
  const key = probe === undefined ? null : cacheKey(probe);
  if (key !== null && verified !== null && verified.key === key && clock() - verified.at < GENERATION_CACHE_MAX_AGE_MS) { // MUTATION_POINT:hit
    stats.hits += 1;
    return verified.value;
  }
  const load = async (): Promise<ActiveGeneration | null> => {
    stats.full_loads += 1;
    const row = (await q.query<PointerRow>(`${SELECT_ACTIVE}${lock}`)).rows[0];
    // Tout résultat de `load()` est gelé avant d'être partagé entre lecteurs simultanés (`inflight`), `UNSAFE` compris.
    const active = deepFreeze(interpret(row)); // MUTATION_POINT:freeze
    const fullKey = row === undefined ? null : cacheKey(row);
    // Seul un document VÉRIFIÉ (ACTIVE) est conservé, avec la clé de la ligne réellement lue et vérifiée.
    if (active !== null && active.status === "ACTIVE" && active.snapshot !== null && fullKey !== null) {
      markVerified(active.snapshot);
      verified = { key: fullKey, value: active, at: clock() };
    } else {
      verified = null;
    }
    return active;
  };
  // Hors verrou (lecture simple), les arrivées simultanées d'une même clé partagent UNE lecture complète.
  if (key === null || lock !== "") return load();
  const pending = inflight.get(key);
  if (pending !== undefined) return pending;
  const started = load().finally(() => inflight.delete(key));
  inflight.set(key, started);
  return started;
}

/** Génération ACTIVE (lecture simple, sans verrou), ou null si aucune activation n'a eu lieu. */
export async function getActiveGeneration(client?: Queryable): Promise<ActiveGeneration | null> {
  return readActive(client ?? getPool(), "");
}

/**
 * Même lecture, DANS la transaction de l'appelant, avec un verrou PARTAGÉ (`FOR SHARE`) sur la ligne du
 * pointeur : aucune activation (qui prend `FOR UPDATE`) ne peut basculer la génération avant le COMMIT
 * ou le ROLLBACK de l'appelant. L'appelant doit avoir ouvert la transaction (BEGIN).
 */
export async function readActiveForUpdate(client: PoolClient): Promise<ActiveGeneration | null> {
  return readActive(client, " FOR SHARE OF p");
}
