import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "lib/admin/auth";
import { sanitizeString, sanitizeNumber } from "lib/validation";

const SORT_WHITELIST = new Set(["created_at", "regular_price", "name", "updated_at"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizeSku(value: unknown): string {
  return String(value ?? "").trim().toUpperCase();
}

function isMeaningfulVariantRow(productSku: string, variant: any): boolean {
  const attrCount = Array.isArray(variant?.variant_attributes)
    ? variant.variant_attributes.length
    : 0;
  if (attrCount > 0) return true;

  const variantSku = normalizeSku(variant?.sku);
  if (!variantSku || !productSku) return true;

  // Ignore legacy "self variant" rows (same SKU, no attrs) to keep simple products simple.
  return variantSku !== productSku;
}

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
  const withVariantsOnly = searchParams.get("withVariants") === "true";

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
        `id, name, slug, type, sku, parent_sku, family_role, parent_family_id, tags,
         regular_price, sale_price, sale_price_start, sale_price_end,
         stock_quantity, stock_status, manage_stock, low_stock_threshold,
         tax_status, tax_class, supplier_ref, supplier_code, supplier_price,
         eco_contribution, weight, length, width, height,
         backorders_allowed, sold_individually,
         pbq_enabled, pbq_pricing_type, pbq_min_quantity, pbq_max_quantity,
         status, short_description, seo_title, seo_description, updated_at,
         product_images(url, is_featured, position),
         variants(id, sku, variant_attributes(attribute_id)),
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

    const rawProducts = (data || []).map((p: any) => {
      const imgs: any[] = (p.product_images || []).sort(
        (a: any, b: any) => (a.position ?? 0) - (b.position ?? 0),
      );
      const featured = imgs.find((i: any) => i.is_featured) ?? imgs[0];
      const cats = (p.product_categories || [])
        .map((pc: any) => pc.categories?.name)
        .filter(Boolean)
        .join(", ");

      const productSku = normalizeSku(p.sku);
      const meaningfulVariants = (p.variants || []).filter((variant: any) =>
        isMeaningfulVariantRow(productSku, variant),
      );

      return {
        id: p.id,
        title: p.name,
        name: p.name,
        handle: p.slug,
        slug: p.slug,
        type: p.type ?? null,
        sku: p.sku ?? null,
        parent_sku: p.parent_sku ?? null,
        family_role: p.family_role ?? null,
        parent_family_id: p.parent_family_id ?? null,
        tags: Array.isArray(p.tags) ? p.tags : [],
        regular_price: p.regular_price ?? null,
        sale_price: p.sale_price ?? null,
        sale_price_start: p.sale_price_start ?? null,
        sale_price_end: p.sale_price_end ?? null,
        stock_quantity: p.stock_quantity ?? null,
        stock_status: p.stock_status ?? null,
        manage_stock: p.manage_stock ?? null,
        low_stock_threshold: p.low_stock_threshold ?? null,
        tax_status: p.tax_status ?? null,
        tax_class: p.tax_class ?? null,
        supplier_ref: p.supplier_ref ?? null,
        supplier_code: p.supplier_code ?? null,
        supplier_price: p.supplier_price ?? null,
        eco_contribution: p.eco_contribution ?? null,
        weight: p.weight ?? null,
        length: p.length ?? null,
        width: p.width ?? null,
        height: p.height ?? null,
        backorders_allowed: p.backorders_allowed ?? null,
        sold_individually: p.sold_individually ?? null,
        pbq_enabled: p.pbq_enabled ?? null,
        pbq_pricing_type: p.pbq_pricing_type ?? null,
        pbq_min_quantity: p.pbq_min_quantity ?? null,
        pbq_max_quantity: p.pbq_max_quantity ?? null,
        status: p.status,
        short_description: p.short_description ?? null,
        seo_title: p.seo_title ?? null,
        seo_description: p.seo_description ?? null,
        updated_at: p.updated_at ?? null,
        featured_image_url: featured?.url ?? null,
        variant_count: meaningfulVariants.length,
        categories: cats || null,
      };
    });

    let products = rawProducts;
    if (withVariantsOnly) {
      products = products.filter((p: any) => Number(p.variant_count ?? 0) > 0);
    }

    // Family metadata enrichment (safe fallback if migration 016 isn't available).
    const productIds = products.map((p: any) => p.id).filter((id: string) => UUID_RE.test(id));
    const familyMetaByParent = new Map<
      string,
      { family_id: string; family_name: string; family_children_count: number; family_strategy: string | null }
    >();

    if (productIds.length > 0) {
      const { data: familyRows, error: familyErr } = await client
        .from("product_families")
        .select("id, name, strategy, parent_product_id, product_family_members(id, active)")
        .in("parent_product_id", productIds)
        .eq("active", true);

      if (!familyErr) {
        for (const fam of familyRows ?? []) {
          const activeMembers = ((fam as any).product_family_members ?? []).filter((m: any) => m.active).length;
          familyMetaByParent.set((fam as any).parent_product_id, {
            family_id: (fam as any).id,
            family_name: (fam as any).name ?? "",
            family_children_count: activeMembers,
            family_strategy: (fam as any).strategy ?? null,
          });
        }
      }
    }

    const enriched = products.map((p: any) => {
      const fam = familyMetaByParent.get(p.id);
      const hasVariants = Number(p.variant_count ?? 0) > 0;
      return {
        ...p,
        has_variants: hasVariants,
        family_id: fam?.family_id ?? null,
        family_name: fam?.family_name ?? null,
        family_children_count: fam?.family_children_count ?? 0,
        family_strategy: fam?.family_strategy ?? null,
        is_family_parent: Boolean(fam),
        can_expand: hasVariants || Boolean(fam),
      };
    });

    return NextResponse.json({ products: enriched, total: count ?? 0 });
  } catch (err) {
    console.error("admin.products_list error", err);
    return NextResponse.json({ products: [], total: 0 });
  }
}
