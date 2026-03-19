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

function buildComboKey(attrIds: string[], values: string[]): string {
  return attrIds
    .map((attributeId, idx) => `${attributeId}:${values[idx] ?? ""}`)
    .sort()
    .join("|");
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
  const maxNew = Math.max(1, Math.min(500, Number(body.max_new ?? 200)));

  // Get product
  const { data: product } = await client
    .from("products")
    .select("id, sku, name, regular_price")
    .eq("id", id)
    .single();

  if (!product) return NextResponse.json({ error: "Produit non trouvé" }, { status: 404 });

  // Source of truth for generated combinations: product_attributes(is_variation=true)
  const { data: productAttrs, error: attrsError } = await client
    .from("product_attributes")
    .select("attribute_id, terms, attributes(name, slug)")
    .eq("product_id", id)
    .eq("is_variation", true);

  if (attrsError) {
    return NextResponse.json({ error: attrsError.message }, { status: 500 });
  }

  const attributeDefs = (productAttrs ?? [])
    .map((a: any) => ({
      attributeId: String(a.attribute_id),
      name: a.attributes?.name ?? a.attributes?.slug ?? String(a.attribute_id),
      terms: (a.terms ?? []).map((t: unknown) => String(t)).filter(Boolean),
    }))
    .filter((a: { terms: string[] }) => a.terms.length > 0);

  if (attributeDefs.length === 0) {
    return NextResponse.json({ error: "Aucun attribut défini pour générer des variations" }, { status: 400 });
  }

  // Get existing combinations to avoid duplicates
  const { data: existingVariants } = await client
    .from("variants")
    .select("id, sku, variant_attributes(attribute_id, term_slug)")
    .eq("product_id", id);

  const combinations = cartesian(attributeDefs.map((a) => a.terms));
  const attrIds = attributeDefs.map((a) => a.attributeId);

  // Guard against accidental combinatorial explosion
  if (combinations.length > 5000 && body.force !== true) {
    return NextResponse.json({
      error: "Trop de combinaisons potentielles. Ajoutez {\"force\":true} ou réduisez les attributs.",
      total_combinations: combinations.length,
    }, { status: 400 });
  }

  const existingKeys = new Set<string>();
  for (const variant of existingVariants ?? []) {
    const pairs = (variant as any).variant_attributes ?? [];
    if (pairs.length === 0) continue;
    const key = [...pairs]
      .map((p: any) => `${p.attribute_id}:${p.term_slug}`)
      .sort()
      .join("|");
    if (key) existingKeys.add(key);
  }

  const usedSkus = new Set((existingVariants ?? []).map((v: any) => String(v.sku)));

  let created = 0;
  let skipped = 0;
  let attempts = 0;

  // For prettier variant names, resolve term labels once
  const { data: termRows } = await client
    .from("attribute_terms")
    .select("attribute_id, slug, name")
    .in("attribute_id", attrIds);
  const termLabelMap = new Map<string, string>();
  for (const row of termRows ?? []) {
    termLabelMap.set(`${row.attribute_id}:${row.slug}`, row.name);
  }

  let skuCounter = (existingVariants?.length ?? 0) + 1;
  const nextSku = () => {
    let candidate = "";
    while (!candidate || usedSkus.has(candidate)) {
      candidate = `${product.sku}-v${String(skuCounter).padStart(4, "0")}`;
      skuCounter++;
    }
    usedSkus.add(candidate);
    return candidate;
  };

  for (const combo of combinations) {
    if (created >= maxNew) break;
    attempts++;
    const comboKey = buildComboKey(attrIds, combo);
    if (existingKeys.has(comboKey)) {
      skipped++;
      continue;
    }

    const variantName = combo
      .map((val, idx) => termLabelMap.get(`${attrIds[idx]}:${val}`) ?? val)
      .join(" / ");
    const variantSku = nextSku();

    const { data: newVariant, error } = await client
      .from("variants")
      .insert({
        product_id: id,
        sku: variantSku,
        name: variantName,
        regular_price: product.regular_price,
        stock_status: "instock",
        status: "publish",
        position: (existingVariants?.length ?? 0) + created,
      })
      .select("id")
      .single();

    if (error || !newVariant) { skipped++; continue; }

    // Insert attribute values on canonical schema (attribute_id + term_slug)
    const attrRows = combo.map((val, j) => ({
      variant_id: newVariant.id,
      attribute_id: attrIds[j],
      term_slug: val,
    }));
    const { error: attrsInsertError } = await client.from("variant_attributes").insert(attrRows as never);
    if (attrsInsertError) {
      // Cleanup variant if attributes insertion fails
      await client.from("variants").delete().eq("id", newVariant.id);
      skipped++;
      continue;
    }

    existingKeys.add(comboKey);
    created++;
  }

  console.log(JSON.stringify({
    event: "admin.variations.generate",
    product_id: id,
    created,
    skipped,
    attempts,
    total_combinations: combinations.length,
    max_new: maxNew,
  }));
  return NextResponse.json({
    ok: true,
    created,
    skipped,
    attempts,
    total_combinations: combinations.length,
    max_new: maxNew,
  });
}
