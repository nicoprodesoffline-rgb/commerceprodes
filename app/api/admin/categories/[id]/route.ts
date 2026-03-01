import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "lib/admin/auth";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!checkAdminAuth(req)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (body.cover_image_url != null) {
    const v = typeof body.cover_image_url === "string" ? body.cover_image_url.trim().slice(0, 2000) : null;
    updates.cover_image_url = v || null;
  }
  if (body.name != null) {
    const v = typeof body.name === "string" ? body.name.trim().slice(0, 200) : "";
    if (!v) return NextResponse.json({ error: "name invalide" }, { status: 400 });
    updates.name = v;
  }
  if (body.seo_title != null) {
    updates.seo_title = typeof body.seo_title === "string" ? body.seo_title.trim().slice(0, 200) : null;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Aucun champ valide" }, { status: 400 });
  }

  try {
    const { supabaseServer } = await import("lib/supabase/client");
    const client = supabaseServer();

    const { data, error } = await client
      .from("categories")
      .update(updates)
      .eq("id", id)
      .select("id, name, slug, cover_image_url")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log(JSON.stringify({ event: "admin.category.update", id, fields: Object.keys(updates) }));
    return NextResponse.json({ success: true, category: data });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
