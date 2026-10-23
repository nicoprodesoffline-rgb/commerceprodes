/**
 * Lecture sortante des événements par la Factory (C0 §11.3) et ACK — transport `STAGING_TRANSPORT`
 * (annexe « Poll / ACK des événements » de docs/SITE_TRANSPORT_STAGING.md).
 *
 * `GET /api/site/events?cursor=&limit=` : en-têtes `x-c0-key-id`, `x-c0-issued-at`, `x-c0-nonce`, `x-c0-signature` =
 *   hex(HMAC-SHA256(secret, "prodes.c0.transport.events_poll.v2" 0x00 canonical({cursor, issued_at_utc, limit, nonce}))),
 *   clé de scope `site_events.read`. Ordre : scope → en-têtes de fraîcheur (`POLL_FRESHNESS_REQUIRED`) → signature
 *   (`EVENT_UNAUTHORIZED`) → fenêtre `SITE_EVENTS_POLL_WINDOW_SECONDS` (`POLL_STALE`) → nonce jamais vu pour cette clé
 *   (`POLL_REPLAYED`) — tous en 401 `EVENT_UNAUTHORIZED` avec `transport_error` (anti-rejeu DF-0115, hors C0) →
 *   `validatePollRequest` C0 (`EVENT_UNAUTHORIZED`, `CURSOR_INVALID`) → service des `event_bytes` NON ACQUITTÉS dans
 *   l'ordre `id` (un événement non acquitté est re-servi) → `DELIVERED_TO_POLL` → nouveau curseur opaque émis et
 *   enregistré → COMMIT → réponse. Purge des curseurs et nonces : `purgeEventCursors` (`site_purge_event_cursors`, 017).
 * `POST /api/site/events/ack` : corps `{cursor}` ou `{event_ids:[…]}`, signé (domaine `prodes.c0.transport.events_ack.v1`,
 *   contexte = le corps lu), même scope → `ACKED`.
 */
import type { Pool, PoolClient } from "pg";
import { validatePollRequest } from "../../c0/ts/src/events";
import { isToken } from "../../c0/ts/src/formats";
import { isObject, parseBytes, sha256Hex, type Json, type JsonObject } from "../../c0/ts/src/jsonc";
import { SCOPE_EVENTS_READ, keyHasScope, verify } from "../../c0/ts/src/signing";
import { appendLog, checkout, errorReason, httpStatusFor, json, opaqueRef, type TxResponse } from "./common";
import { TransactionsConfigError } from "./config";

/** Domaine de signature du poll depuis DF-0115 (contexte {cursor, issued_at_utc, limit, nonce}). */
export const EVENTS_POLL_DOMAIN = "prodes.c0.transport.events_poll.v2";
/** Domaine W1 ({cursor, limit} sans fraîcheur) : REFUSÉ depuis DF-0115 (une requête capturée se rejouait sans limite). */
export const LEGACY_EVENTS_POLL_DOMAIN_V1 = "prodes.c0.transport.events_poll.v1";
/** Fenêtre d'acceptation de `issued_at_utc` (|horloge serveur − issued_at| ≤ fenêtre) : défaut 300 s, bornes 5…3600. */
export const DEFAULT_POLL_WINDOW_SECONDS = 300;
export const MIN_POLL_WINDOW_SECONDS = 5;
export const MAX_POLL_WINDOW_SECONDS = 3600;
export const DEFAULT_CURSOR_RETENTION_HOURS = 168;
export const DEFAULT_NONCE_RETENTION_HOURS = 24;
const ISSUED_AT_RE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$/;
const NONCE_RE = /^[0-9a-f]{32}$/;
const WINDOW_RE = /^[1-9][0-9]{0,4}$/;
export const EVENTS_ACK_DOMAIN = "prodes.c0.transport.events_ack.v1";
export const MAX_ACK_IDS = 500;
const MAX_ACK_BYTES = 64 * 1024;
const LIMIT_RE = /^(0|[1-9][0-9]{0,15})$/;

