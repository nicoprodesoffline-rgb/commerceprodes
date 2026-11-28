import { metricsHttp } from "@/lib/site-metrics/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: Request): Promise<Response> {
  return metricsHttp(req);
}
