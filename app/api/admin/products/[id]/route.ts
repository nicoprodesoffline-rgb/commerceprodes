import { NextRequest, NextResponse } from "next/server";
import { logAdminAction } from "lib/admin/audit-log";
import { checkAdminAuth } from "lib/admin/auth";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!checkAdminAuth(req)) {
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
  if (!checkAdminAuth(req)) {
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

    // Snapshot current state before update (for versioning/rollback)
    let productId = id;
    if (!isUuid) {
      const { data: cur } = await client.from("products").select("id").eq("slug", id).single();
      if (cur?.id) productId = cur.id;
    }
    try {
      const { data: before } = await client
        .from("products")
        .select("id, name, sku, regular_price, status, short_description, description, eco_contribution, seo_title, seo_description, stock_status")
        .eq(isUuid ? "id" : "slug", id)
        .single();

      if (before) {
        const { data: lastV } = await client
          .from("product_versions")
          .select("version_num")
          .eq("product_id", before.id ?? productId)
          .order("version_num", { ascending: false })
          .limit(1)
          .single();

        await client.from("product_versions").insert({
          product_id: before.id ?? productId,
          version_num: (lastV?.version_num ?? 0) + 1,
          snapshot: before,
          changed_by: "admin",
          change_note: `Champs: ${Object.keys(updates).join(", ")}`,
        });
      }
    } catch {
      // Non-critical: version snapshot failure should not block the update
    }

    const { data, error } = await client
      .from("products")
      .update(updates)
      .eq(isUuid ? "id" : "slug", id)
      .select("id, name, sku, regular_price, status, short_description")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Async audit log (non-blocking)
    logAdminAction({
      action: "product.update",
      entity: "product",
      entity_id: data?.id ?? productId,
      payload_summary: `Champs mis à jour: ${Object.keys(updates).join(", ")}`,
      success: true,
    }).catch(() => {});

    console.log(JSON.stringify({ event: "admin.product.updated", id, fields: Object.keys(updates) }));
    return NextResponse.json({ success: true, product: data });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
