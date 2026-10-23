/**
 * Glue HTTP des routes `site_business.v1` : lecture bornée des octets bruts, chargement de la
 * génération servie, instant serveur. La décision appartient à `validate.ts` (fonctions C0).
 */
import { NextResponse } from "next/server";
import { loadCatalog, type Catalog } from "@/lib/site-catalog/catalog";
import { serverNowUtc } from "@/lib/site-catalog/clock";
import { CatalogUnavailable } from "@/lib/site-catalog/source";
import { BUSINESS_MAX_BYTES, PERSISTENCE } from "./validate";

/** Lit au plus `max + 1` octets : au-delà, C0 `parseBytes` refuse (`PAYLOAD_MALFORMED`, taille). */
export async function readBoundedBytes(req: Request, max = BUSINESS_MAX_BYTES): Promise<Uint8Array> {
  if (!req.body) return new Uint8Array(0);
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size <= max) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.length;
  }
  if (size > max) await reader.cancel();
  const out = new Uint8Array(Math.min(size, max + 1));
  let offset = 0;
  for (const chunk of chunks) {
    const part = chunk.subarray(0, Math.max(0, out.length - offset));
    out.set(part, offset);
    offset += part.length;
    if (offset >= out.length) break;
  }
  return out;
}

export type BusinessContext = { catalog: Catalog; nowUtc: string; bytes: Uint8Array };

/** Exécute `fn` ou répond 503 honnête si aucune génération n'est servable (aucun verdict C0 inventé). */
export async function withCatalog(
  req: Request,
  fn: (ctx: BusinessContext) => { status: number; body: unknown },
): Promise<Response> {
  let catalog: Catalog;
  try {
    catalog = await loadCatalog();
  } catch (error) {
    if (error instanceof CatalogUnavailable) {
      console.error(`[site-catalog] indisponible : ${error.reason} — ${error.message}`);
      return NextResponse.json(
        { site_status: "CATALOG_UNAVAILABLE", reason: error.reason, persistence: PERSISTENCE, durable: false, verdict: null },
        { status: 503 },
      );
    }
    throw error;
  }
  const bytes = await readBoundedBytes(req);
  const r = fn({ catalog, nowUtc: serverNowUtc(), bytes });
  return NextResponse.json(r.body, { status: r.status, headers: { "cache-control": "no-store" } });
}
