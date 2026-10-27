// Receiver SITE (BC2) — PUT /api/site/publish/media/{sha256} (STAGING_TRANSPORT, hors contrat C0).
// Corps borné à MAX_MEDIA_BYTES (20 MiB, lecture en flux, 413 au-delà), en-têtes vérifiés avant toute lecture du corps.
import { handleWithBody } from "@/lib/site-publish/http";
import { MAX_MEDIA_BYTES, putMedia } from "@/lib/site-publish/receiver";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(request: Request, context: { params: Promise<{ sha256: string }> }): Promise<Response> {
  const { sha256 } = await context.params;
  return handleWithBody("MEDIA_PUT", request, MAX_MEDIA_BYTES, (deps, body) =>
    putMedia(deps, sha256, body, request.headers, request.headers.get("content-type")),
  );
}
