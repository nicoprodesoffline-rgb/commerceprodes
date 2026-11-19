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
 * Cercle 4, lot T (docs/contracts/c0_transport_v1.md) : après la lecture bornée, le contrôle daté (`transport-gate.ts` :
 * clé connue, en-têtes datés, signature de transport, fenêtre de 300 s, nonce jamais vu) ; toute réponse à une requête
 * datée est signée par la clé d'accusé du SITE.
 */
import { guarded } from "../site-ratelimit/machine-gate";
import { advanceEpoch } from "../site-db/epoch";
import { SiteDbConfigError, getPool } from "../site-db/pool";
import { ReceiverConfigError, loadReceiverConfig } from "./config";
import { SCOPE_PUBLISH, keyHasScope } from "../../c0/ts/src/signing";
import { transportGate, type HeaderSource, type ReceiverDeps, type ReceiverResponse } from "./receiver";
import { checkDated, refusal, signResponse, signedPath } from "./transport-gate";

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

async function runSafely(operation: string, run: () => Promise<ReceiverResponse>, { epoch = true }: { epoch?: boolean } = {}): Promise<Response> {
  try {
    const out = await run();
    // Cercle 4 (4.11, 4.12) : une publication reçue par CE processus invalide ce que le site gardait en mémoire (réglages, redirections, résolution des images).
    // La sonde et la question des médias manquants ne changent rien : elles n'avancent pas l'époque.
    if (out.status === 200 && epoch) advanceEpoch();
    return toResponse(out);
  } catch (error) {
    const code = typeof (error as { code?: unknown }).code === "string" ? (error as { code: string }).code : "ERROR";
    console.error(`[site-publish] ${operation} échec interne code=${code}`);
    return jsonResponse(503, { accepted: false, outcome: "TRANSPORT_ERROR", operation, transport_error: "RECEIVER_UNAVAILABLE", error_codes: [] });
  }
}

/** Opération sans corps (STATUS) : configuration, porte de transport, receiver. */
export async function handle(operation: string, headers: HeaderSource | null, run: (deps: ReceiverDeps) => Promise<ReceiverResponse>): Promise<Response> {
  // Cercle 4 (4.10) : garde par adresse avant tout (liste autorisée, limite de refus, débit). `headers` null (aucune route aujourd'hui) : pas de garde.
  if (headers === null) return handleUnguarded(operation, headers, run);
  return guarded(headers, () => handleUnguarded(operation, headers, run));
}

async function handleUnguarded(operation: string, headers: HeaderSource | null, run: (deps: ReceiverDeps) => Promise<ReceiverResponse>): Promise<Response> {
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
  return guarded(request.headers, () => handleWithBodyUnguarded(operation, request, maxBytes, run));
}

async function handleWithBodyUnguarded(
  operation: string,
  request: Request,
  maxBytes: number,
  run: (deps: ReceiverDeps, body: Uint8Array) => Promise<ReceiverResponse>,
): Promise<Response> {
  return signedUnguarded(operation, request, maxBytes, (deps, body) => run(deps, body));
}

/** Cercle 4 (4.4) : une route de la Factory sans corps (STATUS) avec l'anti-rejeu daté et la réponse signée. */
export async function handleGet(operation: string, request: Request, run: (deps: ReceiverDeps) => Promise<ReceiverResponse>): Promise<Response> {
  return guarded(request.headers, () => signedUnguarded(operation, request, 0, (deps) => run(deps)));
}

/**
 * Cercle 4 (4.3, 4.5) : les routes de transport sans signature C0 (`media/missing`, `link/probe`) : clé de publication connue,
 * anti-rejeu daté, réponse signée ; `answerStale` laisse la sonde répondre hors fenêtre (elle dit alors l'écart, sans garder le nonce).
 */
export async function handleTransport(
  operation: string,
  request: Request,
  maxBytes: number,
  run: (deps: ReceiverDeps, body: Uint8Array, stale: boolean) => Promise<ReceiverResponse>,
  { answerStale = false, requestDomain }: { answerStale?: boolean; requestDomain?: string } = {},
): Promise<Response> {
  return guarded(request.headers, () => signedUnguarded(operation, request, maxBytes, run, { c0Gate: false, answerStale, epoch: false, ...(requestDomain !== undefined ? { requestDomain } : {}) }));
}

async function signedUnguarded(
  operation: string,
  request: Request,
  maxBytes: number,
  run: (deps: ReceiverDeps, body: Uint8Array, stale: boolean) => Promise<ReceiverResponse>,
  { c0Gate = true, answerStale = false, epoch = true, requestDomain }: { c0Gate?: boolean; answerStale?: boolean; epoch?: boolean; requestDomain?: string } = {},
): Promise<Response> {
  const deps = loadDeps(operation);
  if (deps instanceof Response) return deps;
  const sign = (response: Response) => signResponse(deps.config.keyring, deps.config.ackKeyId, request.headers, response);
  if (c0Gate) {
    const refused = transportGate(deps.config, request.headers, operation);
    if (refused !== null) return sign(toResponse(refused));
  } else if (!keyHasScope(deps.config.keyring, request.headers.get("x-c0-key-id"), SCOPE_PUBLISH)) {
    return sign(refusal("KEY_UNKNOWN", operation));
  }
  let body: Uint8Array;
  try {
    body = await readBoundedBody(request, maxBytes);
  } catch (error) {
    if (error instanceof BodyTooLarge) {
      return sign(jsonResponse(413, { accepted: false, outcome: "TRANSPORT_ERROR", operation, transport_error: "BODY_TOO_LARGE", max_bytes: maxBytes, error_codes: [] }));
    }
    throw error;
  }
  const now = new Date();
  let dated;
  try {
    dated = await checkDated(deps.config.keyring, deps.pool, request.headers, request.method, signedPath(request), body, now, requestDomain === undefined ? {} : { domain: requestDomain });
  } catch (error) {
    const code = typeof (error as { code?: unknown }).code === "string" ? (error as { code: string }).code : "ERROR";
    console.error(`[site-publish] ${operation} contrôle daté indisponible code=${code}`);
    return sign(jsonResponse(503, { accepted: false, outcome: "TRANSPORT_ERROR", operation, transport_error: "RECEIVER_UNAVAILABLE", error_codes: [] }));
  }
  const stale = answerStale && dated === "REQUEST_STALE";
  if (dated !== null && !stale) return sign(refusal(dated, operation, now));
  return sign(await runSafely(operation, () => run(deps, body, stale), { epoch }));
}
