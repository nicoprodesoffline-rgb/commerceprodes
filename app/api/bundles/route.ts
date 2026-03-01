import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "lib/supabase/client";
import { sanitizeString } from "lib/validation";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface BundleItem {
  product_id: string;
  title: string;
  quantity: number;
  unit_price?: number | null;
  image_url?: string | null;
  handle?: string | null;
}

export interface Bundle {
  id: string;
  title: string;
  description: string | null;
  primary_product_id: string;
  items: BundleItem[];
  discount_type: "percent" | "fixed";
  discount_value: number;
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const productId = sanitizeString(searchParams.get("productId") ?? "", 100).trim();

  if (!productId || !UUID_RE.test(productId)) {
    return NextResponse.json({ bundles: [], error: "productId UUID invalide" }, { status: 400 });
  }

  const client = supabaseServer();

  try {
    const { data, error } = await client
      .from("bundles")
      .select("id, title, description, primary_product_id, items, discount_type, discount_value")
      .eq("primary_product_id", productId)
      .eq("active", true)
      .order("created_at", { ascending: false })
      .limit(5);

    if (error) {
      // Table doesn't exist yet or schema cache miss → degrade gracefully
      if (error.code === "42P01" || error.message?.includes("schema cache")) {
        return NextResponse.json({ bundles: [] });
      }
      return NextResponse.json({ bundles: [], error: error.message }, { status: 500 });
    }

    return NextResponse.json({ bundles: data ?? [] });
  } catch {
    return NextResponse.json({ bundles: [] });
  }
}
