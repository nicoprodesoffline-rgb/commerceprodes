// Cercle 4, 4.9 (S01, S02) — GET /api/site/health : public, ne dit que « en service » ou non. Le détail (commit, génération, base, disque, sauvegarde) n'est JAMAIS ici :
// il est rendu par la sonde signée (lib/site-health/detail.ts). Route hors proxy navigateur (matcher de proxy.ts) : elle répond même en maintenance.
import { getPool } from "@/lib/site-db/pool";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };

export async function GET(): Promise<Response> {
  try {
    await Promise.race([getPool().query("SELECT 1"), new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 2000).unref())]);
    return new Response('{"status":"ok"}', { status: 200, headers: HEADERS });
  } catch {
    return new Response('{"status":"unavailable"}', { status: 503, headers: HEADERS });
  }
}
