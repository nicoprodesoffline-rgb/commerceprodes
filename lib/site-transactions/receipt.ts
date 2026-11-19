/**
 * Consultation d'un reçu (C0 §10.5) : `GET /api/site/receipt?ref=…&access_token=…`.
 * Décision = `lookupReceipt` du C0 vendu : jeton absent/vide → `UNAUTHORIZED` 401 ; référence inconnue OU jeton
 * faux → `NOT_FOUND` 404, corps STRICTEMENT identiques (aucune fuite sur l'existence d'une référence).
 * Le jeton n'est jamais stocké en clair : comparaison par empreinte SHA-256 en temps constant (C0).
 */
import type { Pool } from "pg";
import { lookupReceipt } from "../../c0/ts/src/business";
import { isToken } from "../../c0/ts/src/formats";
import { isObject, parseBytes, type Json, type JsonObject } from "../../c0/ts/src/jsonc";
import { PERSISTENCE, appendLog, errorReason, httpStatusFor, json, jsonWithRaw, sha256OfBytes, type TxResponse } from "./common";

export interface ReceiptDeps {
  pool: Pool;
}

const REFUSED = (code: "UNAUTHORIZED" | "NOT_FOUND"): TxResponse =>
  json(httpStatusFor([code]), { contract_version: "site_business.v1", accepted: false, outcome: "REJECTED", error_codes: [code] });

/** `params` = paramètres de requête tels que reçus (clé absente ≠ clé vide, C0 R-13). */
export async function getReceipt(deps: ReceiptDeps, params: URLSearchParams): Promise<TxResponse> {
  const request: JsonObject = {};
  if (params.has("ref")) request["ref"] = params.get("ref") as string;
  if (params.has("access_token")) request["access_token"] = params.get("access_token") as string;
  const ref = request["ref"];
  try {
    // Même requête SQL que la référence existe ou non (pas de court-circuit observable avant C0).
    const { rows } = await deps.pool.query<{ ref: string; access_token_sha256: string; kind: string; status: string }>(
      // Cercle 5 (P03) : une demande v2 (numéro lisible) ne se consulte QUE par `POST /api/site/receipt`, le code dans le corps.
      `SELECT quote_ref AS ref, access_token_sha256, 'quote_request' AS kind, status FROM site_quote_request WHERE quote_ref = $1 AND number IS NULL
       UNION ALL
       SELECT order_ref AS ref, access_token_sha256, 'order' AS kind, status FROM site_order WHERE order_ref = $1 AND number IS NULL`,
      [isToken(ref) ? ref : ""],
    );
    const records: Json = rows.map((r) => ({ ref: r.ref, access_token_sha256: r.access_token_sha256 }));
    const v = lookupReceipt(request, records);
    if (!v.accepted || v.ref === null) {
      const code = v.error_codes.includes("UNAUTHORIZED") ? "UNAUTHORIZED" : "NOT_FOUND";
      await appendLog(deps.pool, { operation: "RECEIPT", outcome: "REJECTED", error_codes: [code] });
      return REFUSED(code);
    }
    const found = rows.find((r) => r.ref === v.ref)!;
    const stored = await deps.pool.query<{ receipt_bytes: Buffer }>(
      "SELECT receipt_bytes FROM site_idempotency WHERE receipt_ref = $1 AND kind = $2",
      [v.ref, found.kind],
    );
    const receipt = stored.rows[0]?.receipt_bytes;
    if (receipt === undefined) throw Object.assign(new Error("reçu absent du registre"), { code: "RECEIPT_MISSING" });
    await appendLog(deps.pool, { operation: "RECEIPT", outcome: "FOUND", object_ref: v.ref });
    const bytes = new Uint8Array(receipt);
    // Reçu = octets canoniques stockés à la création (review F-03), recopiés tels quels.
    return jsonWithRaw(
      200,
      { contract_version: "site_business.v1", persistence: PERSISTENCE, accepted: true, outcome: "FOUND", error_codes: [], receipt_ref: v.ref, kind: found.kind, status: found.status },
      "receipt",
      bytes,
      { "x-site-receipt-sha256": sha256OfBytes(bytes) },
    );
  } catch (error) {
    const reason = errorReason(error);
    console.error(`[site-transactions] RECEIPT lecture impossible code=${reason}`);
    return json(503, { accepted: false, outcome: "TRANSPORT_ERROR", transport_error: "RECEIPT_UNAVAILABLE", error_codes: [] });
  }
}

// --- Cercle 5 (5.22, attendus P01 à P03) : le reçu d'une demande, code dans le corps ---------------------------------------------------

export const RECEIPT_POST_MAX_BYTES = 4096;
/** États lisibles du reçu : « reçue » tant que la Factory n'a pas acquitté, puis « transmise à notre équipe ». */
export const TRANSMISSION_LABELS = { recue: "Reçue", transmise: "Transmise à notre équipe" } as const;

type V2Row = { ref: string; access_token_sha256: string; kind: string; status: string; number: string | null; acked: boolean; document_kind: string | null; document_sha256: string | null };

/** Le corps strict `{ref, code}` ; `null` s'il est mal formé (même refus qu'un code absent). */
function receiptBody(bytes: Uint8Array): JsonObject | null {
  let doc: Json;
  try {
    doc = parseBytes(bytes, RECEIPT_POST_MAX_BYTES);
  } catch {
    return null;
  }
  if (!isObject(doc) || Object.keys(doc).length !== 2 || typeof doc["ref"] !== "string" || typeof doc["code"] !== "string") return null;
  return { ref: doc["ref"], access_token: doc["code"] };
}

