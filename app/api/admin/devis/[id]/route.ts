import { NextRequest, NextResponse } from "next/server";

export async function PATCH(
  req: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  // Auth check
  const session = req.cookies.get("admin_session")?.value;
  if (!session) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const { id } = await props.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const { status, notes_internes } = body as Record<string, unknown>;

  const VALID_STATUSES = ["nouveau", "en_cours", "traite", "archive", "refuse"];
  if (status !== undefined) {
    if (typeof status !== "string" || !VALID_STATUSES.includes(status)) {
      return NextResponse.json({ error: "Statut invalide" }, { status: 400 });
    }
  }
  if (notes_internes !== undefined && typeof notes_internes !== "string") {
    return NextResponse.json({ error: "Notes invalides" }, { status: 400 });
  }

  try {
    const { updateDevisStatus } = await import("lib/supabase/index");
    const ok = await updateDevisStatus(
      id,
      status as string,
      notes_internes as string | undefined,
    );
    if (!ok) {
      return NextResponse.json({ error: "Mise à jour échouée" }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[ADMIN DEVIS] PATCH error:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
