import { NextRequest, NextResponse } from "next/server";
import { sanitizeString, sanitizeNumber } from "lib/validation";
import { log } from "lib/logger";

function checkAuth(req: NextRequest): boolean {
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace("Bearer ", "");
  return token === (process.env.ADMIN_PASSWORD ?? "");
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide" }, { status: 400 });
  }

  const data = body as Record<string, unknown>;
  const categorySlug = sanitizeString(String(data.categorySlug ?? ""), 100);
  const percentage = sanitizeNumber(Number(data.percentage ?? 0), -50, 100);

  if (!categorySlug) {
    return NextResponse.json({ error: "Catégorie requise" }, { status: 400 });
  }

  try {
    const { supabaseServer } = await import("lib/supabase/client");
    const client = supabaseServer();

    // Get category
    const { data: cat } = await client
      .from("categories")
      .select("id, name")
      .eq("slug", categorySlug)
      .single();

    if (!cat) {
      return NextResponse.json({ error: "Catégorie introuvable" }, { status: 404 });
    }

    // Get products in category
    const { data: catProducts } = await client
      .from("product_categories")
      .select("product_id")
      .eq("category_id", cat.id);

    if (!catProducts || catProducts.length === 0) {
      return NextResponse.json({ updated: 0, products: [] });
    }

    const productIds = catProducts.map((cp: any) => cp.product_id);

    const { data: products } = await client
      .from("products")
      .select("id, name, regular_price")
      .in("id", productIds)
      .gt("regular_price", 0)
      .eq("status", "publish");

    if (!products || products.length === 0) {
      return NextResponse.json({ updated: 0, products: [] });
    }

    const updates: Array<{ id: string; title: string; oldPrice: number; newPrice: number }> = [];

    for (const p of products) {
      const oldPrice = Number(p.regular_price);
      const newPrice = Math.round(oldPrice * (1 + percentage / 100) * 100) / 100;

      await client
        .from("products")
        .update({ regular_price: newPrice })
        .eq("id", p.id);

      updates.push({ id: p.id, title: p.name as string, oldPrice, newPrice });
    }

    log("info", "admin.bulk_price_update", {
      category: categorySlug,
      percentage,
      count: updates.length,
    });

    return NextResponse.json({ updated: updates.length, products: updates });
  } catch (err) {
    console.error("ia.bulk_price_update error", err);
    return NextResponse.json({ error: "Erreur mise à jour" }, { status: 500 });
  }
}
