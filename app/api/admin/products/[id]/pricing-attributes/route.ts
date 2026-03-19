import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "lib/admin/auth";
import { checkCommercialPricingDb, degradedResponse } from "lib/admin/families-db";
import { supabaseServer } from "lib/supabase/client";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizeToken(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
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

function inferAutoImpactAttributeIds(
  variants: Array<{
    regular_price: number | null;
    variant_attributes?: Array<{ attribute_id: string; term_slug: string }>;
  }>,
): Set<string> {
  const byAttribute = new Map<string, Map<string, number[]>>();

  for (const variant of variants) {
    const price = Number(variant.regular_price ?? 0);
    for (const va of variant.variant_attributes || []) {
      const attrId = String(va.attribute_id || "");
      if (!attrId) continue;
      const valueKey = normalizeToken(String(va.term_slug || ""));
      if (!valueKey) continue;
      const valuesMap = byAttribute.get(attrId) ?? new Map<string, number[]>();
      const bucket = valuesMap.get(valueKey) ?? [];
      bucket.push(price);
      valuesMap.set(valueKey, bucket);
      byAttribute.set(attrId, valuesMap);
    }
  }

  const impacted = new Set<string>();
  for (const [attributeId, valuesMap] of byAttribute.entries()) {
    if (valuesMap.size < 2) continue;
    const averages = [...valuesMap.values()].map((arr) => {
      const valid = arr.filter((v) => Number.isFinite(v));
      if (valid.length === 0) return 0;
      return valid.reduce((sum, n) => sum + n, 0) / valid.length;
    });
    const min = Math.min(...averages);
    const max = Math.max(...averages);
    if (max - min > 0.01) impacted.add(attributeId);
  }

  return impacted;
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

  const [{ data: attrs }, { data: rules }, { data: variants }] = await Promise.all([
    client
      .from("product_attributes")
      .select("attribute_id, terms, attributes(id, name, slug)")
      .eq("product_id", productId)
      .eq("is_variation", true),
    client
      .from("pricing_attribute_rules")
      .select("attribute_id, impacts_price, source, confidence")
      .eq("product_id", productId)
      .eq("active", true),
    client
      .from("variants")
      .select("regular_price, variant_attributes(attribute_id, term_slug)")
      .eq("product_id", productId)
      .eq("status", "publish"),
  ]);

  const rulesByAttr = new Map<string, { impacts_price: boolean; source: string; confidence: number }>();
  (rules || []).forEach((r: any) => {
    rulesByAttr.set(String(r.attribute_id), {
      impacts_price: Boolean(r.impacts_price),
      source: String(r.source ?? "manual"),
      confidence: Number(r.confidence ?? 100),
    });
  });

  const autoSuggested = inferAutoImpactAttributeIds((variants || []) as any);

  const attributes = (attrs || []).map((row: any) => {
    const attributeId = String(row.attribute_id);
    const manual = rulesByAttr.get(attributeId);
    return {
      id: attributeId,
      name: row.attributes?.name ?? attributeId,
      slug: row.attributes?.slug ?? null,
      terms: Array.isArray(row.terms) ? row.terms : [],
      impacts_price: manual ? manual.impacts_price : false,
      source: manual?.source ?? null,
      confidence: manual?.confidence ?? null,
      auto_impacts_price: autoSuggested.has(attributeId),
    };
  });

  return NextResponse.json({
    product_id: productId,
    attributes,
    selected_attribute_ids: attributes.filter((a) => a.impacts_price).map((a) => a.id),
    auto_suggested_attribute_ids: attributes
      .filter((a) => a.auto_impacts_price)
      .map((a) => a.id),
  });
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

  const attributeIds = Array.isArray(body.attribute_ids)
    ? body.attribute_ids.map((v) => String(v)).filter(Boolean)
    : null;
  if (!attributeIds) {
    return NextResponse.json({ error: "attribute_ids (array) requis" }, { status: 400 });
  }

  const client = supabaseServer();
  const { data: attrs, error: attrsError } = await client
    .from("product_attributes")
    .select("attribute_id")
    .eq("product_id", productId)
    .eq("is_variation", true);

  if (attrsError) {
    return NextResponse.json({ error: attrsError.message }, { status: 500 });
  }

  const eligible = new Set((attrs || []).map((a: any) => String(a.attribute_id)));
  if (eligible.size === 0) {
    return NextResponse.json({ error: "Aucun attribut de variation disponible" }, { status: 400 });
  }

  const selected = new Set(attributeIds.filter((id) => eligible.has(id)));

  const { error: delError } = await client
    .from("pricing_attribute_rules")
    .delete()
    .eq("product_id", productId);

  if (delError) {
    return NextResponse.json({ error: delError.message }, { status: 500 });
  }

  const rows = [...eligible].map((attribute_id) => ({
    product_id: productId,
    family_id: null,
    attribute_id,
    impacts_price: selected.has(attribute_id),
    source: "manual",
    confidence: 100,
    active: true,
  }));

  if (rows.length > 0) {
    const { error: insertError } = await client
      .from("pricing_attribute_rules")
      .insert(rows);
    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
  }

  console.log(
    JSON.stringify({
      event: "admin.product.pricing_attributes.updated",
      product_id: productId,
      selected_count: selected.size,
    }),
  );

  return NextResponse.json({
    ok: true,
    product_id: productId,
    selected_attribute_ids: [...selected],
  });
}
