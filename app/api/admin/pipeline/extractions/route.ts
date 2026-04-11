import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "lib/admin/auth";
import { RETAB_OUTPUTS_DIR, RETAB_VALIDATED_DIR } from "lib/admin/retab-config";
import fs from "fs";
import path from "path";

/**
 * GET /api/admin/pipeline/extractions
 * Liste les extractions validées disponibles.
 */
export async function GET(req: NextRequest) {
  if (!checkAdminAuth(req))
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  try {
    if (!fs.existsSync(RETAB_VALIDATED_DIR)) {
      return NextResponse.json({ extractions: [] });
    }

    const files = fs
      .readdirSync(RETAB_VALIDATED_DIR)
      .filter((f) => f.endsWith(".json") && f.includes(".validated."));

    const extractions = files.map((filename) => {
      const raw = JSON.parse(
        fs.readFileSync(path.join(RETAB_VALIDATED_DIR, filename), "utf-8"),
      );
      const familles = raw?.result?.familles ?? [];
      const variantesCount = familles.reduce(
        (acc: number, f: { lignes?: unknown[] }) =>
          acc + (f.lignes?.filter((l: unknown) => l != null)?.length ?? 0),
        0,
      );

      // Detect pipeline stage
      const baseName = filename.replace(".json", "");
      const expandedExists = fs.existsSync(
        path.join(RETAB_OUTPUTS_DIR, baseName + "_expanded.json"),
      );
      const puidExists = fs.existsSync(
        path.join(RETAB_OUTPUTS_DIR, baseName + "_expanded_puid.json"),
      );
      let stage: string = "extraction";
      if (puidExists) stage = "puid";
      else if (expandedExists) stage = "expanded";

      // Extract fournisseur from filename (first segment before _)
      const fournisseur =
        filename.split("_")[0] ?? raw?.meta?.fournisseur ?? "Inconnu";

      // Extract date from validated pattern
      const dateMatch = filename.match(/\.(\d{4}-\d{2}-\d{2})\./);
      const date =
        dateMatch?.[1] ?? raw?.meta?.generated_at?.slice(0, 10) ?? "";

      return {
        name: filename,
        fournisseur,
        date,
        familles_count: familles.length,
        variantes_count: variantesCount,
        stage,
      };
    });

    return NextResponse.json({ extractions });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
