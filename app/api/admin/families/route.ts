import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "lib/admin/auth";
import { checkFamiliesDb, degradedResponse } from "lib/admin/families-db";
import { supabaseServer } from "lib/supabase/client";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  if (!checkAdminAuth(req)) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const db = await checkFamiliesDb();
  if (!db.available) return NextResponse.json(degradedResponse(db), { status: 503 });

  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1"));
  const limit = Math.min(100, parseInt(url.searchParams.get("limit") ?? "50"));
  const search = url.searchParams.get("q")?.trim().slice(0, 200) ?? "";
  const activeOnly = url.searchParams.get("active") !== "false";

  const client = supabaseServer();
  let query = client
    .from("product_families")
    .select(`
      id, name, slug, strategy, active, published_at, created_at, updated_at,
      parent_product_id,
      products!product_families_parent_product_id_fkey (id, name, slug, sku, status),
      product_family_members (
        id, member_product_id, member_variant_id, member_type, position, active, axes_summary,
        products!product_family_members_member_product_id_fkey (id, name, slug, sku, status),
        variants!product_family_members_member_variant_id_fkey (id, name, sku, stock_status, regular_price)
      )
    `, { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * limit, page * limit - 1);

  if (activeOnly) query = query.eq("active", true);
  if (search) query = query.ilike("name", `%${search}%`);

  const { data, count, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    families: data ?? [],
    total: count ?? 0,
    page,
    limit,
  });
}

export async function POST(req: NextRequest) {
  if (!checkAdminAuth(req)) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const db = await checkFamiliesDb();
  if (!db.available) return NextResponse.json(degradedResponse(db), { status: 503 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const parent_product_id = body.parent_product_id;
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 200) : "";
  const strategy = typeof body.strategy === "string" ? body.strategy : "manual";

  if (!parent_product_id || typeof parent_product_id !== "string" || !UUID_RE.test(parent_product_id)) {
    return NextResponse.json({ error: "parent_product_id UUID requis" }, { status: 400 });
  }
  if (!name) return NextResponse.json({ error: "name requis" }, { status: 400 });

  const validStrategies = ["parent_sku", "sku_root", "title_root", "manual"];
  if (!validStrategies.includes(strategy)) {
    return NextResponse.json({ error: "strategy invalide" }, { status: 400 });
  }

  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + "-" + Date.now();
  const client = supabaseServer();

  const { data, error } = await client
    .from("product_families")
    .insert({ parent_product_id, name, slug, strategy, active: true, published_at: new Date().toISOString() })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  console.log(JSON.stringify({ event: "admin.family.create", id: data.id, name }));
  return NextResponse.json({ family: data }, { status: 201 });
}