export interface EventsDeps {
  pool: Pool;
  keyring: Json;
  /** Fenêtre anti-rejeu en secondes ; absente → `SITE_EVENTS_POLL_WINDOW_SECONDS` (défaut 300). */
  windowSeconds?: number;
  /** Horloge RÉELLE du serveur en millisecondes (jamais `SITE_NOW_UTC`, figée pour les fixtures) ; tests : injectable. */
  clockMs?: () => number;
}

/** `SITE_EVENTS_POLL_WINDOW_SECONDS` : entier décimal 5…3600 ; absente → 300 ; invalide → erreur de configuration (503). */
export function pollWindowSeconds(env: Record<string, string | undefined> = process.env): number {
  const raw = env["SITE_EVENTS_POLL_WINDOW_SECONDS"];
  if (raw === undefined || raw === "") return DEFAULT_POLL_WINDOW_SECONDS;
  const n = WINDOW_RE.test(raw) ? Number(raw) : NaN;
  if (!Number.isSafeInteger(n) || n < MIN_POLL_WINDOW_SECONDS || n > MAX_POLL_WINDOW_SECONDS) {
    throw new TransactionsConfigError(`SITE_EVENTS_POLL_WINDOW_SECONDS doit être un entier de ${MIN_POLL_WINDOW_SECONDS} à ${MAX_POLL_WINDOW_SECONDS} (reçu : ${JSON.stringify(raw)})`);
  }
  return n;
}

export type PollFreshnessError = "POLL_FRESHNESS_REQUIRED" | "POLL_STALE" | "POLL_REPLAYED";

type HeaderBag = { get(name: string): string | null };

const refused = (code: "EVENT_UNAUTHORIZED" | "CURSOR_INVALID", transportError?: PollFreshnessError): TxResponse =>
  json(httpStatusFor([code]), {
    contract_version: "site_events.v1",
    accepted: false,
    outcome: "REJECTED",
    error_codes: [code],
    ...(transportError ? { transport_error: transportError } : {}),
  });

function credential(headers: HeaderBag): { keyId: string | null; signature: string | null } {
  return { keyId: headers.get("x-c0-key-id"), signature: headers.get("x-c0-signature") };
}

/** `limit` : décimal strict → entier ; sinon la chaîne brute (C0 la refusera `CURSOR_INVALID`) ; absent → null. */
function parseLimit(raw: string | null): Json {
  if (raw === null) return null;
  if (LIMIT_RE.test(raw)) {
    const n = Number(raw);
    if (Number.isSafeInteger(n)) return n;
  }
  return raw;
}

async function issuedFor(q: Pool | PoolClient, keyId: string, cursor: Json): Promise<{ list: Json[]; row: { position: string; event_ids: string[] } | null }> {
  if (typeof cursor !== "string" || !isToken(cursor)) return { list: [], row: null };
  const { rows } = await q.query<{ cursor: string; position: string; event_ids: string[] }>(
    "SELECT cursor, position::text AS position, event_ids FROM site_event_cursor WHERE cursor = $1 AND credential_key_id = $2",
    [cursor, keyId],
  );
  return rows[0] ? { list: [rows[0].cursor], row: rows[0] } : { list: [], row: null };
}

