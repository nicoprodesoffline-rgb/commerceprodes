import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "lib/admin/auth";
import {
  RETAB_DIR,
  RETAB_OUTPUTS_DIR,
  RETAB_PYTHON_BIN,
  RETAB_VALIDATED_DIR,
} from "lib/admin/retab-config";
import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";

const execFileAsync = promisify(execFile);

/**
 * POST /api/admin/pipeline/extractions/[name]/expand
 * Exécute expand.py sur l'extraction validée.
 * Body optionnel: { fournisseur?: string }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  if (!checkAdminAuth(req))
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const { name } = await params;
  if (!/^[\w.\-]+$/.test(name))
    return NextResponse.json({ error: "Nom invalide" }, { status: 400 });

  const inputPath = path.join(RETAB_VALIDATED_DIR, name);
  if (!inputPath.startsWith(RETAB_VALIDATED_DIR) || !fs.existsSync(inputPath))
    return NextResponse.json({ error: "Fichier introuvable" }, { status: 404 });

  // Derive fournisseur from filename or body
  let fournisseur: string | undefined;
  try {
    const body = await req.json().catch(() => ({}));
    fournisseur = (body as Record<string, string>).fournisseur;
  } catch {
    /* no body is ok */
  }

  if (!fournisseur) {
    fournisseur = name.split("_")[0] ?? "UNKNOWN";
  }

  try {
    const { stdout, stderr } = await execFileAsync(
      RETAB_PYTHON_BIN,
      [
        path.join(RETAB_DIR, "expand.py"),
        "--input",
        inputPath,
        "--fournisseur",
        fournisseur,
      ],
      { cwd: RETAB_DIR, timeout: 60_000 },
    );

    // Check if expanded file was created
    const baseName = name.replace(".json", "");
    const expandedPath = path.join(
      RETAB_OUTPUTS_DIR,
      baseName + "_expanded.json",
    );
    const expandedExists = fs.existsSync(expandedPath);

    return NextResponse.json({
      success: expandedExists,
      stdout: stdout.slice(0, 5000),
      stderr: stderr.slice(0, 2000),
      expanded_file: expandedExists ? baseName + "_expanded.json" : null,
    });
  } catch (err) {
    const error = err as { stdout?: string; stderr?: string; message: string };
    return NextResponse.json(
      {
        success: false,
        error: error.message,
        stdout: error.stdout?.slice(0, 5000),
        stderr: error.stderr?.slice(0, 2000),
      },
      { status: 500 },
    );
  }
}
