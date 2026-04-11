import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "lib/admin/auth";
import { supabaseServer } from "lib/supabase/client";

/**
 * GET  — Export backup of current PUID state (products + variants puid/sku columns)
 * POST — Restore from a backup JSON body { products: [...], variants: [...] }
 */

async function hasPuidColumns(
  client: ReturnType<typeof supabaseServer>,
): Promise<boolean> {
  const probe = await client.from("products").select("id, puid").limit(1);
  return !probe.error;
}

export async function GET(req: NextRequest) {
  if (!checkAdminAuth(req)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const url = new URL(req.url);
  const limit = Math.min(
    5000,
    Math.max(1, Number(url.searchParams.get("limit") || 5000)),
  );
  const client = supabaseServer();

  const puidAvailable = await hasPuidColumns(client);

  // Products backup
  const productCols = puidAvailable
    ? "id, sku, puid, puid_root, puid_price_branch, puid_style_branch, puid_generated_at, updated_at"
    : "id, sku, updated_at";

  const { data: products, error: pe } = await client
    .from("products")
    .select(productCols)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (pe) {
    return NextResponse.json({ error: pe.message }, { status: 500 });
  }

  // Variants backup
  const variantCols = puidAvailable
    ? "id, product_id, sku, puid, puid_root, puid_price_branch, puid_style_branch, puid_generated_at, updated_at"
    : "id, product_id, sku, updated_at";

  const { data: variants, error: ve } = await client
    .from("variants")
    .select(variantCols)
    .order("updated_at", { ascending: false })
    .limit(limit * 8);

  if (ve) {
    return NextResponse.json({ error: ve.message }, { status: 500 });
  }

  const backup = {
    created_at: new Date().toISOString(),
    puid_columns_available: puidAvailable,
    products: products ?? [],
    variants: variants ?? [],
    meta: {
      products_count: (products ?? []).length,
      variants_count: (variants ?? []).length,
    },
  };

  return NextResponse.json(backup);
}

export async function POST(req: NextRequest) {
  if (!checkAdminAuth(req)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  let body: { products?: unknown[]; variants?: unknown[]; dry_run?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  if (!Array.isArray(body.products) || !Array.isArray(body.variants)) {
    return NextResponse.json(
      { error: "Corps attendu: { products: [...], variants: [...] }" },
      { status: 400 },
    );
  }

  const dryRun = body.dry_run !== false;
  const client = supabaseServer();
  const puidAvailable = await hasPuidColumns(client);

  const result = {
    dry_run: dryRun,
    restored_products: 0,
    restored_variants: 0,
    skipped_products: 0,
    skipped_variants: 0,
    errors: [] as string[],
  };

  if (!dryRun) {
    // Restore products
    for (const row of body.products as Array<Record<string, unknown>>) {
      if (!row.id) {
        result.skipped_products += 1;
        continue;
      }
      const payload: Record<string, unknown> = { sku: row.sku ?? null };
      if (puidAvailable) {
        payload.puid = row.puid ?? null;
        payload.puid_root = row.puid_root ?? null;
        payload.puid_price_branch = row.puid_price_branch ?? null;
        payload.puid_style_branch = row.puid_style_branch ?? null;
        payload.puid_generated_at = row.puid_generated_at ?? null;
      }
      const { error } = await client
        .from("products")
        .update(payload)
        .eq("id", String(row.id));
      if (error) {
        result.errors.push(`product:${row.id}:${error.message}`);
      } else {
        result.restored_products += 1;
      }
    }

    // Restore variants
    for (const row of body.variants as Array<Record<string, unknown>>) {
      if (!row.id) {
        result.skipped_variants += 1;
        continue;
      }
      const payload: Record<string, unknown> = { sku: row.sku ?? null };
      if (puidAvailable) {
        payload.puid = row.puid ?? null;
        payload.puid_root = row.puid_root ?? null;
        payload.puid_price_branch = row.puid_price_branch ?? null;
        payload.puid_style_branch = row.puid_style_branch ?? null;
        payload.puid_generated_at = row.puid_generated_at ?? null;
      }
      const { error } = await client
        .from("variants")
        .update(payload)
        .eq("id", String(row.id));
      if (error) {
        result.errors.push(`variant:${row.id}:${error.message}`);
      } else {
        result.restored_variants += 1;
      }
    }
  } else {
    result.restored_products = body.products.length;
    result.restored_variants = body.variants.length;
  }

  return NextResponse.json(result);
}