export async function pollEvents(deps: EventsDeps, headers: HeaderBag, params: URLSearchParams): Promise<TxResponse> {
  const { keyId, signature } = credential(headers);
  const windowSeconds = deps.windowSeconds ?? pollWindowSeconds();
  const nowMs = (deps.clockMs ?? Date.now)();
  const rawCursor = params.get("cursor");
  const cursor: Json = rawCursor === null || rawCursor === "" ? null : rawCursor;
  const limit = parseLimit(params.get("limit"));
  const issuedAt = headers.get("x-c0-issued-at");
  const nonce = headers.get("x-c0-nonce");
  const freshnessRefused = async (transportError: PollFreshnessError, keyKnown: boolean): Promise<TxResponse> => {
    await appendLog(deps.pool, { operation: "EVENTS_POLL", outcome: "REJECTED", error_codes: ["EVENT_UNAUTHORIZED"], detail: { transport_error: transportError, ...(keyKnown ? { key_id: keyId } : {}) } });
    return refused("EVENT_UNAUTHORIZED", transportError);
  };

  // (1) scope site_events.read (ACTIVE/VERIFY_ONLY).
  if (!keyHasScope(deps.keyring, keyId, SCOPE_EVENTS_READ)) {
    await appendLog(deps.pool, { operation: "EVENTS_POLL", outcome: "REJECTED", error_codes: ["EVENT_UNAUTHORIZED"] });
    return refused("EVENT_UNAUTHORIZED");
  }
  // (2) fraîcheur présente et bien formée (DF-0115) : sans elle, la requête pourrait être rejouée indéfiniment.
  if (issuedAt === null || nonce === null || !ISSUED_AT_RE.test(issuedAt) || !NONCE_RE.test(nonce) || Number.isNaN(Date.parse(issuedAt))) {
    return freshnessRefused("POLL_FRESHNESS_REQUIRED", true);
  }
  // (3) signature de transport sur {cursor, issued_at_utc, limit, nonce}.
  if (!verify(deps.keyring, keyId, signature, SCOPE_EVENTS_READ, EVENTS_POLL_DOMAIN, { cursor, limit, issued_at_utc: issuedAt, nonce })) {
    await appendLog(deps.pool, { operation: "EVENTS_POLL", outcome: "REJECTED", error_codes: ["EVENT_UNAUTHORIZED"] });
    return refused("EVENT_UNAUTHORIZED");
  }
  const key = keyId as string;
  // (4) fenêtre : |horloge serveur − issued_at| ≤ fenêtre.
  if (Math.abs(nowMs - Date.parse(issuedAt)) > windowSeconds * 1000) {
    return freshnessRefused("POLL_STALE", true);
  }
  // (5) nonce jamais vu pour cette clé (insertion atomique, HORS transaction de service : un rejeu concurrent perd).
  try {
    const seen = await deps.pool.query("INSERT INTO site_event_poll_nonce (credential_key_id, nonce, issued_at) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING nonce", [key, nonce, issuedAt]);
    if (seen.rowCount !== 1) return freshnessRefused("POLL_REPLAYED", true);
  } catch (error) {
    return json(503, { accepted: false, outcome: "TRANSPORT_ERROR", transport_error: "EVENTS_UNAVAILABLE", error_codes: [], detail: { reason: errorReason(error) } });
  }
  let client: PoolClient;
  let release: (failed: boolean) => void;
  try {
    ({ client, release } = await checkout(deps.pool));
  } catch (error) {
    return json(503, { accepted: false, outcome: "TRANSPORT_ERROR", transport_error: "EVENTS_UNAVAILABLE", error_codes: [], detail: { reason: errorReason(error) } });
  }
  let broken: unknown = undefined;
  try {
    await client.query("BEGIN");
    const issued = await issuedFor(client, key, cursor);
    const v = validatePollRequest({ credential_key_id: key, cursor, limit }, deps.keyring, issued.list);
    if (!v.accepted) {
      await client.query("ROLLBACK");
      const code = v.error_codes.includes("EVENT_UNAUTHORIZED") ? "EVENT_UNAUTHORIZED" : "CURSOR_INVALID";
      await appendLog(deps.pool, { operation: "EVENTS_POLL", outcome: "REJECTED", error_codes: [code], detail: { key_id: key } });
      return refused(code);
    }
    // Non acquittés d'abord, dans l'ordre d'insertion : un événement livré mais non acquitté est RE-SERVI.
    // ORDER BY sur la colonne QUALIFIÉE : `ORDER BY id` désignait l'alias texte `id::text AS id` (PostgreSQL préfère la
    // colonne de sortie) et triait « 10 » avant « 8 » dès dix événements (W4 lot I, campagne C12 ; test 16).
    const { rows } = await client.query<{ id: string; event_id: string; event_bytes: Buffer }>(
      "SELECT site_outbox_event.id::text AS id, event_id, event_bytes FROM site_outbox_event WHERE status <> 'ACKED' ORDER BY site_outbox_event.id LIMIT $1 FOR UPDATE",
      [limit as number],
    );
    const ids = rows.map((r) => r.event_id);
    if (ids.length > 0) {
      await client.query(
        `UPDATE site_outbox_event SET status = CASE WHEN status = 'PENDING' THEN 'DELIVERED_TO_POLL' ELSE status END,
                delivery_count = delivery_count + 1, delivered_at = coalesce(delivered_at, now())
          WHERE event_id = ANY($1::text[])`,
        [ids],
      );
    }
    const previous = issued.row === null ? 0n : BigInt(issued.row.position);
    const max = rows.reduce((m, r) => (BigInt(r.id) > m ? BigInt(r.id) : m), previous);
    const next = opaqueRef("CUR");
    await client.query("INSERT INTO site_event_cursor (cursor, credential_key_id, position, event_ids) VALUES ($1, $2, $3, $4::text[])", [next, key, max.toString(), ids]);
    await client.query("COMMIT");
    await appendLog(deps.pool, { operation: "EVENTS_POLL", outcome: "SERVED", detail: { key_id: key, count: ids.length } });
    return json(200, {
      contract_version: "site_events.v1",
      transport: "STAGING_TRANSPORT",
      accepted: true,
      outcome: "SERVED",
      cursor,
      next_cursor: next,
      events: rows.map((r) => {
        const bytes = new Uint8Array(r.event_bytes);
        return { event_id: r.event_id, event_sha256: sha256Hex(bytes), event_bytes_b64: Buffer.from(bytes).toString("base64") };
      }),
    });
  } catch (error) {
    broken = error;
    await client.query("ROLLBACK").catch(() => undefined);
    const reason = errorReason(error);
    console.error(`[site-transactions] EVENTS_POLL échec code=${reason}`);
    return json(503, { accepted: false, outcome: "TRANSPORT_ERROR", transport_error: "EVENTS_UNAVAILABLE", error_codes: [], detail: { reason } });
  } finally {
    release(broken !== undefined);
  }
}

