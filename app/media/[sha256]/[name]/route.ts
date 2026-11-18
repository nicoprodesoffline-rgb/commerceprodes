import { serveMedia } from "@/lib/site-catalog/media-serve";
import { readableNameOk } from "@/lib/site-catalog/media-view";

export const dynamic = "force-dynamic";

/** `/media/<empreinte>/<nom-lisible>.webp` (3.4, I14) : le nom ne sert qu'à lire l'adresse, un autre nom de la même forme sert la même image. */
export async function GET(req: Request, ctx: { params: Promise<{ sha256: string; name: string }> }) {
  const { sha256, name } = await ctx.params;
  if (!readableNameOk(name)) return new Response("Not found", { status: 404 });
  return serveMedia(sha256, new URL(req.url).searchParams.get("w"), req.headers.get("if-none-match"));
}
