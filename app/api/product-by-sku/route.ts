import { NextRequest, NextResponse } from "next/server";
import { supabase } from "lib/supabase/client";

export async function GET(req: NextRequest) {
  const sku = req.nextUrl.searchParams.get("sku")?.trim();
  if (!sku) {
    return NextResponse.json({ error: "SKU manquant" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("products")
    .select("id, name, slug, sku, regular_price, eco_participation, featured_image_url")
    .eq("sku", sku)
    .eq("status", "publish")
    .limit(1)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "SKU introuvable" }, { status: 404 });
  }

  return NextResponse.json({
    product: {
      id: (data as any).id,
      title: (data as any).name,
      handle: (data as any).slug,
      sku: (data as any).sku,
      regular_price: Number((data as any).regular_price) || 0,
      eco_participation: Number((data as any).eco_participation) || 0,
      featured_image_url: (data as any).featured_image_url,
    },
  });
}
