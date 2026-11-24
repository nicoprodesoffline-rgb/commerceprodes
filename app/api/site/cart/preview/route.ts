import { withCatalog } from "@/lib/site-business/http";
import { previewCart } from "@/lib/site-business/validate";

export const dynamic = "force-dynamic";

/**
 * Aperçu de panier : `selectPrice` C0 par ligne, à l'instant serveur, sur la génération servie.
 * Aucune écriture. Le client affiche CE résultat ; devis et commande le revalident.
 * Cercle 9, 9.8 : `minimum_quantity` quand le plus petit palier publié dépasse 1.
 * Cercle 5, 5.7 : chaque ligne d'un lot porte `lot` (« 10 achetés + 2 offerts »), lu dans le catalogue servi ; le prix reste celui du lot.
 */
export async function POST(req: Request) {
  return withCatalog(req, ({ catalog, nowUtc, bytes }) => {
    const r = previewCart({ bytes, generation: catalog.c0Generation, catalogueSequence: catalog.meta.catalogue_sequence, nowUtc });
    const lines = r.body.lines.map((line) => {
      const hit = typeof line.public_item_key === "string" ? catalog.resolveItem(line.public_item_key) : null;
      const pack = hit !== null && hit.kind === "PUBLISHED" ? hit.item.pack : undefined;
      // Cercle 9, 9.8 : le minimum de commande est le plus petit palier publié (la Factory l'aligne sur le PCB) ; le panier le nomme.
      const tiers = hit !== null && hit.kind === "PUBLISHED" ? hit.item.windows.map((w) => w.quantity_min).filter((n) => Number.isSafeInteger(n) && n >= 1) : [];
      const minimum = tiers.length ? Math.min(...tiers) : 1;
      const withMinimum = minimum > 1 ? { ...line, minimum_quantity: minimum } : line;
      return pack === undefined ? withMinimum : { ...withMinimum, lot: { bought: pack.paid_units, free: pack.free_units } };
    });
    return { status: r.status, body: { ...r.body, lines } };
  }, "/api/site/cart/preview");
}
