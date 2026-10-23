import { withCatalog } from "@/lib/site-business/http";
import { validateQuote } from "@/lib/site-business/validate";
import { businessConfigError, submitHttp, useBc4Persistence } from "@/lib/site-transactions/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Demande de devis.
 * - `SITE_BUSINESS_PERSISTENCE=postgresql` : transaction BC4 durable (génération ACTIVE en base, idempotence, outbox).
 * - absente : verdict C0 A2 sans persistance (`NONE_UNTIL_BC4`, jamais durable).
 */
export async function POST(req: Request) {
  let bc4: boolean;
  try {
    bc4 = useBc4Persistence();
  } catch (error) {
    const r = businessConfigError(error);
    if (r) return r;
    throw error;
  }
  if (bc4) return submitHttp("quote_request", req);
  return withCatalog(req, ({ catalog, nowUtc, bytes }) =>
    validateQuote({ bytes, generation: catalog.c0Generation, catalogueSequence: catalog.meta.catalogue_sequence, nowUtc }),
  );
}
