import { withCatalog } from "@/lib/site-business/http";
import { validateOrder } from "@/lib/site-business/validate";

export const dynamic = "force-dynamic";

/** Commande : verdict C0 `validateOrderSubmit` sur les octets bruts, sans persistance (BC4). */
export async function POST(req: Request) {
  return withCatalog(req, ({ catalog, nowUtc, bytes }) =>
    validateOrder({ bytes, generation: catalog.c0Generation, catalogueSequence: catalog.meta.catalogue_sequence, nowUtc }),
  );
}
