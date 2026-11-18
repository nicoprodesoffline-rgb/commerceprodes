import { getCatalogSource, CatalogUnavailable } from "@/lib/site-catalog/source";
import { mediaViews, pickDerivative, type MediaView } from "@/lib/site-catalog/media-view";

const viewsOf = new WeakMap<object, Map<string, MediaView>>();

/**
 * Les octets d'un média. Une empreinte servie telle quelle (version réduite, image sans version réduite, document) répond directement ;
 * l'identité d'une image qui a des versions réduites répond par celle dont la largeur convient (`width`, sinon la plus grande).
 */
export async function serveMedia(sha256: string, widthParam: string | null): Promise<Response> {
  if (!/^[0-9a-f]{64}$/.test(sha256)) return new Response("Not found", { status: 404 });
  const width = widthParam !== null && /^[0-9]{1,5}$/.test(widthParam) ? Number(widthParam) : null;
  let media;
  let byIdentity = false;
  try {
    const source = await getCatalogSource();
    let served = sha256;
    const generation = await source.getGeneration();
    if (generation !== null && generation.snapshot !== null) {
      let views = viewsOf.get(generation.snapshot as object);
      if (views === undefined) {
        views = mediaViews(generation.snapshot);
        viewsOf.set(generation.snapshot as object, views);
      }
      const view = views.get(sha256);
      const picked = view ? pickDerivative(view.derivatives, width) : null;
      if (picked) { served = picked.sha256; byIdentity = true; }
    }
    media = await source.getMedia(served);
  } catch (error) {
    if (error instanceof CatalogUnavailable) return new Response("Catalogue indisponible", { status: 503 });
    throw error;
  }
  if (!media) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(media.bytes), {
    headers: {
      "content-type": media.mime,
      "content-length": String(media.bytes.length),
      // Une empreinte servie telle quelle ne change jamais ; une identité d'image répond par la version de la génération servie : durée courte.
      "cache-control": byIdentity ? "public, max-age=3600" : "public, max-age=31536000, immutable",
    },
  });
}
