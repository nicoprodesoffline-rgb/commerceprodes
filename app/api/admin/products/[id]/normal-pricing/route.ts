import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "lib/admin/auth";
import { supabaseServer } from "lib/supabase/client";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type TierInput = {
  min_quantity: number;
  max_quantity?: number | null;
  value: number;
};

function parseNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseIso(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

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

function normalizeTiers(rows: any[], pbqType: "fixed" | "percentage"): TierInput[] {
  const sorted = [...rows].sort((a, b) => a.min_quantity - b.min_quantity);
  return sorted.map((row: any, index) => {
    const min = Number(row.min_quantity || 1);
    const nextMin = sorted[index + 1] ? Number(sorted[index + 1].min_quantity) : null;
    return {
      min_quantity: min,
      max_quantity: nextMin ? Math.max(min, nextMin - 1) : null,
      value:
        pbqType === "fixed"
          ? Number(row.price || 0)
          : Number(row.discount_percent || 0),
    };
  });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!checkAdminAuth(req)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const { id } = await params;
  const productId = await resolveProductId(id);
  if (!productId) {
    return NextResponse.json({ error: "Produit introuvable" }, { status: 404 });
  }

  const client = supabaseServer();
  const [{ data: product, error: productError }, { data: tiers, error: tiersError }] =
    await Promise.all([
      client
        .from("products")
        .select(
          "id, regular_price, sale_price, sale_price_start, sale_price_end, pbq_enabled, pbq_pricing_type, pbq_min_quantity, pbq_max_quantity",
        )
        .eq("id", productId)
        .single(),
      client
        .from("price_tiers")
        .select("id, min_quantity, price, discount_percent, position")
        .eq("product_id", productId)
        .is("variant_id", null)
        .order("min_quantity", { ascending: true }),
    ]);

  if (productError || !product) {
    return NextResponse.json({ error: productError?.message ?? "Produit introuvable" }, { status: 404 });
  }
  if (tiersError) {
    return NextResponse.json({ error: tiersError.message }, { status: 500 });
  }

  const pbqType =
    product.pbq_pricing_type === "percentage" ? "percentage" : "fixed";
  const normalized = normalizeTiers(tiers || [], pbqType);

  return NextResponse.json({
    product_id: productId,
    mode: product.pbq_enabled ? "degressive" : "flat",
    regular_price: product.regular_price,
    sale_price: product.sale_price,
    sale_price_start: product.sale_price_start,
    sale_price_end: product.sale_price_end,
    pbq_pricing_type: product.pbq_pricing_type,
    pbq_min_quantity: product.pbq_min_quantity,
    pbq_max_quantity: product.pbq_max_quantity,
    tiers: normalized,
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!checkAdminAuth(req)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
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

  const mode = body.mode === "degressive" ? "degressive" : "flat";
  const regularPrice = parseNumber(body.regular_price);
  const salePrice = parseNumber(body.sale_price);
  const salePriceStart = parseIso(body.sale_price_start);
  const salePriceEnd = parseIso(body.sale_price_end);

  const client = supabaseServer();
  const updates: Record<string, unknown> = {
    regular_price: regularPrice,
    sale_price: salePrice,
    sale_price_start: salePriceStart,
    sale_price_end: salePriceEnd,
  };

  if (mode === "flat") {
    updates.pbq_enabled = false;
    updates.pbq_pricing_type = null;
    updates.pbq_min_quantity = 1;
    updates.pbq_max_quantity = null;
  } else {
    const pbqType =
      body.pbq_pricing_type === "percentage" ? "percentage" : "fixed";
    const tiersRaw = Array.isArray(body.tiers) ? body.tiers : [];

    const tiers: TierInput[] = tiersRaw
      .map((row) => {
        const min = parseNumber((row as any)?.min_quantity);
        const max = parseNumber((row as any)?.max_quantity);
        const value = parseNumber((row as any)?.value);
        return {
          min_quantity: min != null ? Math.max(1, Math.round(min)) : 1,
          max_quantity: max != null ? Math.max(1, Math.round(max)) : null,
          value: value != null ? value : 0,
        };
      })
      .filter((row) => row.min_quantity >= 1)
      .sort((a, b) => a.min_quantity - b.min_quantity);

    if (tiers.length === 0) {
      return NextResponse.json(
        { error: "Au moins un palier est requis en mode dégressif" },
        { status: 400 },
      );
    }

    updates.pbq_enabled = true;
    updates.pbq_pricing_type = pbqType;
    updates.pbq_min_quantity = tiers[0]?.min_quantity ?? 1;
    updates.pbq_max_quantity =
      tiers[tiers.length - 1]?.max_quantity ?? null;

    const { error: delErr } = await client
      .from("price_tiers")
      .delete()
      .eq("product_id", productId)
      .is("variant_id", null);
    if (delErr) {
      return NextResponse.json({ error: delErr.message }, { status: 500 });
    }

    const rows = tiers.map((tier, idx) => ({
      product_id: productId,
      variant_id: null,
      min_quantity: tier.min_quantity,
      price: pbqType === "fixed" ? tier.value : null,
      discount_percent: pbqType === "percentage" ? tier.value : null,
      position: idx + 1,
    }));

    const { error: insertErr } = await client
      .from("price_tiers")
      .insert(rows as any[]);
    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }
  }

  if (mode === "flat") {
    const { error: delErr } = await client
      .from("price_tiers")
      .delete()
      .eq("product_id", productId)
      .is("variant_id", null);
    if (delErr) {
      return NextResponse.json({ error: delErr.message }, { status: 500 });
    }
  }

  const { error: updateErr } = await client
    .from("products")
    .update(updates)
    .eq("id", productId);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  console.log(
    JSON.stringify({
      event: "admin.product.normal_pricing.updated",
      product_id: productId,
      mode,
    }),
  );

  const [{ data: product }, { data: tiers }] = await Promise.all([
    client
      .from("products")
      .select(
        "id, regular_price, sale_price, sale_price_start, sale_price_end, pbq_enabled, pbq_pricing_type, pbq_min_quantity, pbq_max_quantity",
      )
      .eq("id", productId)
      .single(),
    client
      .from("price_tiers")
      .select("id, min_quantity, price, discount_percent, position")
      .eq("product_id", productId)
      .is("variant_id", null)
      .order("min_quantity", { ascending: true }),
  ]);

  const pbqType =
    product?.pbq_pricing_type === "percentage" ? "percentage" : "fixed";
  const normalized = normalizeTiers(tiers || [], pbqType);

  return NextResponse.json({
    product_id: productId,
    mode: product?.pbq_enabled ? "degressive" : "flat",
    regular_price: product?.regular_price ?? null,
    sale_price: product?.sale_price ?? null,
    sale_price_start: product?.sale_price_start ?? null,
    sale_price_end: product?.sale_price_end ?? null,
    pbq_pricing_type: product?.pbq_pricing_type ?? null,
    pbq_min_quantity: product?.pbq_min_quantity ?? null,
    pbq_max_quantity: product?.pbq_max_quantity ?? null,
    tiers: normalized,
  });
}
