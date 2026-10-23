// Receiver SITE (BC2) — POST /api/site/publish/stage. Transport : docs/SITE_TRANSPORT_STAGING.md.
import { handle, readBody } from "@/lib/site-publish/http";
import { stage } from "@/lib/site-publish/receiver";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const body = await readBody(request);
  return handle("STAGE", (deps) => stage(deps, body, request.headers));
}
