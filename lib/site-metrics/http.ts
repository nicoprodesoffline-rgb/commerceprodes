import type { Pool } from "pg";
import { loadCatalog } from "../site-catalog/catalog";
import { clockConfig, serverNowUtc } from "../site-catalog/clock";
import { getPool } from "../site-db/pool";
import { readBoundedBody } from "../site-publish/http";
import { signedPath } from "../site-publish/transport-gate";
import { checkRouteRequest, transportSecure } from "../site-requests-routes/gate";
import { signed } from "../site-requests-routes/http";
import { loadRouteKeyring, SCOPE_METRICS_READ, type RouteKeyring } from "../site-requests-routes/keyring";
import { createLimiter, parseEvent, validDay, MAX_BYTES, type Batch } from "./core";
import { increment, readBatch } from "./store";

const allow = createLimiter();
async function servedKeys(): Promise<ReadonlySet<string>> {
  const catalog = await loadCatalog();
  return new Set(catalog.families.flatMap((family) => family.items.map((item) => item.public_item_key)));
}
type Deps = {
  pool: Pool; now: () => Date; keys: () => Promise<ReadonlySet<string>>;
  keyring: () => RouteKeyring; sign: (req: Request, res: Response) => Promise<Response>;
  read: typeof readBatch; allow: (key: string, now: number) => boolean;
};
function defaults(): Deps {
  return { pool: getPool(), now: () => new Date(serverNowUtc()), keys: servedKeys, keyring: loadRouteKeyring, sign: signed, read: readBatch, allow };
}
function empty(status: number): Response {
  return new Response(null, { status, headers: { "cache-control": "no-store" } });
}
/** Route publique indépendante des portes à adresses : ne lit ni adresse ni cookies, même pour les refus. */
export async function eventHttp(req: Request, injected?: Deps): Promise<Response> {
  try {
    const bytes = await readBoundedBody(req, 1024).catch(() => null);
    if (bytes === null) return empty(400);
    const deps = injected ?? defaults();
    const event = parseEvent(bytes, await deps.keys());
    if (event === null) return empty(400);
    if (deps.allow(event.key, deps.now().getTime())) {
      const forced = injected ? null : clockConfig().forced;
      await increment(deps.pool, event.key, event.event, injected?.now ?? (forced === null ? undefined : () => new Date(forced)));
    }
    return empty(204);
  } catch { return empty(503); }
}
/** Même porte datée et même signature de réponse que les routes des demandes. Aucune enveloppe ajoutée au contrat. */
export async function metricsHttp(req: Request, injected?: Deps): Promise<Response> {
  const sign = injected?.sign ?? signed;
  const refuse = async (status: number): Promise<Response> => {
    try { return await sign(req, empty(status)); } catch { return empty(503); }
  };
  if (!transportSecure(req.url, req.headers)) return refuse(403);
  try {
    const deps = injected ?? defaults();
    const keyring = deps.keyring();
    if (keyring.keys.filter((k) => k.scope === SCOPE_METRICS_READ && k.status === "ACTIVE").length !== 1) return refuse(503);
    const now = deps.now();
    const bytes = await readBoundedBody(req, 0).catch(() => null);
    if (bytes === null) return refuse(400);
    const refusal = await checkRouteRequest(keyring, deps.pool, req.headers, SCOPE_METRICS_READ, req.method, signedPath(req), bytes, now);
    if (refusal !== null) return refuse(401);
    const params = new URL(req.url).searchParams;
    const depuis = params.get("depuis");
    if (!validDay(depuis) || params.getAll("depuis").length !== 1 || [...params.keys()].some((k) => k !== "depuis")) return refuse(400);
    const batch: Batch = await deps.read(deps.pool, depuis, now, await deps.keys());
    const body = JSON.stringify(batch);
    if (Buffer.byteLength(body) > MAX_BYTES) return refuse(503);
    const response = await deps.sign(req, new Response(body, { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } }));
    // Une clé d'accusé absente ne doit jamais produire un lot 200 non signé.
    if (!response.headers.has("x-c0-response-signature") || !response.headers.has("x-c0-response-key-id")) return refuse(503);
    return response;
  } catch {
    console.warn("[site-metrics] lecture_indisponible");
    return refuse(503);
  }
}
