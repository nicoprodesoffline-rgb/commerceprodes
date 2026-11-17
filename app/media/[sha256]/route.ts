import { serveMedia } from "@/lib/site-catalog/media-serve";

export const dynamic = "force-dynamic";

/** Sert les octets d'un média déclaré par la génération servie, adressé par son SHA-256 (C0 §8.5). `?w=` demande une largeur (3.3). */
export async function GET(req: Request, ctx: { params: Promise<{ sha256: string }> }) {
  const { sha256 } = await ctx.params;
  return serveMedia(sha256, new URL(req.url).searchParams.get("w"));
}
