import { eventHttp } from "@/lib/site-metrics/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(req: Request): Promise<Response> {
  return eventHttp(req);
}
