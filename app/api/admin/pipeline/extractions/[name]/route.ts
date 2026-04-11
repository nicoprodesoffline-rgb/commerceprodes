import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "lib/admin/auth";
import { RETAB_VALIDATED_DIR } from "lib/admin/retab-config";
import type { ExtractionPatch } from "lib/admin/pipeline-types";
import fs from "fs";
import path from "path";

function resolveFile(name: string): string | null {
  // Sanitize: only allow alphanumeric, dash, underscore, dot
  if (!/^[\w.\-]+$/.test(name)) return null;
  const filePath = path.join(RETAB_VALIDATED_DIR, name);
  if (!filePath.startsWith(RETAB_VALIDATED_DIR)) return null;
  if (!fs.existsSync(filePath)) return null;
  return filePath;
}

/**
 * GET /api/admin/pipeline/extractions/[name]
 * Charge le contenu complet d'une extraction validée.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  if (!checkAdminAuth(req))
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const { name } = await params;
  const filePath = resolveFile(name);
  if (!filePath)
    return NextResponse.json({ error: "Fichier introuvable" }, { status: 404 });

  try {
    const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/pipeline/extractions/[name]
 * Applique des corrections sur l'extraction validée.
 * Body: { patches: ExtractionPatch[] }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  if (!checkAdminAuth(req))
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const { name } = await params;
  const filePath = resolveFile(name);
  if (!filePath)
    return NextResponse.json({ error: "Fichier introuvable" }, { status: 404 });

  let body: { patches: ExtractionPatch[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  if (!Array.isArray(body.patches) || body.patches.length === 0) {
    return NextResponse.json(
      { error: "patches[] requis et non vide" },
      { status: 400 },
    );
  }

  try {
    const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    const familles: unknown[] = data?.result?.familles;
    if (!Array.isArray(familles)) {
      return NextResponse.json(
        { error: "Structure invalide: result.familles manquant" },
        { status: 400 },
      );
    }

    // Process patches in order (delete indices collected and applied last)
    const deletions: number[] = [];

    for (const patch of body.patches) {
      switch (patch.type) {
        case "edit_ligne": {
          const fam = familles[patch.famille_idx] as {
            lignes: Record<string, unknown>[];
          };
          const target = fam?.lignes?.[patch.ligne_idx];
          if (!target) continue;
          Object.assign(target, patch.fields);
          break;
        }
        case "move_ligne": {
          const fromFam = familles[patch.from_famille_idx] as {
            lignes: unknown[];
          };
          const toFam = familles[patch.to_famille_idx] as {
            lignes: unknown[];
          };
          if (!fromFam?.lignes?.[patch.ligne_idx] || !toFam?.lignes) continue;
          const [ligne] = fromFam.lignes.splice(patch.ligne_idx, 1);
          toFam.lignes.push(ligne);
          break;
        }
        case "edit_famille": {
          const fam = familles[patch.famille_idx] as Record<string, unknown>;
          if (!fam) continue;
          Object.assign(fam, patch.fields);
          break;
        }
        case "delete_famille": {
          deletions.push(patch.famille_idx);
          break;
        }
      }
    }

    // Apply deletions in reverse order
    for (const idx of deletions.sort((a, b) => b - a)) {
      familles.splice(idx, 1);
    }

    // Write back
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");

    const variantesCount = familles.reduce((acc: number, f: unknown) => {
      const fam = f as { lignes?: unknown[] };
      return acc + (fam.lignes?.filter((l) => l != null)?.length ?? 0);
    }, 0);

    return NextResponse.json({
      success: true,
      familles_count: familles.length,
      variantes_count: variantesCount,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
