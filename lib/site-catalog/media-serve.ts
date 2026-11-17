import { getCatalogSource, CatalogUnavailable } from "@/lib/site-catalog/source";
import { currentEpoch, stillValid } from "@/lib/site-db/epoch";
import { cachedMedia, rememberMedia } from "./media-cache";
import { mediaViews, pickDerivative, type MediaView } from "@/lib/site-catalog/media-view";

const viewsOf = new WeakMap<object, Map<string, MediaView>>();

/**
 * Les octets d'un média. Une empreinte servie telle quelle (version réduite, image sans version réduite, document) répond directement ;
 * l'identité d'une image qui a des versions réduites répond par celle dont la largeur convient (`width`, sinon la plus grande).
 */
export async function serveMedia(sha256: string, widthParam: string | null, ifNoneMatch: string | null = null): Promise<Response> {
  if (!/^[0-9a-f]{64}$/.test(sha256)) return new Response("Not found", { status: 404 });
  const width = widthParam !== null && /^[0-9]{1,5}$/.test(widthParam) ? Number(widthParam) : null;
  // Cercle 4 (4.11) : la résolution « adresse demandée → octets servis » reste en mémoire tant qu'aucune publication n'est arrivée ; une réponse déjà en mémoire ne touche pas la base.
  const resolutionKey = `${sha256}|${width ?? ""}`;
  const known = resolutions.get(resolutionKey);
  if (known !== undefined && stillValid(known)) {
    const memory = cachedMedia(known.served);
    if (memory !== null) return respond(known.served, memory, known.byIdentity, ifNoneMatch);
  }
  let media;
  let byIdentity = false;
  let served = sha256;
  const epoch = currentEpoch();
  try {
    const source = await getCatalogSource();
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
    media = cachedMedia(served) ?? (await source.getMedia(served));
  } catch (error) {
    if (error instanceof CatalogUnavailable) return new Response("Catalogue indisponible", { status: 503 });
    throw error;
  }
  if (!media) return new Response("Not found", { status: 404 });
  const entry = { bytes: media.bytes, mime: media.mime };
  rememberMedia(served, entry);
  if (resolutions.size >= 5000) resolutions.delete(resolutions.keys().next().value!);
  resolutions.set(resolutionKey, { served, byIdentity, epoch, at: Date.now() });
  return respond(served, entry, byIdentity, ifNoneMatch);
}

const resolutions = new Map<string, { served: string; byIdentity: boolean; epoch: number; at: number }>();

/** `ETag` = l'empreinte servie ; `If-None-Match` qui la nomme → 304 sans octets ; sinon les octets en flux (blocs de 64 Kio). */
function respond(served: string, media: { bytes: Uint8Array; mime: string }, byIdentity: boolean, ifNoneMatch: string | null): Response {
  // Une empreinte servie telle quelle ne change jamais ; une identité d'image répond par la version de la génération servie : durée courte.
  const cache = byIdentity ? "public, max-age=3600" : "public, max-age=31536000, immutable";
  const etag = `"${served}"`;
  if (ifNoneMatch !== null && ifNoneMatch.split(",").some((tag) => tag.trim().replace(/^W\//, "") === etag || tag.trim() === "*")) {
    return new Response(null, { status: 304, headers: { etag, "cache-control": cache } });
  }
  const bytes = media.bytes;
  let offset = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.length) return controller.close();
      controller.enqueue(bytes.subarray(offset, offset + 65536));
      offset += 65536;
    },
  });
  return new Response(body, { headers: { "content-type": media.mime, "content-length": String(bytes.length), "cache-control": cache, etag } });
}
