import { NextRequest, NextResponse } from "next/server";
import { supabase } from "lib/supabase/client";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const handlesParam = searchParams.get("handles") ?? "";
  const handles = handlesParam
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean)
    .slice(0, 20);

  if (handles.length === 0) {
    return NextResponse.json({ products: [] });
  }

  const { data, error } = await supabase
    .from("products")
    .select(
      "id, name, slug, sku, regular_price, product_images (url, alt_text, is_featured, position)",
    )
    .in("slug", handles)
    .eq("status", "publish");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const products = (data ?? []).map((p: any) => {
    const images: Array<{
      url: string;
      alt_text: string | null;
      is_featured: boolean;
      position: number;
    }> = Array.isArray(p.product_images) ? p.product_images : [];
    const featuredImage =
      images.find((img) => img.is_featured) ?? images[0] ?? null;
    return {
      id: p.id,
      handle: p.slug,
      title: p.name,
      sku: p.sku,
      regular_price: Number(p.regular_price) || 0,
      featured_image_url: featuredImage?.url ?? null,
    };
  });

  // Preserve input order
  const orderedProducts = handles
    .map((h) => products.find((p) => p.handle === h))
    .filter(Boolean);

  return NextResponse.json({ products: orderedProducts });
}
