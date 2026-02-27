import { NextRequest, NextResponse } from "next/server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function checkAuth(req: NextRequest): boolean {
  // Bearer token (admin catalogue / produits pages)
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace("Bearer ", "");
  if (token && token === (process.env.ADMIN_PASSWORD ?? "")) return true;
  // Cookie session (admin products [handle] editor)
  const session = req.cookies.get("admin_session")?.value;
  return !!session;
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

    const query = client
      .from("products")
      .select("id, name, slug, sku, status, short_description, description, regular_price, eco_contribution, seo_title, seo_description, product_images(url, is_featured, position)");

    const { data, error } = UUID_RE.test(id)
      ? await query.eq("id", id).single()
      : await query.eq("slug", id).single();

    if (error || !data) {
      return NextResponse.json({ error: "Produit introuvable" }, { status: 404 });
    }

    const imgs: any[] = ((data as any).product_images ?? []).sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0));
    const featured = imgs.find((i: any) => i.is_featured) ?? imgs[0];
    const product = { ...(data as any), featured_image_url: featured?.url ?? null };
    delete product.product_images;
    return NextResponse.json({ product });
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

  const ALLOWED = ["name", "sku", "regular_price", "status", "short_description", "description", "eco_contribution", "seo_title", "seo_description"];
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

    const isUuid = UUID_RE.test(id);
    const { data, error } = await client
      .from("products")
      .update(updates)
      .eq(isUuid ? "id" : "slug", id)
      .select("id, name, sku, regular_price, status, short_description")
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
