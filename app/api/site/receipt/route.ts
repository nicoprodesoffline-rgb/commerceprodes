// BC4 — GET /api/site/receipt?ref=…&access_token=… (C0 §10.5, lookupReceipt). Voir docs/SITE_DB_SCHEMA.md.
import { receiptHttp } from "@/lib/site-transactions/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  return receiptHttp(req);
}
