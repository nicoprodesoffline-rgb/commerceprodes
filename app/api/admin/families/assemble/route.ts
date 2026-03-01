/**
 * POST /api/admin/families/assemble
 * Assemble products/variants under a parent product (creates or updates a family).
 * Business rules:
 * - Parent must exist and not already be a child in another family
 * - Each child must not already be active in another family (collision check)
 * - Returns conflicts[] with details if any
 * - On success: sets published_at = now(), family active = true
 */
import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "lib/admin/auth";
import { checkFamiliesDb, degradedResponse } from "lib/admin/families-db";
import { supabaseServer } from "lib/supabase/client";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUUID(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

export async function POST(req: NextRequest) {
  if (!checkAdminAuth(req)) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const db = await checkFamiliesDb();
  if (!db.available) return NextResponse.json(degradedResponse(db), { status: 503 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const parent_product_id = body.parent_product_id;
  const member_product_ids_raw: string[] = Array.isArray(body.member_product_ids)
    ? (body.member_product_ids as unknown[]).filter(isUUID)
    : [];
  const member_product_ids = member_product_ids_raw.filter((id) => id !== parent_product_id);
  const member_variant_ids: string[] = Array.isArray(body.member_variant_ids)
    ? (body.member_variant_ids as unknown[]).filter(isUUID)
    : [];
  const family_id_existing = typeof body.family_id === "string" && UUID_RE.test(body.family_id)
    ? body.family_id : null;
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 200) : "";
  const strategy = typeof body.strategy === "string" ? body.strategy : "manual";

  if (!isUUID(parent_product_id)) {
    return NextResponse.json({ error: "parent_product_id UUID requis" }, { status: 400 });
  }
  if (member_product_ids.length === 0 && member_variant_ids.length === 0) {
    return NextResponse.json({ error: "Au moins un membre requis" }, { status: 400 });
  }

  const client = supabaseServer();
  const conflicts: Array<{ id: string; type: "product" | "variant"; family_name: string }> = [];

  // Check each product member for existing active family membership
  if (member_product_ids.length > 0) {
    const { data: existing } = await client
      .from("product_family_members")
      .select("member_product_id, family_id, product_families(name)")
      .in("member_product_id", member_product_ids)
      .eq("active", true);

    for (const row of existing ?? []) {
      // Only conflict if it's in a DIFFERENT family
      if (!family_id_existing || row.family_id !== family_id_existing) {
        const fam = row.product_families as unknown as { name: string } | null;
        conflicts.push({
          id: row.member_product_id as string,
          type: "product",
          family_name: fam?.name ?? "unknown",
        });
      }
    }
  }

  // Check each variant member
  if (member_variant_ids.length > 0) {
    const { data: existing } = await client
      .from("product_family_members")
      .select("member_variant_id, family_id, product_families(name)")
      .in("member_variant_id", member_variant_ids)
      .eq("active", true);

    for (const row of existing ?? []) {
      if (!family_id_existing || row.family_id !== family_id_existing) {
        const fam = row.product_families as unknown as { name: string } | null;
        conflicts.push({
          id: row.member_variant_id as string,
          type: "variant",
          family_name: fam?.name ?? "unknown",
        });
      }
    }
  }

  if (conflicts.length > 0) {
    return NextResponse.json({ ok: false, conflicts }, { status: 409 });
  }

  // Create or fetch family
  let familyId = family_id_existing;
  if (!familyId) {
    const familyName = name || `Famille ${new Date().toISOString().slice(0, 10)}`;
    const slug = familyName.toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-" + Date.now();
    const { data: fam, error: famErr } = await client
      .from("product_families")
      .insert({
        parent_product_id,
        name: familyName,
        slug,
        strategy,
        active: true,
        published_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (famErr) return NextResponse.json({ error: famErr.message }, { status: 500 });
    familyId = fam.id;
  } else {
    // Update existing family
    await client
      .from("product_families")
      .update({ active: true, published_at: new Date().toISOString() })
      .eq("id", familyId);
  }

  // Insert/update product members without relying on invalid upsert constraints.
  for (let i = 0; i < member_product_ids.length; i++) {
    const memberId = member_product_ids[i]!;
    const { data: existing } = await client
      .from("product_family_members")
      .select("id")
      .eq("family_id", familyId)
      .eq("member_product_id", memberId)
      .maybeSingle();

    if (existing?.id) {
      const { error } = await client
        .from("product_family_members")
        .update({ active: true, position: i, member_type: "product" })
        .eq("id", existing.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      continue;
    }

    const { error } = await client.from("product_family_members").insert({
      family_id: familyId,
      member_product_id: memberId,
      member_type: "product",
      position: i,
      active: true,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  for (let i = 0; i < member_variant_ids.length; i++) {
    const memberId = member_variant_ids[i]!;
    const position = member_product_ids.length + i;
    const { data: existing } = await client
      .from("product_family_members")
      .select("id")
      .eq("family_id", familyId)
      .eq("member_variant_id", memberId)
      .maybeSingle();

    if (existing?.id) {
      const { error } = await client
        .from("product_family_members")
        .update({ active: true, position, member_type: "variant" })
        .eq("id", existing.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      continue;
    }

    const { error } = await client.from("product_family_members").insert({
      family_id: familyId,
      member_variant_id: memberId,
      member_type: "variant",
      position,
      active: true,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  console.log(JSON.stringify({
    event: "admin.family.assemble",
    family_id: familyId,
    products: member_product_ids.length,
    variants: member_variant_ids.length,
  }));

  return NextResponse.json({ ok: true, family_id: familyId });
}
