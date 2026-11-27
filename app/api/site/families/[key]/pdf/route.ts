import { getPool } from "@/lib/site-db/pool";
import { createPdfHandler } from "@/lib/site-pdf/http";
import { resolveFamilyPdf } from "@/lib/site-pdf/source";
import { retainedPdf, purgeExpiredPdfs } from "@/lib/site-pdf/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const download = createPdfHandler({
  resolve: resolveFamilyPdf,
  purge: () => purgeExpiredPdfs(getPool()),
  document: input => retainedPdf(getPool(), input),
});

export async function GET(req: Request, { params }: { params: Promise<{ key: string }> }): Promise<Response> {
  return download(req, (await params).key);
}
