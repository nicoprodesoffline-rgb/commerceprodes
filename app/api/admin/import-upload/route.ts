/**
 * POST /api/admin/import-upload
 * Uploade un fichier fournisseur vers Supabase Storage (bucket: imports)
 * et retourne l'URL publique ou signée.
 *
 * Body: multipart/form-data avec champ "file"
 * Returns: { url: string, path: string, size: number }
 *
 * Le bucket "imports" doit exister dans Supabase Storage.
 * Si indisponible, retourne une dégradation gracieuse (url: null, fallback: true).
 */
import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "lib/admin/auth";

const ALLOWED_EXTENSIONS = [".xlsx", ".xls", ".csv", ".ods"];
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
const BUCKET = "imports";

export async function POST(req: NextRequest) {
  if (!checkAdminAuth(req)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Requête multipart invalide" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Champ 'file' requis (multipart/form-data)" }, { status: 400 });
  }

  // Validate extension
  const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return NextResponse.json(
      { error: `Format non supporté. Formats acceptés: ${ALLOWED_EXTENSIONS.join(", ")}` },
      { status: 400 }
    );
  }

  // Validate size
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: `Fichier trop volumineux (max ${MAX_FILE_SIZE / 1024 / 1024} Mo)` },
      { status: 400 }
    );
  }

  // Build storage path: imports/YYYY-MM-DD/timestamp-filename.ext
  const date = new Date().toISOString().slice(0, 10);
  const ts = Date.now();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `${date}/${ts}-${safeName}`;

  try {
    const { supabaseServer } = await import("lib/supabase/client");
    const client = supabaseServer();

    const fileBuffer = await file.arrayBuffer();
    const fileBytes = new Uint8Array(fileBuffer);

    const { data, error } = await client.storage
      .from(BUCKET)
      .upload(storagePath, fileBytes, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });

    if (error) {
      // Graceful degradation — bucket may not exist yet in this env
      console.warn("[import-upload] Storage upload failed:", error.message);
      return NextResponse.json({
        url: null,
        path: null,
        size: file.size,
        fallback: true,
        reason: error.message,
      });
    }

    // Get public URL
    const { data: urlData } = client.storage.from(BUCKET).getPublicUrl(data.path);
    const url = urlData?.publicUrl ?? null;

    return NextResponse.json({
      url,
      path: data.path,
      size: file.size,
      fallback: false,
    });
  } catch (err) {
    console.warn("[import-upload] Unexpected error:", String(err));
    // Return graceful degradation — don't block the import flow
    return NextResponse.json({
      url: null,
      path: null,
      size: file.size,
      fallback: true,
      reason: String(err),
    });
  }
}
