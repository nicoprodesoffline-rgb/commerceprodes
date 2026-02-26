import { NextRequest, NextResponse } from "next/server";
import { sanitizeString, sanitizeNumber } from "lib/validation";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const page = Math.max(0, sanitizeNumber(Number(searchParams.get("page") ?? 0), 0, 1000));
  const search = sanitizeString(searchParams.get("search") ?? "", 200);
  const status = sanitizeString(searchParams.get("status") ?? "publish", 20);
  const sortParam = sanitizeString(searchParams.get("sort") ?? "created_at-desc", 50);

  const PAGE_SIZE = 50;

  const [sortField, sortDir] = sortParam.split("-");
  const ascending = sortDir === "asc";

  try {
    const { supabaseServer } = await import("lib/supabase/client");
    const client = supabaseServer();

    let query = client
      .from("products")
      .select(
        `id, name, slug, sku, regular_price, status,
         product_images(url, is_featured, position),
         variants(id),
         product_categories(categories(name))`,
        { count: "exact" },
      )
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
      .order(sortField || "created_at", { ascending });

    if (status) {
      query = query.eq("status", status);
    }
    if (search) {
      query = query.or(`name.ilike.%${search}%,sku.ilike.%${search}%`);
    }

    const { data, count, error } = await query;
    if (error) throw error;

    const products = (data || []).map((p: any) => {
      const imgs: any[] = (p.product_images || []).sort(
        (a: any, b: any) => (a.position ?? 0) - (b.position ?? 0),
      );
      const featured = imgs.find((i: any) => i.is_featured) ?? imgs[0];
      const cats = (p.product_categories || [])
        .map((pc: any) => pc.categories?.name)
        .filter(Boolean)
        .join(", ");

      return {
        id: p.id,
        title: p.name,
        handle: p.slug,
        sku: p.sku ?? null,
        regular_price: p.regular_price ?? null,
        status: p.status,
        featured_image_url: featured?.url ?? null,
        variant_count: (p.variants || []).length,
        categories: cats || null,
      };
    });

    return NextResponse.json({ products, total: count ?? 0 });
  } catch (err) {
    console.error("admin.products_list error", err);
    return NextResponse.json({ products: [], total: 0 });
  }
}
