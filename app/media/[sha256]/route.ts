import { readFileSync } from "node:fs";
import { getMedia } from "@/lib/site-dto";

/** Sert les octets d'un média de la fixture, adressé par son sha256. */
export async function GET(_req: Request, ctx: { params: Promise<{ sha256: string }> }) {
  const { sha256 } = await ctx.params;
  if (!/^[0-9a-f]{64}$/.test(sha256)) return new Response("Not found", { status: 404 });
  const m = getMedia(sha256);
  if (!m) return new Response("Not found", { status: 404 });
  return new Response(readFileSync(m.file), {
    headers: { "content-type": m.mime, "cache-control": "public, max-age=31536000, immutable" },
  });
}
