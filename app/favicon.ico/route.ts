/**
 * `/favicon.ico` → 204 sans contenu (revue BC3 F-08) : supprime la 404 répétée en console sans inventer d'icône
 * (DA-03 : aucune identité de marque non qualifiée, ni pseudo-logo).
 */
export const dynamic = "force-dynamic"; // « force-static » re-sérialise la réponse : 204 refusé par Next au build

export function GET() {
  return new Response(null, { status: 204, headers: { "cache-control": "public, max-age=86400" } });
}
