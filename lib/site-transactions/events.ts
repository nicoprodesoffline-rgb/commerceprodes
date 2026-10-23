/**
 * Lecture sortante des événements par la Factory (C0 §11.3) et ACK — transport `STAGING_TRANSPORT`
 * (annexe « Poll / ACK des événements » de docs/SITE_TRANSPORT_STAGING.md).
 *
 * `GET /api/site/events?cursor=&limit=` : en-têtes `x-c0-key-id`, `x-c0-signature` =
 *   hex(HMAC-SHA256(secret, "prodes.c0.transport.events_poll.v1" 0x00 canonical({cursor, limit}))), clé de scope
 *   `site_events.read`. Ordre : signature (`EVENT_UNAUTHORIZED`) → `validatePollRequest` C0 (`EVENT_UNAUTHORIZED`,
 *   `CURSOR_INVALID`) → service des `event_bytes` NON ACQUITTÉS dans l'ordre `id` (un événement non acquitté est
 *   re-servi) → `DELIVERED_TO_POLL` → nouveau curseur opaque émis et enregistré → COMMIT → réponse.
 * `POST /api/site/events/ack` : corps `{cursor}` ou `{event_ids:[…]}`, signé (domaine `prodes.c0.transport.events_ack.v1`,
 *   contexte = le corps lu), même scope → `ACKED`.
 */
import type { Pool, PoolClient } from "pg";
import { validatePollRequest } from "../../c0/ts/src/events";
import { isToken } from "../../c0/ts/src/formats";
import { isObject, parseBytes, sha256Hex, type Json, type JsonObject } from "../../c0/ts/src/jsonc";
import { SCOPE_EVENTS_READ, keyHasScope, verify } from "../../c0/ts/src/signing";
import { appendLog, checkout, errorReason, httpStatusFor, json, opaqueRef, type TxResponse } from "./common";

export const EVENTS_POLL_DOMAIN = "prodes.c0.transport.events_poll.v1";
export const EVENTS_ACK_DOMAIN = "prodes.c0.transport.events_ack.v1";
export const MAX_ACK_IDS = 500;
const MAX_ACK_BYTES = 64 * 1024;
const LIMIT_RE = /^(0|[1-9][0-9]{0,15})$/;

export interface EventsDeps {
  pool: Pool;
  keyring: Json;
}

type HeaderBag = { get(name: string): string | null };

const refused = (code: "EVENT_UNAUTHORIZED" | "CURSOR_INVALID"): TxResponse =>
  json(httpStatusFor([code]), { contract_version: "site_events.v1", accepted: false, outcome: "REJECTED", error_codes: [code] });

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
  const rawCursor = params.get("cursor");
  const cursor: Json = rawCursor === null || rawCursor === "" ? null : rawCursor;
  const limit = parseLimit(params.get("limit"));

  // Credential : scope site_events.read (ACTIVE/VERIFY_ONLY) ET signature de transport sur {cursor, limit}.
  if (!keyHasScope(deps.keyring, keyId, SCOPE_EVENTS_READ) || !verify(deps.keyring, keyId, signature, SCOPE_EVENTS_READ, EVENTS_POLL_DOMAIN, { cursor, limit })) {
    await appendLog(deps.pool, { operation: "EVENTS_POLL", outcome: "REJECTED", error_codes: ["EVENT_UNAUTHORIZED"] });
    return refused("EVENT_UNAUTHORIZED");
  }
  const key = keyId as string;
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
    const { rows } = await client.query<{ id: string; event_id: string; event_bytes: Buffer }>(
      "SELECT id::text AS id, event_id, event_bytes FROM site_outbox_event WHERE status <> 'ACKED' ORDER BY id LIMIT $1 FOR UPDATE",
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
