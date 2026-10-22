import { NextResponse } from "next/server";
import { SIMULATION_LABEL, validateLines } from "@/lib/simulator";
import { badJson, readJson } from "@/lib/simulator/http";

export const dynamic = "force-dynamic";

/**
 * Aperçu de panier : le serveur sélectionne rate_id et montant pour les lignes
 * du brouillon client (aucune écriture). Le client affiche CE résultat, puis
 * le renvoie tel quel au devis/à la commande, qui le revalide.
 */
export async function POST(req: Request) {
  const body = (await readJson(req)) as { lines?: unknown } | null;
  if (body === null) return badJson();
  const v = validateLines(body.lines, false);
  return NextResponse.json({ ...SIMULATION_LABEL, ...v }, { status: v.ok ? 200 : v.status });
}
