/**
 * Consultation d'un reçu (C0 §10.5) : `GET /api/site/receipt?ref=…&access_token=…`.
 * Décision = `lookupReceipt` du C0 vendu : jeton absent/vide → `UNAUTHORIZED` 401 ; référence inconnue OU jeton
 * faux → `NOT_FOUND` 404, corps STRICTEMENT identiques (aucune fuite sur l'existence d'une référence).
 * Le jeton n'est jamais stocké en clair : comparaison par empreinte SHA-256 en temps constant (C0).
 */
import type { Pool } from "pg";
import { lookupReceipt } from "../../c0/ts/src/business";
import { isToken } from "../../c0/ts/src/formats";
import type { Json, JsonObject } from "../../c0/ts/src/jsonc";
import { PERSISTENCE, appendLog, errorReason, httpStatusFor, json, type TxResponse } from "./common";

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
      `SELECT quote_ref AS ref, access_token_sha256, 'quote_request' AS kind, status FROM site_quote_request WHERE quote_ref = $1
       UNION ALL
       SELECT order_ref AS ref, access_token_sha256, 'order' AS kind, status FROM site_order WHERE order_ref = $1`,
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
    const stored = await deps.pool.query<{ receipt_json: JsonObject }>(
      "SELECT receipt_json FROM site_idempotency WHERE receipt_ref = $1 AND kind = $2",
      [v.ref, found.kind],
    );
    const receipt = stored.rows[0]?.receipt_json;
    if (receipt === undefined) throw Object.assign(new Error("reçu absent du registre"), { code: "RECEIPT_MISSING" });
    await appendLog(deps.pool, { operation: "RECEIPT", outcome: "FOUND", object_ref: v.ref });
    return json(200, {
      contract_version: "site_business.v1",
      persistence: PERSISTENCE,
      accepted: true,
      outcome: "FOUND",
      error_codes: [],
      receipt_ref: v.ref,
      kind: found.kind,
      status: found.status,
      receipt,
    });
  } catch (error) {
    const reason = errorReason(error);
    console.error(`[site-transactions] RECEIPT lecture impossible code=${reason}`);
    return json(503, { accepted: false, outcome: "TRANSPORT_ERROR", transport_error: "RECEIPT_UNAVAILABLE", error_codes: [] });
  }
}
