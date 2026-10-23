/**
 * Adaptateur Next.js (runtime Node) des routes /api/site/publish/** vers le receiver.
 * La configuration et le pool sont relus à chaque requête : une configuration invalide
 * refuse l'opération (503 RECEIVER_CONFIG_INVALID / SITE_DB_CONFIG_INVALID), rien n'est activé.
 */
import { SiteDbConfigError, getPool } from "../site-db/pool";
import { ReceiverConfigError, loadReceiverConfig } from "./config";
import type { ReceiverDeps, ReceiverResponse } from "./receiver";

function jsonResponse(status: number, value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

export async function readBody(request: Request): Promise<Uint8Array> {
  return new Uint8Array(await request.arrayBuffer());
}

export async function handle(operation: string, run: (deps: ReceiverDeps) => Promise<ReceiverResponse>): Promise<Response> {
  let deps: ReceiverDeps;
  try {
    deps = { pool: getPool(), config: loadReceiverConfig() };
  } catch (error) {
    if (error instanceof ReceiverConfigError || error instanceof SiteDbConfigError) {
      return jsonResponse(503, { accepted: false, outcome: "TRANSPORT_ERROR", operation, transport_error: error.code, message: error.message, error_codes: [] });
    }
    throw error;
  }
  try {
    const out = await run(deps);
    return new Response(Buffer.from(out.body), { status: out.status, headers: out.headers });
  } catch (error) {
    const code = typeof (error as { code?: unknown }).code === "string" ? (error as { code: string }).code : "ERROR";
    console.error(`[site-publish] ${operation} échec interne code=${code}`);
    return jsonResponse(503, { accepted: false, outcome: "TRANSPORT_ERROR", operation, transport_error: "RECEIVER_UNAVAILABLE", error_codes: [] });
  }
}
