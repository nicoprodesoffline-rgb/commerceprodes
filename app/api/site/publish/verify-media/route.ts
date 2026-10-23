// Receiver SITE (BC2) — POST /api/site/publish/verify-media. Transport : docs/SITE_TRANSPORT_STAGING.md.
import { handle, readBody } from "@/lib/site-publish/http";
import { verifyMedia } from "@/lib/site-publish/receiver";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const body = await readBody(request);
  return handle("VERIFY_MEDIA", (deps) => verifyMedia(deps, body, request.headers));
}
