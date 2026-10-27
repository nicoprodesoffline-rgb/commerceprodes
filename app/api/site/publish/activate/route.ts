// Receiver SITE (BC2) — POST /api/site/publish/activate. Transport : docs/SITE_TRANSPORT_STAGING.md.
// Corps borné à MAX_CONTROL_BYTES (lecture en flux, 413 au-delà), en-têtes vérifiés avant toute lecture du corps.
import { handleWithBody } from "@/lib/site-publish/http";
import { MAX_CONTROL_BYTES, activate } from "@/lib/site-publish/receiver";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return handleWithBody("ACTIVATE", request, MAX_CONTROL_BYTES, (deps, body) => activate(deps, body, request.headers));
}
