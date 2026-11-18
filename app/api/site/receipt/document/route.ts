// Cercle 5 — POST /api/site/receipt/document {ref, code} : le PDF déposé par la Factory, proposé une fois la demande transmise (5.22).
import { receiptDocumentHttp } from "@/lib/site-transactions/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  return receiptDocumentHttp(req);
}
