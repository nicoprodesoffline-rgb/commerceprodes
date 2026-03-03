/**
 * POST /api/admin/families/disassemble
 * Remove members from a family or deactivate an entire family.
 */
import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "lib/admin/auth";
import { checkFamiliesDb, degradedResponse } from "lib/admin/families-db";
import { supabaseServer } from "lib/supabase/client";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  if (!checkAdminAuth(req)) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const db = await checkFamiliesDb();
  if (!db.available) return NextResponse.json(degradedResponse(db), { status: 503 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const family_id = body.family_id;
  if (!family_id || typeof family_id !== "string" || !UUID_RE.test(family_id)) {
    return NextResponse.json({ error: "family_id UUID requis" }, { status: 400 });
  }

  const client = supabaseServer();

  const { data: familyRow } = await client
    .from("product_families")
    .select("id, parent_product_id")
    .eq("id", family_id)
    .maybeSingle();

  // If member_ids provided: remove specific members
  if (Array.isArray(body.member_ids) && body.member_ids.length > 0) {
    const ids = (body.member_ids as unknown[]).filter((x): x is string => typeof x === "string" && UUID_RE.test(x));
    const { data: removedMembers } = await client
      .from("product_family_members")
      .select("id, member_product_id, member_variant_id")
      .eq("family_id", family_id)
      .in("id", ids);

    const { error } = await client
      .from("product_family_members")
      .update({ active: false })
      .eq("family_id", family_id)
      .in("id", ids);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const removedProductIds = new Set<string>();
    (removedMembers || []).forEach((m: any) => {
      if (m.member_product_id) removedProductIds.add(String(m.member_product_id));
    });
    const removedVariantIds = (removedMembers || [])
      .map((m: any) => m.member_variant_id)
      .filter(Boolean) as string[];
    if (removedVariantIds.length > 0) {
      const { data: variants } = await client
        .from("variants")
        .select("id, product_id")
        .in("id", removedVariantIds);
      (variants || []).forEach((v: any) => {
        if (v.product_id) removedProductIds.add(String(v.product_id));
      });
    }

    const detachedIds = [...removedProductIds];
    if (detachedIds.length > 0) {
      await client
        .from("products")
        .update({ family_role: "standalone", parent_family_id: null })
        .in("id", detachedIds);
    }

    console.log(JSON.stringify({ event: "admin.family.disassemble_members", family_id, count: ids.length }));
    return NextResponse.json({ ok: true, removed: ids.length });
  }

  const { data: allMembers } = await client
    .from("product_family_members")
    .select("member_product_id, member_variant_id")
    .eq("family_id", family_id)
    .eq("active", true);

  const detachedProductIds = new Set<string>();
  (allMembers || []).forEach((m: any) => {
    if (m.member_product_id) detachedProductIds.add(String(m.member_product_id));
  });
  const variantIds = (allMembers || [])
    .map((m: any) => m.member_variant_id)
    .filter(Boolean) as string[];
  if (variantIds.length > 0) {
    const { data: variants } = await client
      .from("variants")
      .select("id, product_id")
      .in("id", variantIds);
    (variants || []).forEach((v: any) => {
      if (v.product_id) detachedProductIds.add(String(v.product_id));
    });
  }

  // Otherwise deactivate the entire family
  const { error: membersError } = await client
    .from("product_family_members")
    .update({ active: false })
    .eq("family_id", family_id);
  if (membersError) return NextResponse.json({ error: membersError.message }, { status: 500 });

  const { error } = await client
    .from("product_families")
    .update({ active: false })
    .eq("id", family_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (detachedProductIds.size > 0) {
    await client
      .from("products")
      .update({ family_role: "standalone", parent_family_id: null })
      .in("id", [...detachedProductIds]);
  }

  if (familyRow?.parent_product_id) {
    await client
      .from("products")
      .update({ family_role: "standalone", parent_family_id: null })
      .eq("id", familyRow.parent_product_id);
  }

  console.log(JSON.stringify({ event: "admin.family.disassemble", family_id }));
  return NextResponse.json({ ok: true });
}
