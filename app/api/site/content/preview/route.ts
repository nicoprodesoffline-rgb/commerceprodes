// Cercle 3 (3.26, B14) — POST /api/site/content/preview : l'aperçu d'une page en brouillon, par le même canal signé que les contenus, jamais activé. Route machine, hors proxy navigateur.
import { handleWithBody } from "@/lib/site-publish/http";
import { MAX_PREVIEW_BYTES, storePreview } from "@/lib/site-publish/preview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return handleWithBody("CONTENT", request, MAX_PREVIEW_BYTES, (deps, body) => storePreview(deps, body, request.headers));
}
