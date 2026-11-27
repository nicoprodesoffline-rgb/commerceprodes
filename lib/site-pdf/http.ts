import { clientAddress, createLimiter } from "../site-ratelimit/limiter";
import { filename, type PdfInput } from "./model";

/** 1 par défaut (décision d'EC du 27/11, relevé du serveur Next) ; réglable par PDF_MAX_PARALLEL (entier de 1 à 4). */
function configuredParallel(raw: string | undefined): number {
  const value = Number(raw);
  return Number.isInteger(value) && value >= 1 && value <= 4 ? value : 1;
}
export const MAX_PARALLEL = configuredParallel(process.env.PDF_MAX_PARALLEL);
interface PdfDeps {
  resolve(key: string): Promise<PdfInput | null>;
  purge?(): Promise<unknown>;
  document(input: PdfInput): Promise<Buffer>;
}

const message = (text: string, status: number, extra: Record<string, string> = {}) => new Response(text, {
  status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", ...extra },
});

/** Un seul handler par processus de route. Le compteur couvre aussi les lectures et les réponses conservées. */
export function createPdfHandler(deps: PdfDeps, maxParallel: number = MAX_PARALLEL): (req: Request, key: string) => Promise<Response> {
  let active = 0;
  const limiter = createLimiter({ limit: 60, windowMs: 60_000, maxKeys: 10_000 });
  return async (req, key) => {
    if (active >= maxParallel) return message("La fiche est momentanément indisponible. Réessayez dans quelques secondes.", 503, { "retry-after": "5" });
    const limit = limiter.take(clientAddress(req.headers), Date.now());
    if (!limit.ok) return message("Veuillez patienter avant de redemander une fiche.", 429, { "retry-after": String(limit.retryAfterSeconds) });
    active++;
    try {
      const input = await deps.resolve(key);
      try { await deps.purge?.(); }
      catch (error) {
        console.error("[site-pdf] PURGE_UNAVAILABLE");
        if (input) throw error; // Une fonction éteinte ou une famille inconnue garde sa réponse 404.
      }
      if (!input) return message("Fiche introuvable.", 404);
      const bytes = await deps.document(input);
      return new Response(new Uint8Array(bytes), {
        headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="${filename(input.name)}"`,
          "content-length": String(bytes.length), "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" },
      });
    } catch {
      console.error("[site-pdf] GENERATION_UNAVAILABLE");
      return message("La fiche est momentanément indisponible. Réessayez dans quelques secondes.", 503, { "retry-after": "5" });
    } finally { active--; }
  };
}
