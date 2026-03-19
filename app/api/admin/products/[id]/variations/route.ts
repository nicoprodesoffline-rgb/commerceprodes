/**
 * GET /api/admin/products/[id]/variations
 * List all variations for a product with commercial fields (degraded if 017 not applied)
 */
import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "lib/admin/auth";
import { checkVariationsDb } from "lib/admin/families-db";
import { supabaseServer } from "lib/supabase/client";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeSku(value: unknown): string {
  return String(value ?? "").trim().toUpperCase();
}

function isMeaningfulVariation(productSku: string, variation: any): boolean {
  const attrCount = Array.isArray(variation?.variant_attributes)
    ? variation.variant_attributes.length
    : 0;
  if (attrCount > 0) return true;

  const variationSku = normalizeSku(variation?.sku);
  if (!variationSku || !productSku) return true;

  return variationSku !== productSku;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!checkAdminAuth(req)) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "ID invalide" }, { status: 400 });

  const client = supabaseServer();
  const dbStatus = await checkVariationsDb();
  const { data: productRow } = await client
    .from("products")
    .select("sku")
    .eq("id", id)
    .maybeSingle();
  const productSku = normalizeSku(productRow?.sku);

  // Base select — always available
  let selectFields = `
    id, sku, name, description, regular_price, sale_price,
    stock_quantity, stock_status, manage_stock,
    weight, length, width, height,
    min_order_quantity, status, position, created_at, updated_at,
    variant_attributes (
      attribute_id, term_slug,
      attributes (id, name, slug)
    )
  `;

  // Extended fields only if migration 017 is applied
  if (dbStatus.available) {
    selectFields = `
      id, sku, name, description, regular_price, sale_price,
      stock_quantity, stock_status, manage_stock,
      weight, length, width, height,
      min_order_quantity, status, position, created_at, updated_at,
      gtin_upc_ean_isbn, tax_class_override, active_flag, downloadable, virtual,
      ignore_attribute_stock, quantity_rules_enabled,
      min_quantity, max_quantity, group_of_quantity, stock_multiplier, initial_stock,
      supplier_ref, supplier_name, supplier_purchase_price, eco_contribution,
      variant_attributes (
        attribute_id, term_slug,
        attributes (id, name, slug)
      )
    `;
  }

  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1"));
  const limit = Math.min(200, parseInt(url.searchParams.get("limit") ?? "50"));

  const { data, count, error } = await client
    .from("variants")
    .select(selectFields, { count: "exact" })
    .eq("product_id", id)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true })
    .range((page - 1) * limit, page * limit - 1);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const variations = (data ?? []).map((v: any) => ({
    ...v,
    variant_attributes: (v.variant_attributes ?? []).map((va: any, idx: number) => ({
      attribute_id: va.attribute_id,
      term_slug: va.term_slug,
      attribute_name: va.attributes?.name ?? va.attributes?.slug ?? va.attribute_id,
      attribute_value: va.term_slug,
      position: idx,
    })),
  })).filter((variation) => isMeaningfulVariation(productSku, variation));

  return NextResponse.json({
    variations,
    total: variations.length,
    page,
    limit,
    extended_fields: dbStatus.available,
  });
}
