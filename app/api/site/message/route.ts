import { businessConfigError, closedRefusal, submitHttp, useBc4Persistence } from "@/lib/site-transactions/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cercle 5 (5.10) : la demande libre — formulaire « Nous écrire » et « Une question sur ce produit » (docs/site_events_v2.md). Même canal et même transaction que les devis ;
 * sans persistance durable, rien n'est reçu (aucun verdict A2 pour un message : il n'a ni prix ni génération).
 */
export async function POST(req: Request) {
  const closed = closedRefusal();
  if (closed) return closed;
  try {
    if (!useBc4Persistence()) {
      return new Response(JSON.stringify({ site_status: "ONLINE_REQUEST_CLOSED", message: "La demande en ligne n'est pas encore ouverte. Rien n'a été enregistré.", persistence: "NONE", durable: false, verdict: null }), { status: 503, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
    }
  } catch (error) {
    const r = businessConfigError(error, "/api/site/message");
    if (r) return r;
    throw error;
  }
  return submitHttp("message", req);
}
