import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "lib/admin/auth";
import { sanitizeString, sanitizeNumber } from "lib/validation";

const SORT_WHITELIST = new Set(["created_at", "regular_price", "name", "updated_at"]);

export async function GET(req: NextRequest) {
  if (!checkAdminAuth(req)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const { searchParams } = req.nextUrl;
  const page = Math.max(0, sanitizeNumber(Number(searchParams.get("page") ?? 0), 0, 1000));
  const search = sanitizeString(searchParams.get("search") ?? "", 200);
  const status = sanitizeString(searchParams.get("status") ?? "publish", 20);
  const sortParam = sanitizeString(searchParams.get("sort") ?? "created_at-desc", 50);
  const limitParam = sanitizeNumber(Number(searchParams.get("limit") ?? 0), 0, 1000);
  const categoryId = sanitizeString(searchParams.get("categoryId") ?? "", 64);
  const minPrice = sanitizeNumber(Number(searchParams.get("minPrice") ?? ""), 0, 10_000_000);
  const maxPrice = sanitizeNumber(Number(searchParams.get("maxPrice") ?? ""), 0, 10_000_000);
  const hasMinPrice = searchParams.get("minPrice") !== null && searchParams.get("minPrice") !== "";
  const hasMaxPrice = searchParams.get("maxPrice") !== null && searchParams.get("maxPrice") !== "";
  const missingDescOnly = searchParams.get("missingDesc") === "true";

  const PAGE_SIZE = limitParam > 0 ? Math.min(limitParam, 1000) : 50;

  const [requestedSortField, sortDir] = sortParam.split("-");
  const sortField = SORT_WHITELIST.has(requestedSortField ?? "") ? requestedSortField! : "created_at";
  const ascending = sortDir === "asc";

  try {
    const { supabaseServer } = await import("lib/supabase/client");
    const client = supabaseServer();

    let query = client
      .from("products")
      .select(
        `id, name, slug, sku, parent_sku, regular_price, status, short_description, seo_title, seo_description,
         product_images(url, is_featured, position),
         variants(id),
         product_categories(category_id, categories(name))`,
        { count: "exact" },
      )
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
      .order(sortField, { ascending });

    if (status && status !== "all") {
      query = query.eq("status", status);
    }
    if (search) {
      query = query.or(`name.ilike.%${search}%,sku.ilike.%${search}%`);
    }
    if (categoryId) {
      query = query.eq("product_categories.category_id", categoryId);
    }
    if (hasMinPrice) {
      query = query.gte("regular_price", minPrice);
    }
    if (hasMaxPrice) {
      query = query.lte("regular_price", maxPrice);
    }
    if (missingDescOnly) {
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
        title: p.name,
        name: p.name,
        handle: p.slug,
        slug: p.slug,
        sku: p.sku ?? null,
        parent_sku: p.parent_sku ?? null,
        regular_price: p.regular_price ?? null,
        status: p.status,
        short_description: p.short_description ?? null,
        seo_title: p.seo_title ?? null,
        seo_description: p.seo_description ?? null,
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