/** Corps d'ACK strict : exactement `{cursor}` (jeton) ou `{event_ids:[jetons distincts, 1…500]}`. */
function ackBody(bytes: Uint8Array): JsonObject | null {
  let doc: Json;
  try {
    doc = parseBytes(bytes, MAX_ACK_BYTES);
  } catch {
    return null;
  }
  if (!isObject(doc)) return null;
  const keys = Object.keys(doc);
  if (keys.length !== 1) return null;
  if (keys[0] === "cursor") return isToken(doc["cursor"]) ? doc : null;
  if (keys[0] === "event_ids") {
    const ids = doc["event_ids"];
    if (!Array.isArray(ids) || ids.length < 1 || ids.length > MAX_ACK_IDS || !ids.every(isToken) || new Set(ids).size !== ids.length) return null;
    return doc;
  }
  return null;
}

export async function ackEvents(deps: EventsDeps, headers: HeaderBag, bytes: Uint8Array): Promise<TxResponse> {
  const { keyId, signature } = credential(headers);
  if (!keyHasScope(deps.keyring, keyId, SCOPE_EVENTS_READ)) {
    await appendLog(deps.pool, { operation: "EVENTS_ACK", outcome: "REJECTED", error_codes: ["EVENT_UNAUTHORIZED"] });
    return refused("EVENT_UNAUTHORIZED");
  }
  const body = ackBody(bytes);
  if (body === null) {
    await appendLog(deps.pool, { operation: "EVENTS_ACK", outcome: "REJECTED", error_codes: ["CURSOR_INVALID"], detail: { key_id: keyId } });
    return refused("CURSOR_INVALID");
  }
  if (!verify(deps.keyring, keyId, signature, SCOPE_EVENTS_READ, EVENTS_ACK_DOMAIN, body)) {
    await appendLog(deps.pool, { operation: "EVENTS_ACK", outcome: "REJECTED", error_codes: ["EVENT_UNAUTHORIZED"] });
    return refused("EVENT_UNAUTHORIZED");
  }
  const key = keyId as string;
  try {
    let targets: string[];
    if ("cursor" in body) {
      const issued = await issuedFor(deps.pool, key, body["cursor"] as Json);
      if (issued.row === null) {
        await appendLog(deps.pool, { operation: "EVENTS_ACK", outcome: "REJECTED", error_codes: ["CURSOR_INVALID"], detail: { key_id: key } });
        return refused("CURSOR_INVALID");
      }
      targets = issued.row.event_ids;
    } else {
      targets = body["event_ids"] as string[];
    }
    const { rows } = await deps.pool.query<{ event_id: string; before: string; after: string }>(
      `WITH cur AS (SELECT event_id, status FROM site_outbox_event WHERE event_id = ANY($1::text[]) FOR UPDATE),
            upd AS (UPDATE site_outbox_event e SET status = 'ACKED', acked_at = now()
                      FROM cur WHERE e.event_id = cur.event_id AND cur.status = 'DELIVERED_TO_POLL' RETURNING e.event_id)
       SELECT cur.event_id, cur.status AS before, CASE WHEN upd.event_id IS NULL THEN cur.status ELSE 'ACKED' END AS after
         FROM cur LEFT JOIN upd ON upd.event_id = cur.event_id`,
      [targets],
    );
    const by = new Map(rows.map((r) => [r.event_id, r]));
    const acked = targets.filter((id) => by.get(id)?.before === "DELIVERED_TO_POLL");
    const alreadyAcked = targets.filter((id) => by.get(id)?.before === "ACKED");
    const notDelivered = targets.filter((id) => by.get(id)?.before === "PENDING");
    const unknown = targets.filter((id) => !by.has(id));
    await appendLog(deps.pool, { operation: "EVENTS_ACK", outcome: "ACKED", detail: { key_id: key, acked: acked.length, already_acked: alreadyAcked.length, not_delivered: notDelivered.length, unknown: unknown.length } });
    return json(200, {
      contract_version: "site_events.v1",
      transport: "STAGING_TRANSPORT",
      accepted: true,
      outcome: "ACKED",
      acked,
      already_acked: alreadyAcked,
      not_delivered: notDelivered,
      unknown,
    });
  } catch (error) {
    const reason = errorReason(error);
    console.error(`[site-transactions] EVENTS_ACK échec code=${reason}`);
    return json(503, { accepted: false, outcome: "TRANSPORT_ERROR", transport_error: "EVENTS_UNAVAILABLE", error_codes: [], detail: { reason } });
  }
}