/** La demande que désigne le corps, si le code est juste (C0 `lookupReceipt` : inconnue et code faux sont indiscernables). */
async function authorized(deps: ReceiptDeps, bytes: Uint8Array): Promise<{ row: V2Row } | { refusal: "UNAUTHORIZED" | "NOT_FOUND" }> {
  const request = receiptBody(bytes);
  if (request === null) return { refusal: "UNAUTHORIZED" };
  const ref = request["ref"];
  const { rows } = await deps.pool.query<V2Row>(
    `SELECT quote_ref AS ref, access_token_sha256, 'quote_request' AS kind, status, number, acked_at IS NOT NULL AS acked, document_kind, document_sha256 FROM site_quote_request WHERE quote_ref = $1
     UNION ALL
     SELECT order_ref, access_token_sha256, 'order', status, number, acked_at IS NOT NULL, document_kind, document_sha256 FROM site_order WHERE order_ref = $1
     UNION ALL
     SELECT message_ref, access_token_sha256, 'message', status, number, acked_at IS NOT NULL, NULL, NULL FROM site_message WHERE message_ref = $1`,
    [isToken(ref) ? ref : ""],
  );
  const v = lookupReceipt(request, rows.map((r) => ({ ref: r.ref, access_token_sha256: r.access_token_sha256 })) as Json);
  if (!v.accepted || v.ref === null) return { refusal: v.error_codes.includes("UNAUTHORIZED") ? "UNAUTHORIZED" : "NOT_FOUND" };
  return { row: rows.find((r) => r.ref === v.ref)! };
}

/** `POST /api/site/receipt` {ref, code} : le reçu, son état de transmission et, une fois la demande transmise, le PDF déposé par la Factory. */
export async function postReceipt(deps: ReceiptDeps, bytes: Uint8Array): Promise<TxResponse> {
  try {
    const found = await authorized(deps, bytes);
    if ("refusal" in found) {
      await appendLog(deps.pool, { operation: "RECEIPT", outcome: "REJECTED", error_codes: [found.refusal] });
      return REFUSED(found.refusal);
    }
    const row = found.row;
    const stored = await deps.pool.query<{ receipt_bytes: Buffer }>("SELECT receipt_bytes FROM site_idempotency WHERE receipt_ref = $1 AND kind = $2", [row.ref, row.kind]);
    const receipt = stored.rows[0]?.receipt_bytes;
    if (receipt === undefined) throw Object.assign(new Error("reçu absent du registre"), { code: "RECEIPT_MISSING" });
    await appendLog(deps.pool, { operation: "RECEIPT", outcome: "FOUND", object_ref: row.ref });
    const transmission = row.acked ? "transmise" : "recue";
    const document = row.acked && row.document_sha256 !== null ? { kind: row.document_kind, sha256: row.document_sha256 } : null;
    const out = new Uint8Array(receipt);
    return jsonWithRaw(
      200,
      { contract_version: "site_business.v1", persistence: PERSISTENCE, accepted: true, outcome: "FOUND", error_codes: [], receipt_ref: row.ref, kind: row.kind, status: row.status,
        number: row.number, transmission, transmission_label: TRANSMISSION_LABELS[transmission], document },
      "receipt",
      out,
      { "x-site-receipt-sha256": sha256OfBytes(out) },
    );
  } catch (error) {
    console.error(`[site-transactions] RECEIPT lecture impossible code=${errorReason(error)}`);
    return json(503, { accepted: false, outcome: "TRANSPORT_ERROR", transport_error: "RECEIPT_UNAVAILABLE", error_codes: [] });
  }
}

/** `POST /api/site/receipt/document` {ref, code} : le PDF de la demande, seulement s'il est déposé ET la demande transmise ; sinon le même 404. */
export async function postReceiptDocument(deps: ReceiptDeps, bytes: Uint8Array): Promise<TxResponse> {
  try {
    const found = await authorized(deps, bytes);
    if ("refusal" in found) return REFUSED(found.refusal);
    const row = found.row;
    const table = row.kind === "quote_request" ? ["site_quote_request", "quote_ref"] : row.kind === "order" ? ["site_order", "order_ref"] : null;
    if (table === null || !row.acked) return REFUSED("NOT_FOUND");
    const { rows } = await deps.pool.query<{ document_pdf: Buffer | null }>(`SELECT document_pdf FROM ${table[0]} WHERE ${table[1]} = $1`, [row.ref]);
    const pdf = rows[0]?.document_pdf;
    if (pdf === null || pdf === undefined) return REFUSED("NOT_FOUND");
    await appendLog(deps.pool, { operation: "RECEIPT", outcome: "DOCUMENT", object_ref: row.ref });
    return {
      status: 200,
      headers: { "content-type": "application/pdf", "cache-control": "no-store", "content-disposition": `attachment; filename="${row.number ?? row.ref}.pdf"`, "x-content-type-options": "nosniff" },
      body: new Uint8Array(pdf),
    };
  } catch (error) {
    console.error(`[site-transactions] RECEIPT document impossible code=${errorReason(error)}`);
    return json(503, { accepted: false, outcome: "TRANSPORT_ERROR", transport_error: "RECEIPT_UNAVAILABLE", error_codes: [] });
  }
}
