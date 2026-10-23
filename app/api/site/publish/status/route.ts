// Receiver SITE (BC2) — GET /api/site/publish/status?publication_id=…&catalogue_sequence=… (signé, sans octets).
import { handle } from "@/lib/site-publish/http";
import { status } from "@/lib/site-publish/receiver";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  return handle("STATUS", (deps) => status(deps, url.searchParams.get("publication_id"), url.searchParams.get("catalogue_sequence"), request.headers));
}
