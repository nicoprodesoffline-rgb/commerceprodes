import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "lib/admin/auth";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const STOCK_STATUS_VALUES = new Set(["instock", "outofstock", "onbackorder"]);
const TAX_STATUS_VALUES = new Set(["taxable", "shipping", "none"]);
const STATUS_VALUES = new Set(["publish", "draft", "private"]);
const TYPE_VALUES = new Set(["simple", "variable", "external", "grouped"]);
const FAMILY_ROLE_VALUES = new Set(["parent", "child", "standalone"]);
const PBQ_PRICING_VALUES = new Set(["fixed", "percentage", "fixed_amount", "fixed_percent"]);

function parseNullableText(v: unknown, max = 500): string | null | undefined {
  if (v === null) return null;
  if (typeof v !== "string") return undefined;
  const s = v.trim().slice(0, max);
  return s === "" ? null : s;
}

function parseRequiredText(v: unknown, max = 500): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim().slice(0, max);
  return s.length > 0 ? s : undefined;
}

function parseNullableNumber(v: unknown): number | null | undefined {
  if (v === null || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return undefined;
  return n;
}

function parseNullableInt(v: unknown): number | null | undefined {
  const n = parseNullableNumber(v);
  if (n === undefined || n === null) return n;
  return Math.round(n);
}

function parseBoolean(v: unknown): boolean | undefined {
  if (typeof v === "boolean") return v;
  if (v === "true") return true;
  if (v === "false") return false;
  return undefined;
}

function parseNullableIsoDate(v: unknown): string | null | undefined {
  if (v === null || v === "") return null;
  if (typeof v !== "string") return undefined;
  const dt = new Date(v);
  if (Number.isNaN(dt.getTime())) return undefined;
  return dt.toISOString();
}

function parseTags(v: unknown): string[] | undefined {
  if (v === null) return [];
  if (Array.isArray(v)) {
    return v
      .map((item) => String(item).trim())
      .filter(Boolean)
      .slice(0, 100);
  }
  if (typeof v === "string") {
    return v
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 100);
  }
  return undefined;
}

function parseDefaultAttributes(v: unknown): Record<string, string> | undefined {
  if (v === null) return {};
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
      const out: Record<string, string> = {};
      for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
        if (!key || typeof value !== "string") continue;
        out[key.trim().slice(0, 100)] = value.trim().slice(0, 200);
      }
      return out;
    } catch {
      return undefined;
    }
  }
  if (!v || typeof v !== "object" || Array.isArray(v)) return undefined;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(v as Record<string, unknown>)) {
    if (!key || typeof value !== "string") continue;
    out[key.trim().slice(0, 100)] = value.trim().slice(0, 200);
  }
  return out;
}

function parseEnum(v: unknown, allowed: Set<string>): string | undefined {
  if (typeof v !== "string") return undefined;
  const normalized = v.trim().toLowerCase();
  return allowed.has(normalized) ? normalized : undefined;
}