export interface PurgeOptions {
  cursorRetentionHours?: number;
  nonceRetentionHours?: number;
  dryRun?: boolean;
}

/**
 * Purge des curseurs de poll et des nonces (DF-0115) : `site_purge_event_cursors` (migration 017). Garde le curseur le plus
 * récent de chaque clé ; rétention minimale 1 h (refusée en dessous par la fonction SQL). Un curseur purgé présenté ensuite
 * → `CURSOR_INVALID` ; le consommateur repart d'un curseur vide (le flux sert toujours la tête du non-acquitté).
 */
export async function purgeEventCursors(pool: Pool, options: PurgeOptions = {}): Promise<{ cursors_deleted: number; cursors_kept: number; nonces_deleted: number }> {
  const cursorHours = options.cursorRetentionHours ?? DEFAULT_CURSOR_RETENTION_HOURS;
  const nonceHours = options.nonceRetentionHours ?? DEFAULT_NONCE_RETENTION_HOURS;
  for (const h of [cursorHours, nonceHours]) {
    if (!Number.isSafeInteger(h) || h < 1 || h > 24 * 3650) throw new RangeError("rétention en heures : entier de 1 à 87600");
  }
  const { rows } = await pool.query<{ cursors_deleted: string; cursors_kept: string; nonces_deleted: string }>(
    "SELECT cursors_deleted::text, cursors_kept::text, nonces_deleted::text FROM site_purge_event_cursors(make_interval(hours => $1), make_interval(hours => $2), $3)",
    [cursorHours, nonceHours, options.dryRun === true],
  );
  const r = rows[0]!;
  return { cursors_deleted: Number(r.cursors_deleted), cursors_kept: Number(r.cursors_kept), nonces_deleted: Number(r.nonces_deleted) };
}
