/**
 * POST /api/admin/products/[id]/variations/generate
 * Generate variations from a product's attribute definitions (cartesian product).
 * Only generates missing combinations.
 */
import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "lib/admin/auth";
import { supabaseServer } from "lib/supabase/client";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function cartesian(arrays: string[][]): string[][] {
  return arrays.reduce<string[][]>(
    (acc, curr) => acc.flatMap((a) => curr.map((b) => [...a, b])),
    [[]],
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!checkAdminAuth(req)) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "ID invalide" }, { status: 400 });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* optional body */ }

  const client = supabaseServer();

  // Get product
  const { data: product } = await client
    .from("products")
    .select("id, sku, name, regular_price")
    .eq("id", id)
    .single();

  if (!product) return NextResponse.json({ error: "Produit non trouvé" }, { status: 404 });

  // attributes from body or default from product
  let attributes: Array<{ name: string; values: string[] }> = [];
  if (Array.isArray(body.attributes)) {
    attributes = (body.attributes as unknown[]).filter((a): a is { name: string; values: string[] } =>
      typeof a === "object" && a !== null &&
      typeof (a as Record<string, unknown>).name === "string" &&
      Array.isArray((a as Record<string, unknown>).values)
    );
  }

  if (attributes.length === 0) {
    // Fallback: read from variant_attributes of existing variants
    const { data: existing } = await client
      .from("variant_attributes")
      .select("attribute_name, attribute_value")
      .in("variant_id", (
        await client.from("variants").select("id").eq("product_id", id)
      ).data?.map((v) => v.id) ?? []);

    const byAttr: Record<string, Set<string>> = {};
    for (const row of existing ?? []) {
      if (!byAttr[row.attribute_name]) byAttr[row.attribute_name] = new Set<string>();
      byAttr[row.attribute_name]!.add(row.attribute_value);
    }
    attributes = Object.entries(byAttr).map(([name, vals]) => ({ name, values: [...vals] }));
  }

  if (attributes.length === 0) {
    return NextResponse.json({ error: "Aucun attribut défini pour générer des variations" }, { status: 400 });
  }

  // Get existing variant attribute combinations to avoid duplicates
  const { data: existingVariants } = await client
    .from("variants")
    .select("id, sku")
    .eq("product_id", id);

  const combinations = cartesian(attributes.map((a) => a.values));
  const attrNames = attributes.map((a) => a.name);

  let created = 0;
  let skipped = 0;

  for (let i = 0; i < combinations.length; i++) {
    const combo = combinations[i]!;
    const variantName = combo.join(" / ");
    const variantSku = `${product.sku}-v${String(existingVariants!.length + i + 1).padStart(3, "0")}`;

    // Check if exact same-named variant already exists
    const alreadyExists = (existingVariants ?? []).some((v) => v.sku === variantSku);
    if (alreadyExists) { skipped++; continue; }

    const { data: newVariant, error } = await client
      .from("variants")
      .insert({
        product_id: id,
        sku: variantSku,
        name: variantName,
        regular_price: product.regular_price,
        stock_status: "instock",
        status: "publish",
        position: (existingVariants?.length ?? 0) + i,
      })
      .select("id")
      .single();

    if (error || !newVariant) { skipped++; continue; }

    // Insert attribute values
    const attrRows = combo.map((val, j) => ({
      variant_id: newVariant.id,
      attribute_name: attrNames[j],
      attribute_value: val,
      position: j,
    }));
    await client.from("variant_attributes").insert(attrRows as never);
    created++;
  }

  console.log(JSON.stringify({ event: "admin.variations.generate", product_id: id, created, skipped }));
  return NextResponse.json({ ok: true, created, skipped, total_combinations: combinations.length });
}