async function loadProductByIdOrSlug(id: string) {
  const { supabaseServer } = await import("lib/supabase/client");
  const client = supabaseServer();

  const query = client.from("products").select(`
      *,
      product_images(url, is_featured, position),
      product_categories(category_id, categories(id, name, slug)),
      variants(id)
    `);

  const result = UUID_RE.test(id)
    ? await query.eq("id", id).single()
    : await query.eq("slug", id).single();

  if (result.error || !result.data) return { product: null, error: result.error };

  const product = result.data as Record<string, unknown>;
  const productId = String(product.id ?? "");

  const { data: familyData } = await client
    .from("product_families")
    .select("id, name, strategy, active, published_at, product_family_members(id, active)")
    .eq("parent_product_id", productId)
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const imgs: Array<{ url: string; is_featured?: boolean; position?: number }> = Array.isArray(product.product_images)
    ? (product.product_images as Array<{ url: string; is_featured?: boolean; position?: number }>)
    : [];
  imgs.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const featured = imgs.find((img) => img.is_featured) ?? imgs[0];

  const categories = (Array.isArray(product.product_categories) ? product.product_categories : [])
    .map((pc: any) => pc.categories)
    .filter(Boolean)
    .map((cat: any) => ({
      id: cat.id,
      name: cat.name,
      slug: cat.slug,
    }));

  const output = {
    ...product,
    title: product.name,
    handle: product.slug,
    featured_image_url: featured?.url ?? null,
    categories,
    category_ids: categories.map((c: any) => c.id),
    category_names: categories.map((c: any) => c.name),
    variant_count: Array.isArray(product.variants) ? product.variants.length : 0,
    family: familyData
      ? {
          id: familyData.id,
          name: familyData.name,
          strategy: familyData.strategy,
          active: familyData.active,
          published_at: familyData.published_at,
          children_count: (familyData.product_family_members ?? []).filter((m: any) => m.active).length,
        }
      : null,
  };

  delete (output as any).product_images;
  delete (output as any).product_categories;
  delete (output as any).variants;

  return { product: output, error: null };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!checkAdminAuth(req)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const { id } = await params;
  const { product, error } = await loadProductByIdOrSlug(id);

  if (error || !product) {
    return NextResponse.json({ error: "Produit introuvable" }, { status: 404 });
  }

  return NextResponse.json({ product });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!checkAdminAuth(req)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "ID manquant" }, { status: 400 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  const validationErrors: string[] = [];

  function setOrError(field: string, value: unknown, errorLabel: string) {
    if (value === undefined) {
      validationErrors.push(errorLabel);
      return;
    }
    updates[field] = value;
  }

  if ("name" in body) setOrError("name", parseRequiredText(body.name, 500), "name invalide");
  if ("slug" in body) setOrError("slug", parseRequiredText(body.slug, 500), "slug invalide");
  if ("sku" in body) setOrError("sku", parseNullableText(body.sku, 120), "sku invalide");
  if ("description" in body) setOrError("description", parseNullableText(body.description, 100000), "description invalide");
  if ("short_description" in body) setOrError("short_description", parseNullableText(body.short_description, 4000), "short_description invalide");
  if ("seo_title" in body) setOrError("seo_title", parseNullableText(body.seo_title, 200), "seo_title invalide");
  if ("seo_description" in body) setOrError("seo_description", parseNullableText(body.seo_description, 500), "seo_description invalide");
  if ("parent_sku" in body) setOrError("parent_sku", parseNullableText(body.parent_sku, 120), "parent_sku invalide");
  if ("tax_class" in body) setOrError("tax_class", parseNullableText(body.tax_class, 120), "tax_class invalide");
  if ("supplier_ref" in body) setOrError("supplier_ref", parseNullableText(body.supplier_ref, 200), "supplier_ref invalide");
  if ("supplier_code" in body) setOrError("supplier_code", parseNullableText(body.supplier_code, 200), "supplier_code invalide");
  if ("pbq_pricing_type" in body) {
    const normalized = parseEnum(body.pbq_pricing_type, PBQ_PRICING_VALUES);
    if (normalized === undefined && body.pbq_pricing_type !== null && body.pbq_pricing_type !== "") {
      validationErrors.push("pbq_pricing_type invalide");
    } else {
      updates.pbq_pricing_type = normalized ?? null;
    }
  }
  if ("status" in body) setOrError("status", parseEnum(body.status, STATUS_VALUES), "status invalide");
  if ("stock_status" in body) setOrError("stock_status", parseEnum(body.stock_status, STOCK_STATUS_VALUES), "stock_status invalide");
  if ("tax_status" in body) setOrError("tax_status", parseEnum(body.tax_status, TAX_STATUS_VALUES), "tax_status invalide");
  if ("type" in body) setOrError("type", parseEnum(body.type, TYPE_VALUES), "type invalide");
  if ("family_role" in body) {
    const normalized = parseEnum(body.family_role, FAMILY_ROLE_VALUES);
    if (normalized === undefined && body.family_role !== null && body.family_role !== "") {
      validationErrors.push("family_role invalide");
    } else {
      updates.family_role = normalized ?? null;
    }
  }

  if ("regular_price" in body) setOrError("regular_price", parseNullableNumber(body.regular_price), "regular_price invalide");
  if ("sale_price" in body) setOrError("sale_price", parseNullableNumber(body.sale_price), "sale_price invalide");
  if ("stock_quantity" in body) setOrError("stock_quantity", parseNullableInt(body.stock_quantity), "stock_quantity invalide");
  if ("eco_contribution" in body) setOrError("eco_contribution", parseNullableNumber(body.eco_contribution), "eco_contribution invalide");
  if ("supplier_price" in body) setOrError("supplier_price", parseNullableNumber(body.supplier_price), "supplier_price invalide");
  if ("weight" in body) setOrError("weight", parseNullableNumber(body.weight), "weight invalide");
  if ("length" in body) setOrError("length", parseNullableNumber(body.length), "length invalide");
  if ("width" in body) setOrError("width", parseNullableNumber(body.width), "width invalide");
  if ("height" in body) setOrError("height", parseNullableNumber(body.height), "height invalide");
  if ("low_stock_threshold" in body) setOrError("low_stock_threshold", parseNullableInt(body.low_stock_threshold), "low_stock_threshold invalide");
  if ("pbq_min_quantity" in body) setOrError("pbq_min_quantity", parseNullableInt(body.pbq_min_quantity), "pbq_min_quantity invalide");
  if ("pbq_max_quantity" in body) setOrError("pbq_max_quantity", parseNullableInt(body.pbq_max_quantity), "pbq_max_quantity invalide");

  if ("sale_price_start" in body) setOrError("sale_price_start", parseNullableIsoDate(body.sale_price_start), "sale_price_start invalide");
  if ("sale_price_end" in body) setOrError("sale_price_end", parseNullableIsoDate(body.sale_price_end), "sale_price_end invalide");

  if ("manage_stock" in body) setOrError("manage_stock", parseBoolean(body.manage_stock), "manage_stock invalide");
  if ("featured" in body) setOrError("featured", parseBoolean(body.featured), "featured invalide");
  if ("backorders_allowed" in body) setOrError("backorders_allowed", parseBoolean(body.backorders_allowed), "backorders_allowed invalide");
  if ("sold_individually" in body) setOrError("sold_individually", parseBoolean(body.sold_individually), "sold_individually invalide");
  if ("pbq_enabled" in body) setOrError("pbq_enabled", parseBoolean(body.pbq_enabled), "pbq_enabled invalide");

  if ("tags" in body) setOrError("tags", parseTags(body.tags), "tags invalide");
  if ("default_attribute_values" in body) {
    setOrError("default_attribute_values", parseDefaultAttributes(body.default_attribute_values), "default_attribute_values invalide");
  }

  if ("parent_family_id" in body) {
    if (body.parent_family_id === null || body.parent_family_id === "") {
      updates.parent_family_id = null;
    } else if (typeof body.parent_family_id === "string" && UUID_RE.test(body.parent_family_id)) {
      updates.parent_family_id = body.parent_family_id;
    } else {
      validationErrors.push("parent_family_id invalide");
    }
  }

  if (validationErrors.length > 0) {
    return NextResponse.json({ error: "Validation invalide", details: validationErrors }, { status: 400 });
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Aucun champ à mettre à jour" }, { status: 400 });
  }

  try {
    const { supabaseServer } = await import("lib/supabase/client");
    const client = supabaseServer();

    const isUuid = UUID_RE.test(id);
    const { error } = await client
      .from("products")
      .update(updates)
      .eq(isUuid ? "id" : "slug", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const { product: refreshed } = await loadProductByIdOrSlug(id);
    console.log(JSON.stringify({ event: "admin.product.updated", id, fields: Object.keys(updates) }));
    return NextResponse.json({ success: true, product: refreshed });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
