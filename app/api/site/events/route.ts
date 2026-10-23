// BC4 — GET /api/site/events?cursor=&limit= (C0 §11.3). Transport : docs/SITE_TRANSPORT_STAGING.md (annexe poll/ACK).
import { pollHttp } from "@/lib/site-transactions/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  return pollHttp(req);
}
