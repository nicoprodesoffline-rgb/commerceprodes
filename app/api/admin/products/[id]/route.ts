import { NextRequest, NextResponse } from "next/server";

function checkAuth(req: NextRequest): boolean {
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace("Bearer ", "");
  return token === (process.env.ADMIN_PASSWORD ?? "");
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const { id } = await params;
  try {
    const { supabaseServer } = await import("lib/supabase/client");
    const client = supabaseServer();

    const { data, error } = await client
      .from("products")
      .select("id, name, slug, sku, status, short_description, description, regular_price, eco_participation, featured_image_url, seo_title, seo_description")
      .eq("id", id)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "Produit introuvable" }, { status: 404 });
    }

    return NextResponse.json({ product: data });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "ID manquant" }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const ALLOWED = ["name", "sku", "regular_price", "status", "short_description", "description", "featured_image_url", "seo_title", "seo_description"];
  const updates: Record<string, unknown> = {};
  for (const key of ALLOWED) {
    if (key in body) {
      updates[key] = body[key];
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Aucun champ à mettre à jour" }, { status: 400 });
  }

  try {
    const { supabaseServer } = await import("lib/supabase/client");
    const client = supabaseServer();

    const { data, error } = await client
      .from("products")
      .update(updates)
      .eq("id", id)
      .select("id, name, sku, regular_price, status, short_description, featured_image_url")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log(JSON.stringify({ event: "admin.product.updated", id, fields: Object.keys(updates) }));
    return NextResponse.json({ success: true, product: data });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
