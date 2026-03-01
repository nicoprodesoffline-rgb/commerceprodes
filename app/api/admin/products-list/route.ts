import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "lib/admin/auth";
import { sanitizeString, sanitizeNumber } from "lib/validation";

export async function GET(req: NextRequest) {
  if (!checkAdminAuth(req)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const { searchParams } = req.nextUrl;
  const page = Math.max(0, sanitizeNumber(Number(searchParams.get("page") ?? 0), 0, 1000));
  const search = sanitizeString(searchParams.get("search") ?? "", 200);
  const status = sanitizeString(searchParams.get("status") ?? "publish", 20);
  const sortParam = sanitizeString(searchParams.get("sort") ?? "created_at-desc", 50);
  const categoryId = sanitizeString(searchParams.get("categoryId") ?? "", 50);
  const minPrice = sanitizeNumber(Number(searchParams.get("minPrice") ?? 0), 0, 999999);
  const maxPriceRaw = searchParams.get("maxPrice");
  const maxPrice = maxPriceRaw == null || maxPriceRaw === ""
    ? null
    : sanitizeNumber(Number(maxPriceRaw), 0, 999999);
  const missingDesc = searchParams.get("missingDesc") === "true";
  const limitParam = sanitizeNumber(Number(searchParams.get("limit") ?? 0), 0, 1000);

  const PAGE_SIZE = limitParam > 0 ? Math.min(limitParam, 1000) : 50;

  const [sortFieldRaw, sortDir] = sortParam.split("-");
  const sortFieldCandidate = sortFieldRaw ?? "";
  const sortField = ["created_at", "regular_price", "name", "status"].includes(sortFieldCandidate)
    ? sortFieldCandidate
    : "created_at";
  const ascending = (sortDir ?? "") === "asc";

  try {
    const { supabaseServer } = await import("lib/supabase/client");
    const client = supabaseServer();

    let query = client
      .from("products")
      .select(
        `id, name, slug, sku, regular_price, status,
         short_description, seo_title, seo_description,
         product_images(url, is_featured, position),
         variants(id),
         product_categories(categories(name))`,
        { count: "exact" },
      )
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
      .order(sortField || "created_at", { ascending });

    if (status && status !== "all") {
      query = query.eq("status", status);
    }
    if (search) {
      query = query.or(`name.ilike.%${search}%,sku.ilike.%${search}%`);
    }
    if (categoryId) {
      const { data: catProducts } = await client
        .from("product_categories")
        .select("product_id")
        .eq("category_id", categoryId);
      const ids = (catProducts ?? []).map((cp: any) => cp.product_id);
      if (ids.length === 0) {
        return NextResponse.json({ products: [], total: 0 });
      }
      query = query.in("id", ids);
    }
    if (minPrice > 0) {
      query = query.gte("regular_price", minPrice);
    }
    if (maxPrice !== null) {
      query = query.lte("regular_price", maxPrice);
    }
    if (missingDesc) {
      query = query.or("short_description.is.null,short_description.eq.");
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
        name: p.name,
        title: p.name,
        slug: p.slug,
        handle: p.slug,
        sku: p.sku ?? null,
        regular_price: p.regular_price ?? null,
        status: p.status,
        featured_image_url: featured?.url ?? null,
        variant_count: (p.variants || []).length,
        categories: cats || null,
        short_description: p.short_description ?? null,
        seo_title: p.seo_title ?? null,
        seo_description: p.seo_description ?? null,
      };
    });

    return NextResponse.json({ products, total: count ?? 0 });
  } catch (err) {
    console.error("admin.products_list error", err);
    return NextResponse.json({ products: [], total: 0 });
  }
}
