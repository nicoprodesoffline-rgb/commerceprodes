/**
 * Adaptateur Next.js (runtime Node) des routes BC4. Configuration et pool relus à chaque requête :
 * configuration invalide → 503 explicite, rien n'est écrit. Les décisions appartiennent au C0 (via business/receipt/events).
 */
import { drainFileAcknowledgements } from "../site-ack-mail/file-queue";
import { readBoundedBytes } from "@/lib/site-business/http";
import { logRefusal, type BusinessRoute } from "@/lib/site-business/refusal-log";
import { clockConfig, serverNowUtc } from "@/lib/site-catalog/clock";
import { SiteDbConfigError, getPool } from "@/lib/site-db/pool";
import { MAX_BYTES as EVENTS_MAX_BYTES } from "@/c0/ts/src/events";
import { requestLimitRefusal } from "../site-ratelimit/requests";
import { submitRequest } from "../site-requests/submit";
import type { RequestKind } from "../site-requests/numbers";
import { json, type TxResponse } from "./common";
import { TransactionsConfigError, businessMode, loadEventsKeyring } from "./config";
import { ackEvents, pollEvents } from "./events";
import type { Json } from "@/c0/ts/src/jsonc";
import { checkDated, instant, signResponse, signedPath } from "@/lib/site-publish/transport-gate";
import { RECEIPT_POST_MAX_BYTES, getReceipt, postReceipt, postReceiptDocument } from "./receipt";
import { receiptLimitRefusal } from "../site-ratelimit/receipt";

function toResponse(r: TxResponse, route?: BusinessRoute): Response {
  if (route && r.status >= 400) logRefusal(route, r.status, JSON.parse(Buffer.from(r.body).toString("utf8")));
  return new Response(Buffer.from(r.body), { status: r.status, headers: r.headers });
}

function configError(error: unknown, route?: BusinessRoute): Response | null {
  if (error instanceof TransactionsConfigError || error instanceof SiteDbConfigError) {
    return toResponse(json(503, { accepted: false, outcome: "TRANSPORT_ERROR", transport_error: error.code, message: error.message, error_codes: [] }), route);
  }
  return null;
}

async function guarded(run: () => Promise<TxResponse>, route?: BusinessRoute): Promise<Response> {
  try {
    return toResponse(await run(), route);
  } catch (error) {
    const config = configError(error, route);
    if (config) return config;
    console.error("[site-transactions] échec interne");
    return toResponse(json(503, { accepted: false, outcome: "TRANSPORT_ERROR", transport_error: "TRANSACTIONS_UNAVAILABLE", error_codes: [] }), route);
  }
}

/** Vrai si les routes devis/commande doivent passer par BC4 (sinon : comportement A2 inchangé). Lève si invalide. */
export function useBc4Persistence(): boolean {
  return businessMode() === "postgresql";
}

/** Cercle 4, 4.15 : enregistrement éteint — réponse 503 claire, avant toute lecture du corps et toute écriture. `null` si la demande en ligne est ouverte (ou en mode A2). */
export function closedRefusal(): Response | null {
  let mode;
  try {
    mode = businessMode();
  } catch {
    return null;   // configuration invalide : les routes la signalent elles-mêmes
  }
  if (mode !== "closed") return null;
  return new Response(JSON.stringify({ site_status: "ONLINE_REQUEST_CLOSED", message: "La demande en ligne n'est pas encore ouverte. Rien n'a été enregistré.", persistence: "NONE", durable: false, verdict: null }), {
    status: 503,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

export function businessConfigError(error: unknown, route: BusinessRoute): Response | null {
  return configError(error, route);
}

/** Cercle 5 : devis, commande et demande libre avec coordonnées (docs/site_events_v2.md) : une transaction, un événement v2. */
export async function submitHttp(kind: RequestKind, req: Request): Promise<Response> {
  // 5.23 : la limite par adresse passe AVANT toute lecture du corps et toute écriture.
  const limited = requestLimitRefusal(req.headers);
  if (limited !== null) return limited;
  return guarded(async () => {
    const pool = getPool();
    const bytes = await readBoundedBytes(req);
    const forced = clockConfig().forced;
    return submitRequest({ pool, now: serverNowUtc, metricsNow: forced === null ? undefined : () => new Date(forced) }, kind, bytes);
  }, kind === "quote_request" ? "/api/site/quote" : kind === "order" ? "/api/site/order" : "/api/site/message");
}

export async function receiptHttp(req: Request): Promise<Response> {
  return guarded(async () => getReceipt({ pool: getPool() }, new URL(req.url).searchParams), "/api/site/receipt");
}

/** Cercle 5 (5.22, 5.23) : la limite de consultation du reçu (5 par minute et par adresse par défaut ; `SITE_RECEIPT_LIMIT`) est dans lib/site-ratelimit/receipt.ts. */
const receiptLimited = (req: Request): Response | null => receiptLimitRefusal(req.headers);

/** `POST /api/site/receipt` {ref, code} : le code voyage dans le corps, jamais dans l'adresse (P03). */
export async function receiptPostHttp(req: Request): Promise<Response> {
  return receiptLimited(req) ?? guarded(async () => postReceipt({ pool: getPool() }, await readBoundedBytes(req, RECEIPT_POST_MAX_BYTES)), "/api/site/receipt");
}

/** `POST /api/site/receipt/document` {ref, code} : le PDF de la Factory, une fois la demande transmise. */
export async function receiptDocumentHttp(req: Request): Promise<Response> {
  return receiptLimited(req) ?? guarded(async () => postReceiptDocument({ pool: getPool() }, await readBoundedBytes(req, RECEIPT_POST_MAX_BYTES)), "/api/site/receipt");
}

export async function pollHttp(req: Request): Promise<Response> {
  const response = await guarded(async () => pollEvents({ pool: getPool(), keyring: loadEventsKeyring() }, req.headers, new URL(req.url).searchParams));
  // B-3 : le relevé régulier de la Factory sert de tour à la file de l'accusé en mode « fichier » (aucun ordonnanceur propre au site) ; sans effet dans les autres modes.
  if (response.status === 200 && process.env["SITE_ACK_MAIL_MODE"] === "fichier") {
    void drainFileAcknowledgements(getPool()).catch(() => console.error("[site-ack-mail] FILE_TURN_FAILED"));
  }
  return response;
}

export async function ackHttp(req: Request): Promise<Response> {
  let keyring: Json | null = null;
  const response = await guarded(async () => {
    keyring = loadEventsKeyring();
    const pool = getPool();
    const bytes = await readBoundedBytes(req, EVENTS_MAX_BYTES);
    // Cercle 4 (4.4) : l'accusé des événements porte l'anti-rejeu daté du transport (docs/contracts/c0_transport_v1.md §3).
    const now = new Date();
    const dated = await checkDated(keyring, pool, req.headers, req.method, signedPath(req), bytes, now);
    if (dated !== null) {
      return json(401, { accepted: false, outcome: "TRANSPORT_ERROR", operation: "EVENTS_ACK", transport_error: dated, error_codes: [], server_time_utc: instant(now) });
    }
    return ackEvents({ pool, keyring }, req.headers, bytes);
  });
  // 4.5 : la réponse est signée par la clé d'accusé du SITE quand elle est réglée (SITE_ACK_KEY_ID).
  const ackKeyId = process.env["SITE_ACK_KEY_ID"];
  return keyring !== null && ackKeyId ? signResponse(keyring, ackKeyId, req.headers, response) : response;
}
