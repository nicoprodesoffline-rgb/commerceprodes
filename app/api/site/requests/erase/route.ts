// Cercle 5 — POST /api/site/requests/erase (docs/site_events_v2.md §5) : route de la Factory vers le site, signée, portée site_requests.erase.
import { guarded } from "@/lib/site-ratelimit/machine-gate";
import { eraseRequest, MAX_SMALL_BODY_BYTES } from "@/lib/site-requests-routes/handlers";
import { routeHttp } from "@/lib/site-requests-routes/http";
import { SCOPE_ERASE } from "@/lib/site-requests-routes/keyring";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  return guarded(req.headers, () => routeHttp("REQUESTS_ERASE", SCOPE_ERASE, req, MAX_SMALL_BODY_BYTES, eraseRequest));
}
