import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "lib/admin/auth";
import { checkCommercialPricingDb, degradedResponse } from "lib/admin/families-db";
import { supabaseServer } from "lib/supabase/client";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MODES = new Set([
  "lot",
  "unit_flat_discount",
  "unit_percent_discount",
  "unit_sale_price",
]);

async function resolveProductId(idOrSlug: string): Promise<string | null> {
  if (UUID_RE.test(idOrSlug)) return idOrSlug;
  const client = supabaseServer();
  const { data } = await client
    .from("products")
    .select("id")
    .eq("slug", idOrSlug)
    .single();
  return data?.id ?? null;
}

function parseNumberOrNull(v: unknown): number | null | undefined {
  if (v === null || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return undefined;
  return n;
}

function parseBoolean(v: unknown): boolean | undefined {
  if (typeof v === "boolean") return v;
  if (v === "true") return true;
  if (v === "false") return false;
  return undefined;
}

function parseIsoOrNull(v: unknown): string | null | undefined {
  if (v === null || v === "") return null;
  if (typeof v !== "string") return undefined;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

function isActiveNow(startsAt: string | null, endsAt: string | null): boolean {
  const now = Date.now();
  const s = startsAt ? Date.parse(startsAt) : null;
  const e = endsAt ? Date.parse(endsAt) : null;
  if (s && s > now) return false;
  if (e && e < now) return false;
  return true;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!checkAdminAuth(req)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const db = await checkCommercialPricingDb();
  if (!db.available) {
    return NextResponse.json(degradedResponse(db), { status: 503 });
  }

  const { id } = await params;
  const productId = await resolveProductId(id);
  if (!productId) {
    return NextResponse.json({ error: "Produit introuvable" }, { status: 404 });
  }

  const client = supabaseServer();
  const { data, error } = await client
    .from("product_promotion_layers")
    .select(
      "id, product_id, pricing_profile_id, label, mode, discount_amount, discount_percent, override_unit_price_ht, force_promotions_category, active, starts_at, ends_at, position, meta, created_at, updated_at",
    )
    .eq("product_id", productId)
    .order("position", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const layers = (data || []).map((row: any) => ({
    ...row,
    is_active_now: Boolean(row.active) && isActiveNow(row.starts_at, row.ends_at),
  }));

  return NextResponse.json({ product_id: productId, layers });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!checkAdminAuth(req)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const db = await checkCommercialPricingDb();
  if (!db.available) {
    return NextResponse.json(degradedResponse(db), { status: 503 });
  }

  const { id } = await params;
  const productId = await resolveProductId(id);
  if (!productId) {
    return NextResponse.json({ error: "Produit introuvable" }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const mode = typeof body.mode === "string" ? body.mode : "";
  if (!MODES.has(mode)) {
    return NextResponse.json({ error: "mode invalide" }, { status: 400 });
  }

  const label = typeof body.label === "string" ? body.label.trim().slice(0, 180) : "";
  if (!label) {
    return NextResponse.json({ error: "label requis" }, { status: 400 });
  }

  const discountAmount = parseNumberOrNull(body.discount_amount);
  const discountPercent = parseNumberOrNull(body.discount_percent);
  const overrideUnitPrice = parseNumberOrNull(body.override_unit_price_ht);
  const startsAt = parseIsoOrNull(body.starts_at);
  const endsAt = parseIsoOrNull(body.ends_at);
  const active = parseBoolean(body.active);
  const forcePromotionsCategory = parseBoolean(body.force_promotions_category);
  const positionRaw = parseNumberOrNull(body.position);

  if ([discountAmount, discountPercent, overrideUnitPrice, startsAt, endsAt].includes(undefined)) {
    return NextResponse.json({ error: "Paramètres numériques ou dates invalides" }, { status: 400 });
  }

  const payload: Record<string, unknown> = {
    product_id: productId,
    label,
    mode,
    discount_amount: discountAmount,
    discount_percent: discountPercent,
    override_unit_price_ht: overrideUnitPrice,
    starts_at: startsAt,
    ends_at: endsAt,
    active: active ?? true,
    force_promotions_category: forcePromotionsCategory ?? true,
    position: positionRaw != null ? Math.max(0, Math.round(positionRaw)) : 100,
    pricing_profile_id:
      typeof body.pricing_profile_id === "string" && UUID_RE.test(body.pricing_profile_id)
        ? body.pricing_profile_id
        : null,
    meta: body.meta && typeof body.meta === "object" && !Array.isArray(body.meta) ? body.meta : {},
  };

  const client = supabaseServer();
  const { data, error } = await client
    .from("product_promotion_layers")
    .insert(payload)
    .select(
      "id, product_id, pricing_profile_id, label, mode, discount_amount, discount_percent, override_unit_price_ht, force_promotions_category, active, starts_at, ends_at, position, meta",
    )
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  console.log(
    JSON.stringify({
      event: "admin.product.promotion_layer.created",
      product_id: productId,
      layer_id: data.id,
      mode,
    }),
  );

  return NextResponse.json({ ok: true, layer: data }, { status: 201 });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!checkAdminAuth(req)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const db = await checkCommercialPricingDb();
  if (!db.available) {
    return NextResponse.json(degradedResponse(db), { status: 503 });
  }

  const { id } = await params;
  const productId = await resolveProductId(id);
  if (!productId) {
    return NextResponse.json({ error: "Produit introuvable" }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const layerId = typeof body.id === "string" ? body.id : "";
  if (!UUID_RE.test(layerId)) {
    return NextResponse.json({ error: "id couche invalide" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};

  if ("label" in body) {
    if (typeof body.label !== "string" || !body.label.trim()) {
      return NextResponse.json({ error: "label invalide" }, { status: 400 });
    }
    updates.label = body.label.trim().slice(0, 180);
  }

  if ("mode" in body) {
    if (typeof body.mode !== "string" || !MODES.has(body.mode)) {
      return NextResponse.json({ error: "mode invalide" }, { status: 400 });
    }
    updates.mode = body.mode;
  }

  if ("discount_amount" in body) {
    const val = parseNumberOrNull(body.discount_amount);
    if (val === undefined) return NextResponse.json({ error: "discount_amount invalide" }, { status: 400 });
    updates.discount_amount = val;
  }

  if ("discount_percent" in body) {
    const val = parseNumberOrNull(body.discount_percent);
    if (val === undefined) return NextResponse.json({ error: "discount_percent invalide" }, { status: 400 });
    updates.discount_percent = val;
  }

  if ("override_unit_price_ht" in body) {
    const val = parseNumberOrNull(body.override_unit_price_ht);
    if (val === undefined) return NextResponse.json({ error: "override_unit_price_ht invalide" }, { status: 400 });
    updates.override_unit_price_ht = val;
  }

  if ("starts_at" in body) {
    const val = parseIsoOrNull(body.starts_at);
    if (val === undefined) return NextResponse.json({ error: "starts_at invalide" }, { status: 400 });
    updates.starts_at = val;
  }

  if ("ends_at" in body) {
    const val = parseIsoOrNull(body.ends_at);
    if (val === undefined) return NextResponse.json({ error: "ends_at invalide" }, { status: 400 });
    updates.ends_at = val;
  }

  if ("active" in body) {
    const val = parseBoolean(body.active);
    if (val === undefined) return NextResponse.json({ error: "active invalide" }, { status: 400 });
    updates.active = val;
  }

  if ("force_promotions_category" in body) {
    const val = parseBoolean(body.force_promotions_category);
    if (val === undefined) return NextResponse.json({ error: "force_promotions_category invalide" }, { status: 400 });
    updates.force_promotions_category = val;
  }

  if ("position" in body) {
    const val = parseNumberOrNull(body.position);
    if (val === undefined || val === null) return NextResponse.json({ error: "position invalide" }, { status: 400 });
    updates.position = Math.max(0, Math.round(val));
  }

  if ("pricing_profile_id" in body) {
    if (body.pricing_profile_id === null || body.pricing_profile_id === "") {
      updates.pricing_profile_id = null;
    } else if (typeof body.pricing_profile_id === "string" && UUID_RE.test(body.pricing_profile_id)) {
      updates.pricing_profile_id = body.pricing_profile_id;
    } else {
      return NextResponse.json({ error: "pricing_profile_id invalide" }, { status: 400 });
    }
  }

  if ("meta" in body) {
    if (body.meta === null) {
      updates.meta = {};
    } else if (typeof body.meta === "object" && !Array.isArray(body.meta)) {
      updates.meta = body.meta;
    } else {
      return NextResponse.json({ error: "meta invalide" }, { status: 400 });
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Aucun champ à mettre à jour" }, { status: 400 });
  }

  const client = supabaseServer();
  const { data, error } = await client
    .from("product_promotion_layers")
    .update(updates)
    .eq("id", layerId)
    .eq("product_id", productId)
    .select(
      "id, product_id, pricing_profile_id, label, mode, discount_amount, discount_percent, override_unit_price_ht, force_promotions_category, active, starts_at, ends_at, position, meta",
    )
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  console.log(
    JSON.stringify({
      event: "admin.product.promotion_layer.updated",
      product_id: productId,
      layer_id: layerId,
      fields: Object.keys(updates),
    }),
  );

  return NextResponse.json({ ok: true, layer: data });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!checkAdminAuth(req)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const db = await checkCommercialPricingDb();
  if (!db.available) {
    return NextResponse.json(degradedResponse(db), { status: 503 });
  }

  const { id } = await params;
  const productId = await resolveProductId(id);
  if (!productId) {
    return NextResponse.json({ error: "Produit introuvable" }, { status: 404 });
  }

  const layerId = req.nextUrl.searchParams.get("layerId") ?? "";
  if (!UUID_RE.test(layerId)) {
    return NextResponse.json({ error: "layerId invalide" }, { status: 400 });
  }

  const client = supabaseServer();
  const { error } = await client
    .from("product_promotion_layers")
    .delete()
    .eq("id", layerId)
    .eq("product_id", productId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  console.log(
    JSON.stringify({
      event: "admin.product.promotion_layer.deleted",
      product_id: productId,
      layer_id: layerId,
    }),
  );

  return NextResponse.json({ ok: true });
}
