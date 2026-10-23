// Receiver SITE (BC2) — PUT /api/site/publish/media/{sha256} (STAGING_TRANSPORT, hors contrat C0).
import { handle, readBody } from "@/lib/site-publish/http";
import { putMedia } from "@/lib/site-publish/receiver";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(request: Request, context: { params: Promise<{ sha256: string }> }): Promise<Response> {
  const { sha256 } = await context.params;
  const body = await readBody(request);
  return handle("MEDIA_PUT", (deps) => putMedia(deps, sha256, body, request.headers, request.headers.get("content-type")));
}
