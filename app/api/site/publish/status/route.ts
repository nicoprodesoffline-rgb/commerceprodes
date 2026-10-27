// Receiver SITE (BC2) — GET /api/site/publish/status?publication_id=…&catalogue_sequence=… (signé, sans octets).
// Le corps éventuel d'un GET n'est jamais lu ; en-têtes vérifiés par la porte de transport.
import { handle } from "@/lib/site-publish/http";
import { status } from "@/lib/site-publish/receiver";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  return handle("STATUS", request.headers, (deps) =>
    status(deps, url.searchParams.get("publication_id"), url.searchParams.get("catalogue_sequence"), request.headers),
  );
}
