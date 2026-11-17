// Cercle 4, lot T (4.5, S03) — GET /api/site/link/probe : la sonde signée de l'écran Liaison (docs/contracts/c0_transport_v1.md §5).
// Hors fenêtre de 300 s, elle répond quand même avec son heure (« horloges désaccordées »), sans garder le nonce.
import { handleTransport } from "@/lib/site-publish/http";
import { probe } from "@/lib/site-link/link";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return handleTransport("LINK_PROBE", request, 0, (deps, _body, stale) =>
    probe(deps.pool, request.headers.get("x-c0-key-id"), request.headers.get("x-c0-nonce"), stale), { answerStale: true });
}
