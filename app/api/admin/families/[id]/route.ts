import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "lib/admin/auth";
import { checkFamiliesDb, degradedResponse } from "lib/admin/families-db";
import { supabaseServer } from "lib/supabase/client";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!checkAdminAuth(req)) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const db = await checkFamiliesDb();
  if (!db.available) return NextResponse.json(degradedResponse(db), { status: 503 });

  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "ID invalide" }, { status: 400 });

  const client = supabaseServer();
  const { data, error } = await client
    .from("product_families")
    .select(`
      *,
      products!product_families_parent_product_id_fkey (id, name, slug, sku, status, regular_price),
      product_family_members (
        id, member_type, position, active, axes_summary,
        member_product_id, member_variant_id,
        products (id, name, slug, sku, status, regular_price),
        variants (id, name, sku, stock_status, regular_price)
      )
    `)
    .eq("id", id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: error.code === "PGRST116" ? 404 : 500 });
  return NextResponse.json({ family: data });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!checkAdminAuth(req)) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const db = await checkFamiliesDb();
  if (!db.available) return NextResponse.json(degradedResponse(db), { status: 503 });

  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "ID invalide" }, { status: 400 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (body.name != null) updates.name = String(body.name).trim().slice(0, 200);
  if (body.active != null) updates.active = Boolean(body.active);
  if (body.strategy != null) {
    const s = String(body.strategy);
    if (!["parent_sku", "sku_root", "title_root", "manual"].includes(s)) {
      return NextResponse.json({ error: "strategy invalide" }, { status: 400 });
    }
    updates.strategy = s;
  }

  if (Object.keys(updates).length === 0) return NextResponse.json({ error: "Aucun champ" }, { status: 400 });

  const client = supabaseServer();
  const { data, error } = await client.from("product_families").update(updates).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  console.log(JSON.stringify({ event: "admin.family.update", id, fields: Object.keys(updates) }));
  return NextResponse.json({ family: data });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!checkAdminAuth(req)) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const db = await checkFamiliesDb();
  if (!db.available) return NextResponse.json(degradedResponse(db), { status: 503 });

  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "ID invalide" }, { status: 400 });

  const client = supabaseServer();
  const { error } = await client.from("product_families").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  console.log(JSON.stringify({ event: "admin.family.delete", id }));
  return NextResponse.json({ ok: true });
}
