// Cercle 5 (5.21) — POST /api/site/commerce/activate : les réglages de vente `site_commerce.v1` par le canal signé (docs/site_commerce_v1.md §3). Corps borné à 64 Kio.
// Route machine : exclue du proxy navigateur (matcher de proxy.ts), comme /api/site/content/**. Requête signée avec la clé de publication, domaine propre à la route, anti-rejeu daté.
import { handleTransport } from "@/lib/site-publish/http";
import { activateCommerce, COMMERCE_REQUEST_DOMAIN } from "@/lib/site-commerce/route";
import { MAX_BYTES } from "@/lib/site-commerce/document";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return handleTransport("COMMERCE", request, MAX_BYTES, (deps, body) => activateCommerce(deps, body), { requestDomain: COMMERCE_REQUEST_DOMAIN });
}
