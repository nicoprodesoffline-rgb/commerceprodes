/**
 * Adaptateur Next.js (runtime Node) des routes /api/site/publish/** vers le receiver.
 *
 * Ordre par requête (review BC2 F-01) :
 *   1. configuration et pool (configuration invalide -> 503, rien n'est activé) ;
 *   2. PORTE DE TRANSPORT, sans lire le corps : en-têtes `x-c0-key-id` / `x-c0-signature` présents, clé connue de
 *      scope `site_snapshot.publish` (ACTIVE ou VERIFY_ONLY), signature 64 hex -> sinon 401, AUCUNE ligne de journal ;
 *   3. lecture BORNÉE du corps par route : `Content-Length` > plafond -> 413 immédiat ; sinon lecture en flux avec
 *      compteur, coupée à plafond + 1 octet -> 413, AUCUNE ligne de journal ;
 *   4. receiver (évaluation C0 complète, HMAC compris).
 * La porte de transport est un contrôle d'accès : elle ne remplace aucune étape C0 (le HMAC reste vérifié par
 * `evaluatePublication` à l'étape `signature`).
 */
import { SiteDbConfigError, getPool } from "../site-db/pool";
import { ReceiverConfigError, loadReceiverConfig } from "./config";
import { transportGate, type HeaderSource, type ReceiverDeps, type ReceiverResponse } from "./receiver";

export class BodyTooLarge extends Error {
  readonly code = "BODY_TOO_LARGE";
}

function jsonResponse(status: number, value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function toResponse(out: ReceiverResponse): Response {
  return new Response(Buffer.from(out.body), { status: out.status, headers: out.headers });
}

/**
 * Lit au plus `max` octets du corps. Refus (BodyTooLarge) dès que `Content-Length` annonce plus, ou dès que le flux
 * dépasse `max` : la lecture est alors interrompue (le reste n'est jamais mis en mémoire).
 */
export async function readBoundedBody(request: Request, max: number): Promise<Uint8Array> {
  const declared = request.headers.get("content-length");
  if (declared !== null && (!/^[0-9]{1,16}$/.test(declared) || Number(declared) > max)) throw new BodyTooLarge();
  if (request.body === null) return new Uint8Array(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => undefined);
      throw new BodyTooLarge();
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

function loadDeps(operation: string): ReceiverDeps | Response {
  try {
    return { pool: getPool(), config: loadReceiverConfig() };
  } catch (error) {
    if (error instanceof ReceiverConfigError || error instanceof SiteDbConfigError) {
      return jsonResponse(503, { accepted: false, outcome: "TRANSPORT_ERROR", operation, transport_error: error.code, message: error.message, error_codes: [] });
    }
    throw error;
  }
}

async function runSafely(operation: string, run: () => Promise<ReceiverResponse>): Promise<Response> {
  try {
    return toResponse(await run());
  } catch (error) {
    const code = typeof (error as { code?: unknown }).code === "string" ? (error as { code: string }).code : "ERROR";
    console.error(`[site-publish] ${operation} échec interne code=${code}`);
    return jsonResponse(503, { accepted: false, outcome: "TRANSPORT_ERROR", operation, transport_error: "RECEIVER_UNAVAILABLE", error_codes: [] });
  }
}

/** Opération sans corps (STATUS) : configuration, porte de transport, receiver. */
export async function handle(operation: string, headers: HeaderSource | null, run: (deps: ReceiverDeps) => Promise<ReceiverResponse>): Promise<Response> {
  const deps = loadDeps(operation);
  if (deps instanceof Response) return deps;
  if (headers !== null) {
    const refused = transportGate(deps.config, headers, operation);
    if (refused !== null) return toResponse(refused);
  }
  return runSafely(operation, () => run(deps));
}

/** Opération avec corps : configuration, porte de transport (corps non lu), lecture bornée, receiver. */
export async function handleWithBody(
  operation: string,
  request: Request,
  maxBytes: number,
  run: (deps: ReceiverDeps, body: Uint8Array) => Promise<ReceiverResponse>,
): Promise<Response> {
  const deps = loadDeps(operation);
  if (deps instanceof Response) return deps;
  const refused = transportGate(deps.config, request.headers, operation);
  if (refused !== null) return toResponse(refused);
  let body: Uint8Array;
  try {
    body = await readBoundedBody(request, maxBytes);
  } catch (error) {
    if (error instanceof BodyTooLarge) {
      return jsonResponse(413, { accepted: false, outcome: "TRANSPORT_ERROR", operation, transport_error: "BODY_TOO_LARGE", max_bytes: maxBytes, error_codes: [] });
    }
    throw error;
  }
  return runSafely(operation, () => run(deps, body));
}
