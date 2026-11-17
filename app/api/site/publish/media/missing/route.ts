// Cercle 4, lot T (4.3) — POST /api/site/publish/media/missing : les médias que le SITE n'a pas (docs/contracts/c0_transport_v1.md §4).
// Clé de publication, anti-rejeu daté et réponse signée par handleTransport ; aucune signature C0, rien n'est écrit.
import { handleTransport } from "@/lib/site-publish/http";
import { MAX_MISSING_BYTES, missingMedia } from "@/lib/site-link/link";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return handleTransport("MEDIA_MISSING", request, MAX_MISSING_BYTES, (deps, body) => missingMedia(deps.pool, body));
}
