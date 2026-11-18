// Cercle 5 — POST /api/site/requests/mail-status (docs/site_events_v2.md §5) : route de la Factory vers le site, signée, portée site_requests.mail_status.
import { guarded } from "@/lib/site-ratelimit/machine-gate";
import { mailStatus, MAX_SMALL_BODY_BYTES } from "@/lib/site-requests-routes/handlers";
import { routeHttp } from "@/lib/site-requests-routes/http";
import { SCOPE_MAIL_STATUS } from "@/lib/site-requests-routes/keyring";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  return guarded(req.headers, () => routeHttp("REQUESTS_MAIL_STATUS", SCOPE_MAIL_STATUS, req, MAX_SMALL_BODY_BYTES, mailStatus));
}
