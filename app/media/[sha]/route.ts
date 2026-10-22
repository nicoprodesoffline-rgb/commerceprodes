import { readFile } from "node:fs/promises";
import { getMediaFile } from "lib/site-dto";

// Lecture seule : sert les octets des médias de la fixture, indexés par SHA-256.
export async function GET(_req: Request, ctx: { params: Promise<{ sha: string }> }) {
  const { sha } = await ctx.params;
  const media = /^[0-9a-f]{64}$/.test(sha) ? getMediaFile(sha) : undefined;
  if (!media) return new Response("Not found", { status: 404 });
  const bytes = await readFile(media.file);
  return new Response(new Uint8Array(bytes), {
    headers: { "Content-Type": media.mime, "Cache-Control": "public, max-age=31536000, immutable" },
  });
}
