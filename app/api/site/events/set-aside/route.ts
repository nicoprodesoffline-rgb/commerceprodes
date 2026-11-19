// Cercle 5 — POST /api/site/events/set-aside (docs/site_events_v2.md §5) : route de la Factory vers le site, signée, portée site_events.set_aside.
import { guarded } from "@/lib/site-ratelimit/machine-gate";
import { setAsideEvent, MAX_SMALL_BODY_BYTES } from "@/lib/site-requests-routes/handlers";
import { routeHttp } from "@/lib/site-requests-routes/http";
import { SCOPE_SET_ASIDE } from "@/lib/site-requests-routes/keyring";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  return guarded(req.headers, () => routeHttp("EVENTS_SET_ASIDE", SCOPE_SET_ASIDE, req, MAX_SMALL_BODY_BYTES, setAsideEvent));
}
