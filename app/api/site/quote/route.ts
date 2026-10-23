import { withCatalog } from "@/lib/site-business/http";
import { validateQuote } from "@/lib/site-business/validate";

export const dynamic = "force-dynamic";

/** Demande de devis : verdict C0 `validateQuoteRequest` sur les octets bruts, sans persistance (BC4). */
export async function POST(req: Request) {
  return withCatalog(req, ({ catalog, nowUtc, bytes }) =>
    validateQuote({ bytes, generation: catalog.c0Generation, catalogueSequence: catalog.meta.catalogue_sequence, nowUtc }),
  );
}
