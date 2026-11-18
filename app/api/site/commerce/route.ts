// Cercle 5 — GET /api/site/commerce : les réglages de vente lisibles par le navigateur (taux, livraison sur rendez-vous, marches à suivre, mention, version des CGV, séquence).
// Sans réglages reçus : { ready: false } et le site dit « la boutique n'est pas prête ». Jamais mis en cache : la séquence change quand la boutique change.
import { getPool } from "@/lib/site-db/pool";
import { readActiveCommerce } from "@/lib/site-commerce/store";
import { NOT_READY, publicCommerce } from "@/lib/site-commerce/public";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  let body = NOT_READY as ReturnType<typeof publicCommerce>;
  try {
    const stored = await readActiveCommerce(getPool());
    body = publicCommerce(stored === null ? null : stored.document);
  } catch {
    body = NOT_READY;   // base absente ou configuration invalide : rien n'est deviné
  }
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
