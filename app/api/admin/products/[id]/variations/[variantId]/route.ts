/**
 * PATCH /api/admin/products/[id]/variations/[variantId]
 * Update a single variation with full field support (base + extended)
 */
import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "lib/admin/auth";
import { checkVariationsDb } from "lib/admin/families-db";
import { log } from "lib/logger";
import { supabaseServer } from "lib/supabase/client";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function safeNum(v: unknown, fallback?: number): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function safeStr(v: unknown, max = 500): string | null {
  if (v == null) return null;
  return typeof v === "string" ? v.trim().slice(0, max) : null;
}

function safeBool(v: unknown): boolean | undefined {
  if (typeof v === "boolean") return v;
  return undefined;
}

const BASE_FIELDS = [
  "sku",
  "name",
  "description",
  "regular_price",
  "sale_price",
  "stock_quantity",
  "stock_status",
  "manage_stock",
  "weight",
  "length",
  "width",
  "height",
  "min_order_quantity",
  "status",
  "position",
];

const STOCK_STATUSES = ["instock", "outofstock", "onbackorder"];
const PRODUCT_STATUSES = ["publish", "draft", "private"];

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; variantId: string }> },
) {
  if (!checkAdminAuth(req))
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const { id, variantId } = await params;
  if (!UUID_RE.test(id) || !UUID_RE.test(variantId)) {
    return NextResponse.json({ error: "IDs invalides" }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const dbStatus = await checkVariationsDb();
  const client = supabaseServer();
  const updates: Record<string, unknown> = {};

  // ── Base fields ──────────────────────────────────────────────────────────────
  if (body.sku != null) {
    const sku = safeStr(body.sku, 100);
    if (sku) updates.sku = sku;
  }
  if (body.name != null) {
    const name = safeStr(body.name, 500);
    if (name) updates.name = name;
  }
  if (body.description != null)
    updates.description = safeStr(body.description, 5000);
  if (body.regular_price != null) {
    const p = safeNum(body.regular_price);
    if (p !== undefined && p >= 0) updates.regular_price = p;
  }
  if (body.sale_price != null) {
    const p = safeNum(body.sale_price);
    if (p !== undefined && p >= 0) updates.sale_price = p;
  }
  if (body.stock_quantity != null)
    updates.stock_quantity = Math.round(safeNum(body.stock_quantity) ?? 0);
  if (
    body.stock_status != null &&
    STOCK_STATUSES.includes(body.stock_status as string)
  ) {
    updates.stock_status = body.stock_status;
  }
  if (body.manage_stock != null)
    updates.manage_stock = Boolean(body.manage_stock);
  if (body.weight != null) {
    const w = safeNum(body.weight);
    if (w !== undefined && w >= 0) updates.weight = w;
  }
  if (body.length != null) {
    const l = safeNum(body.length);
    if (l !== undefined && l >= 0) updates.length = l;
  }
  if (body.width != null) {
    const w = safeNum(body.width);
    if (w !== undefined && w >= 0) updates.width = w;
  }
  if (body.height != null) {
    const h = safeNum(body.height);
    if (h !== undefined && h >= 0) updates.height = h;
  }
  if (body.min_order_quantity != null) {
    updates.min_order_quantity = Math.max(
      1,
      Math.round(safeNum(body.min_order_quantity) ?? 1),
    );
  }
  if (body.status != null && PRODUCT_STATUSES.includes(body.status as string))
    updates.status = body.status;
  if (body.position != null)
    updates.position = Math.round(safeNum(body.position) ?? 0);

  // ── Extended fields (migration 017) ─────────────────────────────────────────
  if (dbStatus.available) {
    if (body.gtin_upc_ean_isbn != null)
      updates.gtin_upc_ean_isbn = safeStr(body.gtin_upc_ean_isbn, 20);
    if (body.tax_class_override != null)
      updates.tax_class_override = safeStr(body.tax_class_override, 100);
    const boolFields = [
      "active_flag",
      "downloadable",
      "virtual",
      "ignore_attribute_stock",
      "quantity_rules_enabled",
    ];
    for (const f of boolFields) {
      const v = safeBool(body[f]);
      if (v !== undefined) updates[f] = v;
    }
    if (body.min_quantity != null)
      updates.min_quantity = Math.max(
        1,
        Math.round(safeNum(body.min_quantity) ?? 1),
      );
    if (body.max_quantity != null) {
      const v = safeNum(body.max_quantity);
      updates.max_quantity = v && v >= 1 ? Math.round(v) : null;
    }
    if (body.group_of_quantity != null)
      updates.group_of_quantity = Math.max(
        1,
        Math.round(safeNum(body.group_of_quantity) ?? 1),
      );
    if (body.stock_multiplier != null) {
      const v = safeNum(body.stock_multiplier);
      if (v && v > 0) updates.stock_multiplier = v;
    }
    if (body.initial_stock != null)
      updates.initial_stock = Math.round(safeNum(body.initial_stock) ?? 0);
    if (body.supplier_ref != null)
      updates.supplier_ref = safeStr(body.supplier_ref, 200);
    if (body.supplier_name != null)
      updates.supplier_name = safeStr(body.supplier_name, 200);
    if (body.supplier_purchase_price != null) {
      const v = safeNum(body.supplier_purchase_price);
      if (v !== undefined && v >= 0) updates.supplier_purchase_price = v;
    }
    if (body.eco_contribution != null) {
      const v = safeNum(body.eco_contribution);
      if (v !== undefined && v >= 0) updates.eco_contribution = v;
    }
  }

  if (Object.keys(updates).length === 0)
    return NextResponse.json({ error: "Aucun champ valide" }, { status: 400 });

  // Verify the variant belongs to the product
  const { data: existing } = await client
    .from("variants")
    .select("id")
    .eq("id", variantId)
    .eq("product_id", id)
    .single();
  if (!existing)
    return NextResponse.json(
      { error: "Variation non trouvée" },
      { status: 404 },
    );

  const { data, error } = await client
    .from("variants")
    .update(updates)
    .eq("id", variantId)
    .select()
    .single();
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  const updatedFields = Object.keys(updates);
  const sensitive = updatedFields.filter((f) => !BASE_FIELDS.includes(f));
  log("info", "admin.variation.update", {
    product_id: id,
    variant_id: variantId,
    fields: updatedFields,
    extended: sensitive.length > 0,
  });
  return NextResponse.json({ variation: data });
}
