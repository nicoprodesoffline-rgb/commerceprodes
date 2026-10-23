import { loadCatalog } from "@/lib/site-catalog/catalog";
import { CatalogUnavailable } from "@/lib/site-catalog/source";

export const dynamic = "force-dynamic";

function page(status: number, title: string, text: string): Response {
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>${title}</title></head><body style="font-family:sans-serif;max-width:40rem;margin:4rem auto;padding:0 1rem"><h1>${title}</h1><p>${text}</p><p><a href="/">Retour au catalogue</a></p></body></html>`;
  return new Response(html, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

/**
 * Adresse publique d'un Item par sa `public_item_key` (C0 §12, registre d'identité du DTO) :
 * publiée → fiche Famille, variante présélectionnée ; SUPERSEDED → redirection permanente vers la
 * canonique ; RETIRED → 410 ; absente → 404. Aucune résolution hors du DTO servi.
 */
/** Redirection à `Location` RELATIVE (revue A2, F-02) : jamais l'hôte interne de `req.url`. */
function redirect(location: string, status: 307 | 308): Response {
  return new Response(null, { status, headers: { location, "cache-control": "no-store" } });
}

export async function GET(_req: Request, ctx: { params: Promise<{ key: string }> }) {
  const { key } = await ctx.params;
  let catalog;
  try {
    catalog = await loadCatalog();
  } catch (error) {
    if (error instanceof CatalogUnavailable) return page(503, "Catalogue indisponible", "Le catalogue ne peut pas être servi pour le moment.");
    throw error;
  }
  const r = catalog.resolveItem(key);
  switch (r.kind) {
    case "PUBLISHED":
      return redirect(`/famille/${encodeURIComponent(r.family.slug)}?article=${encodeURIComponent(key)}`, 307);
    case "SUPERSEDED":
      return redirect(`/article/${encodeURIComponent(r.superseded_by)}`, 308);
    case "RETIRED":
      return page(410, "Article retiré", "Cet article a été retiré du catalogue et ne sera plus proposé.");
    default:
      return page(404, "Article introuvable", "Aucun article publié ne porte cette référence.");
  }
}
