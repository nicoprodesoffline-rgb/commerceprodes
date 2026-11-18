import { withCatalog } from "@/lib/site-business/http";
import { previewCart } from "@/lib/site-business/validate";

export const dynamic = "force-dynamic";

/**
 * Aperçu de panier : `selectPrice` C0 par ligne, à l'instant serveur, sur la génération servie.
 * Aucune écriture. Le client affiche CE résultat ; devis et commande le revalident.
 * Cercle 5, 5.7 : chaque ligne d'un lot porte `lot` (« 10 achetés + 2 offerts »), lu dans le catalogue servi ; le prix reste celui du lot.
 */
export async function POST(req: Request) {
  return withCatalog(req, ({ catalog, nowUtc, bytes }) => {
    const r = previewCart({ bytes, generation: catalog.c0Generation, catalogueSequence: catalog.meta.catalogue_sequence, nowUtc });
    const lines = r.body.lines.map((line) => {
      const hit = typeof line.public_item_key === "string" ? catalog.resolveItem(line.public_item_key) : null;
      const pack = hit !== null && hit.kind === "PUBLISHED" ? hit.item.pack : undefined;
      return pack === undefined ? line : { ...line, lot: { bought: pack.paid_units, free: pack.free_units } };
    });
    return { status: r.status, body: { ...r.body, lines } };
  }, "/api/site/cart/preview");
}
