import { getCatalogSource, CatalogUnavailable } from "@/lib/site-catalog/source";

export const dynamic = "force-dynamic";

/** Sert les octets d'un média déclaré par la génération servie, adressé par son SHA-256 (C0 §8.5). */
export async function GET(_req: Request, ctx: { params: Promise<{ sha256: string }> }) {
  const { sha256 } = await ctx.params;
  if (!/^[0-9a-f]{64}$/.test(sha256)) return new Response("Not found", { status: 404 });
  let media;
  try {
    media = await (await getCatalogSource()).getMedia(sha256);
  } catch (error) {
    if (error instanceof CatalogUnavailable) return new Response("Catalogue indisponible", { status: 503 });
    throw error;
  }
  if (!media) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(media.bytes), {
    headers: {
      "content-type": media.mime,
      "content-length": String(media.bytes.length),
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}
