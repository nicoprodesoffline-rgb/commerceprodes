import { withCatalog } from "@/lib/site-business/http";
import { previewCart } from "@/lib/site-business/validate";

export const dynamic = "force-dynamic";

/**
 * Aperçu de panier : `selectPrice` C0 par ligne, à l'instant serveur, sur la génération servie.
 * Aucune écriture. Le client affiche CE résultat ; devis et commande le revalident.
 */
export async function POST(req: Request) {
  return withCatalog(req, ({ catalog, nowUtc, bytes }) =>
    previewCart({ bytes, generation: catalog.c0Generation, catalogueSequence: catalog.meta.catalogue_sequence, nowUtc }),
  );
}
