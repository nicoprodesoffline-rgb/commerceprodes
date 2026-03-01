import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "lib/admin/auth";
import { checkFamiliesDb, degradedResponse } from "lib/admin/families-db";
import { supabaseServer } from "lib/supabase/client";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!checkAdminAuth(req)) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const db = await checkFamiliesDb();
  if (!db.available) return NextResponse.json(degradedResponse(db), { status: 503 });

  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "ID invalide" }, { status: 400 });

  let body: { member_id: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const memberId = body.member_id;
  if (!memberId || !UUID_RE.test(memberId)) {
    return NextResponse.json({ error: "member_id UUID requis" }, { status: 400 });
  }

  const client = supabaseServer();
  const { error } = await client
    .from("product_family_members")
    .update({ active: false })
    .eq("id", memberId)
    .eq("family_id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  console.log(JSON.stringify({ event: "admin.family.member.remove", family_id: id, member_id: memberId }));
  return NextResponse.json({ ok: true });
}
