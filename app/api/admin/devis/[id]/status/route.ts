import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "lib/supabase/client";
import { timingSafeEqual } from "crypto";

function checkAuth(req: NextRequest): boolean {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace("Bearer ", "");
  const expected = process.env.ADMIN_PASSWORD ?? "";
  if (!token || !expected || token.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  } catch {
    return false;
  }
}

const VALID_STATUSES = ["nouveau", "en_cours", "traite", "archive", "refuse", "pending", "contacted", "confirmed", "cancelled"];

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!checkAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
