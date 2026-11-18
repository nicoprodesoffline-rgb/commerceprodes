/**
 * Cercle 5 (docs/site_events_v2.md §5) : ce que font les routes de la Factory vers le site, une fois la requête acceptée par la porte (`gate.ts`).
 *   5.1 effacement (`site_requests.erase`)      {object_ref}                                   -> 200 {erased_at} ; idempotent
 *   5.2 dépôt du PDF (`site_requests.documents`) {object_ref, kind, sha256, pdf_base64} ≤ 2 Mio -> 200 {deposited_at, sha256}
 *   5.3 mise de côté (`site_events.set_aside`)   {event_id, code}                               -> 200 {set_aside_at} ; idempotent
 *   5.4 état de l'accusé (`site_requests.mail_status`) {object_refs:[1…500]}                    -> 200 {items:[…]} sans aucune coordonnée
 * Refus : `PAYLOAD_MALFORMED` 400, `NOT_FOUND` 404, `INTEGRITY_MISMATCH` 422 (empreinte du PDF fausse), `ERASED` 409 (PDF d'une demande
 * dont les coordonnées sont effacées : un PDF en porte). Le journal garde l'opération, la référence et le résultat, jamais le corps (P05).
 */
import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { exactKeys, isHex64, isToken } from "../../c0/ts/src/formats";
import { parseBytes, type Json } from "../../c0/ts/src/jsonc";
import { appendLog } from "../site-transactions/common";

export const MAX_DOCUMENT_BODY_BYTES = 2 * 1024 * 1024;
export const MAX_SMALL_BODY_BYTES = 64 * 1024;
export const MAX_MAIL_STATUS_REFS = 500;
const KIND_BY_TYPE: Record<string, string> = { "quote.requested": "demande_de_devis", "order.received": "bon_de_commande" };
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;
const CODE = /^[A-Z][A-Z0-9_]{0,63}$/;

export type Answer = { status: number; body: Record<string, unknown> };

const refused = (status: number, code: string): Answer => ({ status, body: { accepted: false, outcome: "REJECTED", error_codes: [code] } });
const malformed = (): Answer => refused(400, "PAYLOAD_MALFORMED");
const notFound = (): Answer => refused(404, "NOT_FOUND");

function read(bytes: Uint8Array, max: number): Json | undefined {
  try {
    return parseBytes(bytes, max);
  } catch {
    return undefined;
  }
}

const instant = (at: Date): string => at.toISOString().replace(/\.\d{3}Z$/, "Z");

/** La demande d'une référence : sa table (par le type d'événement), son état d'effacement. */
async function findRequest(pool: Pool, ref: string): Promise<{ eventType: string; erased: boolean } | null> {
  const { rows } = await pool.query<{ event_type: string; erased: boolean }>(
    `SELECT 'quote.requested' AS event_type, coordinates_erased_at IS NOT NULL AS erased FROM site_quote_request WHERE quote_ref = $1
     UNION ALL SELECT 'order.received', coordinates_erased_at IS NOT NULL FROM site_order WHERE order_ref = $1
     UNION ALL SELECT 'message.received', coordinates_erased_at IS NOT NULL FROM site_message WHERE message_ref = $1`,
    [ref],
  );
  return rows[0] ? { eventType: rows[0].event_type, erased: rows[0].erased } : null;
}

export async function eraseRequest(pool: Pool, bytes: Uint8Array): Promise<Answer> {
  const body = read(bytes, MAX_SMALL_BODY_BYTES);
  if (!exactKeys(body, ["object_ref"]) || !isToken(body["object_ref"])) return malformed();
  const ref = body["object_ref"];
  const { rows } = await pool.query<{ erased_at: Date | null }>("SELECT site_erase_request($1) AS erased_at", [ref]);
  const at = rows[0]?.erased_at ?? null;
  await appendLog(pool, { operation: "REQUESTS_ERASE", outcome: at === null ? "NOT_FOUND" : "ERASED", ...(at === null ? {} : { object_ref: ref }) });
  if (at === null) return notFound();
  return { status: 200, body: { accepted: true, outcome: "ERASED", object_ref: ref, erased_at: instant(at) } };
}

