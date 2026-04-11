import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "lib/admin/auth";
import { checkFamiliesDb, degradedResponse } from "lib/admin/families-db";
import { log } from "lib/logger";
import { supabaseServer } from "lib/supabase/client";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!checkAdminAuth(req))
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const db = await checkFamiliesDb();
  if (!db.available)
    return NextResponse.json(degradedResponse(db), { status: 503 });

  const { id } = await params;
  if (!UUID_RE.test(id))
    return NextResponse.json({ error: "ID invalide" }, { status: 400 });

  let body: { ordered_ids: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const ordered = (body.ordered_ids ?? []).filter(
    (x) => typeof x === "string" && UUID_RE.test(x),
  );
  if (ordered.length === 0)
    return NextResponse.json({ error: "ordered_ids requis" }, { status: 400 });

  const client = supabaseServer();
  for (let i = 0; i < ordered.length; i++) {
    await client
      .from("product_family_members")
      .update({ position: i })
      .eq("id", ordered[i])
      .eq("family_id", id);
  }

  log("info", "admin.family.members.reorder", {
    family_id: id,
    count: ordered.length,
  });
  return NextResponse.json({ ok: true });
}
