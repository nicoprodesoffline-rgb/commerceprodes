import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "lib/admin/auth";
import { safeErrorMessage } from "lib/admin/security";
import { supabaseServer } from "lib/supabase/client";

const VALID_STATUSES = [
  "nouveau",
  "en_cours",
  "traite",
  "archive",
  "refuse",
  "pending",
  "contacted",
  "confirmed",
  "cancelled",
];

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!checkAdminAuth(req))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const { status } = await req.json();

  if (!status || !VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: "Statut invalide" }, { status: 400 });
  }

  const client = supabaseServer();
  const { error } = await client
    .from("devis_requests")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error)
    return NextResponse.json(
      { error: safeErrorMessage(error) },
      { status: 500 },
    );
  return NextResponse.json({ ok: true });
}
