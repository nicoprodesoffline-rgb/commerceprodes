/**
 * Adaptateur Next.js (runtime Node) des routes BC4. Configuration et pool relus à chaque requête :
 * configuration invalide → 503 explicite, rien n'est écrit. Les décisions appartiennent au C0 (via business/receipt/events).
 */
import { readBoundedBytes } from "@/lib/site-business/http";
import { serverNowUtc } from "@/lib/site-catalog/clock";
import { SiteDbConfigError, getPool } from "@/lib/site-db/pool";
import { MAX_BYTES as EVENTS_MAX_BYTES } from "@/c0/ts/src/events";
import { submitBusiness, type BusinessKind } from "./business";
import { json, type TxResponse } from "./common";
import { TransactionsConfigError, businessMode, loadEventsKeyring } from "./config";
import { ackEvents, pollEvents } from "./events";
import { getReceipt } from "./receipt";

function toResponse(r: TxResponse): Response {
  return new Response(Buffer.from(r.body), { status: r.status, headers: r.headers });
}

function configError(error: unknown): Response | null {
  if (error instanceof TransactionsConfigError || error instanceof SiteDbConfigError) {
    return toResponse(json(503, { accepted: false, outcome: "TRANSPORT_ERROR", transport_error: error.code, message: error.message, error_codes: [] }));
  }
  return null;
}

async function guarded(run: () => Promise<TxResponse>): Promise<Response> {
  try {
    return toResponse(await run());
  } catch (error) {
    const config = configError(error);
    if (config) return config;
    console.error("[site-transactions] échec interne");
    return toResponse(json(503, { accepted: false, outcome: "TRANSPORT_ERROR", transport_error: "TRANSACTIONS_UNAVAILABLE", error_codes: [] }));
  }
}

/** Vrai si les routes devis/commande doivent passer par BC4 (sinon : comportement A2 inchangé). Lève si invalide. */
export function useBc4Persistence(): boolean {
  return businessMode() === "postgresql";
}

export function businessConfigError(error: unknown): Response | null {
  return configError(error);
}

export async function submitHttp(kind: BusinessKind, req: Request): Promise<Response> {
  return guarded(async () => {
    const pool = getPool();
    const bytes = await readBoundedBytes(req);
    return submitBusiness({ pool, now: serverNowUtc }, kind, bytes);
  });
}

export async function receiptHttp(req: Request): Promise<Response> {
  return guarded(async () => getReceipt({ pool: getPool() }, new URL(req.url).searchParams));
}

export async function pollHttp(req: Request): Promise<Response> {
  return guarded(async () => pollEvents({ pool: getPool(), keyring: loadEventsKeyring() }, req.headers, new URL(req.url).searchParams));
}

export async function ackHttp(req: Request): Promise<Response> {
  return guarded(async () => {
    const keyring = loadEventsKeyring();
    const bytes = await readBoundedBytes(req, EVENTS_MAX_BYTES);
    return ackEvents({ pool: getPool(), keyring }, req.headers, bytes);
  });
}
