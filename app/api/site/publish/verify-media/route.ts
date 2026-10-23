// Receiver SITE (BC2) — POST /api/site/publish/verify-media. Transport : docs/SITE_TRANSPORT_STAGING.md.
// Corps borné à MAX_CONTROL_BYTES (lecture en flux, 413 au-delà), en-têtes vérifiés avant toute lecture du corps.
import { handleWithBody } from "@/lib/site-publish/http";
import { MAX_CONTROL_BYTES, verifyMedia } from "@/lib/site-publish/receiver";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return handleWithBody("VERIFY_MEDIA", request, MAX_CONTROL_BYTES, (deps, body) => verifyMedia(deps, body, request.headers));
}
