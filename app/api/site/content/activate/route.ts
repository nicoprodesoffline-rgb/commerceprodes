// Cercle 3 (3.2) — POST /api/site/content/activate : les contenus v2 par le canal signé. Corps borné à 8 Mio (lecture en flux, 413 au-delà), en-têtes vérifiés avant toute lecture du corps.
// Route machine : exclue du proxy navigateur (matcher de proxy.ts), comme /api/site/publish/**.
import { handleWithBody } from "@/lib/site-publish/http";
import { MAX_CONTENT_BYTES, activateContent } from "@/lib/site-publish/content";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return handleWithBody("CONTENT", request, MAX_CONTENT_BYTES, (deps, body) => activateContent(deps, body, request.headers));
}