export async function depositDocument(pool: Pool, bytes: Uint8Array): Promise<Answer> {
  const body = read(bytes, MAX_DOCUMENT_BODY_BYTES);
  if (!exactKeys(body, ["object_ref", "kind", "sha256", "pdf_base64"]) || !isToken(body["object_ref"]) || typeof body["kind"] !== "string"
      || !isHex64(body["sha256"]) || typeof body["pdf_base64"] !== "string" || body["pdf_base64"].length % 4 !== 0 || !BASE64.test(body["pdf_base64"])) {
    return malformed();
  }
  const pdf = Buffer.from(body["pdf_base64"], "base64");
  if (pdf.length < 5 || pdf.subarray(0, 5).toString("latin1") !== "%PDF-") return malformed();
  const ref = body["object_ref"];
  const found = await findRequest(pool, ref);
  if (found === null || KIND_BY_TYPE[found.eventType] === undefined) {
    await appendLog(pool, { operation: "REQUESTS_DOCUMENT", outcome: "NOT_FOUND" });
    return notFound();
  }
  if (KIND_BY_TYPE[found.eventType] !== body["kind"]) return malformed();
  if (createHash("sha256").update(pdf).digest("hex") !== body["sha256"]) {
    await appendLog(pool, { operation: "REQUESTS_DOCUMENT", outcome: "REJECTED", error_codes: ["INTEGRITY_MISMATCH"], object_ref: ref });
    return refused(422, "INTEGRITY_MISMATCH");
  }
  if (found.erased) {
    await appendLog(pool, { operation: "REQUESTS_DOCUMENT", outcome: "REJECTED", error_codes: ["ERASED"], object_ref: ref });
    return refused(409, "ERASED");
  }
  const [table, column] = found.eventType === "quote.requested" ? ["site_quote_request", "quote_ref"] : ["site_order", "order_ref"];
  const { rows } = await pool.query<{ deposited_at: Date }>(
    `UPDATE ${table} SET document_kind = $2, document_pdf = $3, document_sha256 = $4,
            document_deposited_at = CASE WHEN document_sha256 = $4 THEN document_deposited_at ELSE now() END
      WHERE ${column} = $1 AND coordinates_erased_at IS NULL RETURNING document_deposited_at AS deposited_at`,
    [ref, body["kind"], pdf, body["sha256"]],
  );
  if (rows[0] === undefined) return refused(409, "ERASED");   // effacée entre la lecture et l'écriture
  await appendLog(pool, { operation: "REQUESTS_DOCUMENT", outcome: "DEPOSITED", object_ref: ref });
  return { status: 200, body: { accepted: true, outcome: "DEPOSITED", object_ref: ref, sha256: body["sha256"], deposited_at: instant(rows[0].deposited_at) } };
}

export async function setAsideEvent(pool: Pool, bytes: Uint8Array): Promise<Answer> {
  const body = read(bytes, MAX_SMALL_BODY_BYTES);
  if (!exactKeys(body, ["event_id", "code"]) || !isToken(body["event_id"]) || typeof body["code"] !== "string" || !CODE.test(body["code"])) return malformed();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<{ object_ref: string; event_type: string; status: string; set_aside_at: Date | null }>(
      "SELECT object_ref, event_type, status, set_aside_at FROM site_outbox_event WHERE event_id = $1 FOR UPDATE",
      [body["event_id"]],
    );
    const event = rows[0];
    if (event === undefined) {
      await client.query("ROLLBACK");
      await appendLog(pool, { operation: "EVENTS_SET_ASIDE", outcome: "NOT_FOUND" });
      return notFound();
    }
    if (event.status === "ACKED") {
      await client.query("ROLLBACK");
      return refused(409, "ALREADY_ACKED");
    }
    let at = event.set_aside_at;
    if (at === null) {
      const updated = await client.query<{ at: Date }>(
        "UPDATE site_outbox_event SET status = 'SET_ASIDE', set_aside_at = now(), set_aside_code = $2 WHERE event_id = $1 RETURNING set_aside_at AS at",
        [body["event_id"], body["code"]],
      );
      at = updated.rows[0]!.at;
      const table = { "quote.requested": ["site_quote_request", "quote_ref"], "order.received": ["site_order", "order_ref"], "message.received": ["site_message", "message_ref"] }[event.event_type];
      if (table !== undefined) await client.query(`UPDATE ${table[0]} SET set_aside_at = $2 WHERE ${table[1]} = $1 AND set_aside_at IS NULL`, [event.object_ref, at]);
    }
    await client.query("COMMIT");
    await appendLog(pool, { operation: "EVENTS_SET_ASIDE", outcome: "SET_ASIDE", object_ref: event.object_ref });
    return { status: 200, body: { accepted: true, outcome: "SET_ASIDE", event_id: body["event_id"], set_aside_at: instant(at) } };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/** Les états de l'accusé lisibles par la Factory (son écran) : jamais le destinataire, l'objet ni le corps. Une référence inconnue est absente. */
export async function mailStatus(pool: Pool, bytes: Uint8Array): Promise<Answer> {
  const body = read(bytes, MAX_SMALL_BODY_BYTES);
  const refs = exactKeys(body, ["object_refs"]) ? body["object_refs"] : null;
  if (!Array.isArray(refs) || refs.length < 1 || refs.length > MAX_MAIL_STATUS_REFS || !refs.every(isToken) || new Set(refs).size !== refs.length) return malformed();
  const { rows } = await pool.query<{ object_ref: string; number: string; state: string; attempts: number; last_attempt_at: Date | null; next_attempt_at: Date | null }>(
    "SELECT object_ref, number, state, attempts, last_attempt_at, next_attempt_at FROM site_ack_mail WHERE object_ref = ANY($1::text[]) ORDER BY id",
    [refs],
  );
  await appendLog(pool, { operation: "REQUESTS_MAIL_STATUS", outcome: "SERVED", detail: { asked: refs.length, found: rows.length } });
  return {
    status: 200,
    body: {
      accepted: true,
      outcome: "SERVED",
      items: rows.map((r) => ({
        object_ref: r.object_ref,
        number: r.number,
        state: r.state,
        attempts: r.attempts,
        last_attempt_at_utc: r.last_attempt_at === null ? null : instant(r.last_attempt_at),
        next_attempt_at_utc: r.next_attempt_at === null ? null : instant(r.next_attempt_at),
      })),
    },
  };
}
