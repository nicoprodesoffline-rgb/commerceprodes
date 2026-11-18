// BC4 — GET /api/site/receipt?ref=…&access_token=… (C0 §10.5, lookupReceipt ; demandes d'avant le cercle 5). Voir docs/SITE_DB_SCHEMA.md.
// Cercle 5 — POST /api/site/receipt {ref, code} : toute demande, le code dans le corps (P03), état « reçue » / « transmise à notre équipe ».
import { receiptHttp, receiptPostHttp } from "@/lib/site-transactions/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  return receiptHttp(req);
}

export async function POST(req: Request): Promise<Response> {
  return receiptPostHttp(req);
}
