import { NextRequest, NextResponse } from "next/server";
import { supabase } from "lib/supabase/client";

export async function GET(req: NextRequest) {
  const sku = req.nextUrl.searchParams.get("sku")?.trim();
  if (!sku) {
    return NextResponse.json({ error: "SKU manquant" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("products")
    .select(
      "id, name, slug, sku, regular_price, eco_contribution, product_images (url, alt_text, is_featured, position)",
    )
    .eq("sku", sku)
    .eq("status", "publish")
    .limit(1)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "SKU introuvable" }, { status: 404 });
  }

  const d = data as any;
  const images: Array<{
    url: string;
    alt_text: string | null;
    is_featured: boolean;
    position: number;
  }> = Array.isArray(d.product_images) ? d.product_images : [];
  const featuredImage =
    images.find((img) => img.is_featured) ?? images[0] ?? null;

  return NextResponse.json({
    product: {
      id: d.id,
      title: d.name,
      handle: d.slug,
      sku: d.sku,
      regular_price: Number(d.regular_price) || 0,
      eco_contribution: Number(d.eco_contribution) || 0,
      featured_image_url: featuredImage?.url ?? null,
    },
  });
}
