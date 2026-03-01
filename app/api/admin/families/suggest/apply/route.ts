/**
 * POST /api/admin/families/suggest/apply
 * Apply a batch of candidate suggestions: creates families from approved candidates.
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

  // Accept either candidate_ids (UUIDs from product_family_candidates) or
  // direct { parent_id, child_ids[] } groupings
  const candidateIds = Array.isArray(body.candidate_ids)
    ? (body.candidate_ids as unknown[]).filter((x): x is string => typeof x === "string" && UUID_RE.test(x))
    : [];

  if (candidateIds.length === 0) {
    return NextResponse.json({ error: "candidate_ids requis" }, { status: 400 });
  }

  const client = supabaseServer();

  const { data: candidates } = await client
    .from("product_family_candidates")
    .select("*")
    .in("id", candidateIds)
    .eq("status", "pending");

  if (!candidates || candidates.length === 0) {
    return NextResponse.json({ error: "Aucun candidat en attente trouvé" }, { status: 404 });
  }

  // Group by parent
  const byParent: Record<string, string[]> = {};
  for (const c of candidates) {
    const pid = c.suggested_parent_id as string;
    if (!byParent[pid]) byParent[pid] = [];
    if (c.suggested_child_id) byParent[pid].push(c.suggested_child_id as string);
  }

  const created: string[] = [];
  for (const [parentId, childIds] of Object.entries(byParent)) {
    const { data: parent } = await client.from("products").select("id, name, sku").eq("id", parentId).single();
    if (!parent) continue;

    const slug = (parent.name as string).toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-" + Date.now();
    const { data: fam } = await client
      .from("product_families")
      .insert({
        parent_product_id: parentId,
        name: parent.name,
        slug,
        strategy: "parent_sku",
        active: true,
        published_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (!fam) continue;

    const members = childIds.map((cid, i) => ({
      family_id: fam.id,
      member_product_id: cid,
      member_type: "product",
      position: i,
      active: true,
    }));

    await client.from("product_family_members").insert(members as never);
    created.push(fam.id);
  }

  // Mark candidates as applied
  await client
    .from("product_family_candidates")
    .update({ status: "applied" })
    .in("id", candidateIds);

  console.log(JSON.stringify({ event: "admin.family.suggest.apply", families_created: created.length }));
  return NextResponse.json({ ok: true, families_created: created.length, family_ids: created });
}
