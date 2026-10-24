// BC4 — POST /api/site/events/ack {cursor} | {event_ids:[…]}. Transport : docs/SITE_TRANSPORT_STAGING.md (annexe poll/ACK).
import { ackHttp } from "@/lib/site-transactions/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  return ackHttp(req);
}
