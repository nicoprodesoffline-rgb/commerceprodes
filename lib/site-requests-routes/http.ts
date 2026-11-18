/**
 * Cercle 5 (docs/site_events_v2.md §5) : adaptateur Next.js (runtime Node) des routes de la Factory vers le site. Dans cet ordre : HTTPS hors
 * boucle locale (403), trousseau des routes lisible (503), corps borné (413), porte signée de la portée (401 `SIGNATURE_INVALID`), puis le
 * geste. La réponse est signée par la clé d'accusé du SITE quand elle est réglée, comme toutes ses réponses du cercle 4 (`signResponse`).
 */
import type { Pool } from "pg";
import type { Json } from "../../c0/ts/src/jsonc";
import { SiteDbConfigError, getPool } from "../site-db/pool";
import { BodyTooLarge, readBoundedBody } from "../site-publish/http";
import { instant, signResponse, signedPath } from "../site-publish/transport-gate";
import { errorReason } from "../site-transactions/common";
import { loadEventsKeyring } from "../site-transactions/config";
import { checkRouteRequest, transportSecure } from "./gate";
import type { Answer } from "./handlers";
import { RequestsKeyringError, loadRouteKeyring, type RouteScope } from "./keyring";

function respond(status: number, value: unknown): Response {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}

async function signed(req: Request, response: Response): Promise<Response> {
  const ackKeyId = process.env["SITE_ACK_KEY_ID"];
  if (!ackKeyId) return response;
  let keyring: Json;
  try {
    keyring = loadEventsKeyring();
  } catch {
    return response;
  }
  return signResponse(keyring, ackKeyId, req.headers, response);
}

export async function routeHttp(operation: string, scope: RouteScope, req: Request, maxBytes: number, run: (pool: Pool, body: Uint8Array) => Promise<Answer>): Promise<Response> {
  const now = new Date();
  if (!transportSecure(req.url, req.headers)) {
    return signed(req, respond(403, { accepted: false, outcome: "TRANSPORT_ERROR", operation, transport_error: "HTTPS_REQUIRED", error_codes: [] }));
  }
  try {
    const keyring = loadRouteKeyring();
    const pool = getPool();
    let body: Uint8Array;
    try {
      body = await readBoundedBody(req, maxBytes);
    } catch (error) {
      if (error instanceof BodyTooLarge) return signed(req, respond(413, { accepted: false, outcome: "TRANSPORT_ERROR", operation, transport_error: "BODY_TOO_LARGE", max_bytes: maxBytes, error_codes: [] }));
      throw error;
    }
    const refusal = await checkRouteRequest(keyring, pool, req.headers, scope, req.method, signedPath(req), body, now);
    if (refusal !== null) {
      console.warn(`[site-requests] ${operation} refusé raison=${refusal}`);
      return signed(req, respond(401, { accepted: false, outcome: "REJECTED", operation, error_codes: ["SIGNATURE_INVALID"], server_time_utc: instant(now) }));
    }
    const answer = await run(pool, body);
    return signed(req, respond(answer.status, { operation, ...answer.body }));
  } catch (error) {
    if (error instanceof RequestsKeyringError || error instanceof SiteDbConfigError) {
      return signed(req, respond(503, { accepted: false, outcome: "TRANSPORT_ERROR", operation, transport_error: error.code, error_codes: [] }));
    }
    console.error(`[site-requests] ${operation} échec code=${errorReason(error)}`);
    return signed(req, respond(503, { accepted: false, outcome: "TRANSPORT_ERROR", operation, transport_error: "REQUESTS_UNAVAILABLE", error_codes: [] }));
  }
}
