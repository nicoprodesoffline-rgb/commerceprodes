// Cercle 5 — POST /api/site/requests/document (docs/site_events_v2.md §5) : route de la Factory vers le site, signée, portée site_requests.documents.
import { guarded } from "@/lib/site-ratelimit/machine-gate";
import { depositDocument, MAX_DOCUMENT_BODY_BYTES } from "@/lib/site-requests-routes/handlers";
import { routeHttp } from "@/lib/site-requests-routes/http";
import { SCOPE_DOCUMENTS } from "@/lib/site-requests-routes/keyring";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  return guarded(req.headers, () => routeHttp("REQUESTS_DOCUMENT", SCOPE_DOCUMENTS, req, MAX_DOCUMENT_BODY_BYTES, depositDocument));
}
