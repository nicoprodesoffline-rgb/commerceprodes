/**
 * GET /api/admin/families/audit
 * Returns:
 * - parents (mères) with no active children
 * - orphan products (have parent_sku set but no family membership)
 * - conflicts (products in multiple families)
 * - large families (> 100 members)
 */
import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "lib/admin/auth";
import { checkFamiliesDb, degradedResponse } from "lib/admin/families-db";
import { supabaseServer } from "lib/supabase/client";
import { computeFamilySuggestions, type ProductLite } from "lib/admin/family-suggest";

export async function GET(req: NextRequest) {
  if (!checkAdminAuth(req)) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const db = await checkFamiliesDb();
  if (!db.available) return NextResponse.json(degradedResponse(db), { status: 503 });

  const client = supabaseServer();

  // ── Parents with no active children ─────────────────────────────────────────
  const { data: allFamilies } = await client
    .from("product_families")
    .select("id, name, parent_product_id, product_family_members(id, active, member_product_id)")
    .eq("active", true);

  const parentsWithoutChildren = (allFamilies ?? []).filter((f) => {
    const members = (f.product_family_members as Array<{ active: boolean }>) ?? [];
    return members.filter((m) => m.active).length === 0;
  }).map((f) => ({ id: f.id, name: f.name }));

  // ── Large families ────────────────────────────────────────────────────────────
  const largeFamilies = (allFamilies ?? [])
    .map((f) => {
      const members = (f.product_family_members as Array<{ active: boolean }>) ?? [];
      return { id: f.id, name: f.name, count: members.filter((m) => m.active).length };
    })
    .filter((f) => f.count > 100);

  // ── Orphan products: have parent_sku but no active family membership ──────────
  let orphanProducts: Array<{ id: string; name: string; sku: string; parent_sku: string }> = [];
  const familiesColumnExists = await client.from("products").select("parent_sku").limit(0).then((r) => !r.error);
  if (familiesColumnExists) {
    const { data: childCandidates } = await client
      .from("products")
      .select("id, name, sku, parent_sku")
      .not("parent_sku", "is", null)
      .limit(500);

    const allMemberProductIds = new Set(
      (allFamilies ?? []).flatMap((f) =>
        (f.product_family_members as Array<{ member_product_id: string | null; active: boolean }> ?? [])
          .filter((m) => m.active)
          .map((m) => m.member_product_id)
          .filter(Boolean),
      ) as string[],
    );

    orphanProducts = (childCandidates ?? [])
      .filter((p) => !allMemberProductIds.has(p.id))
      .map((p) => ({ id: p.id, name: p.name as string, sku: p.sku as string, parent_sku: p.parent_sku as string }));
  }

  // ── Potential groupings preview (for cases with zero existing families) ─────
  const { data: publishedProducts } = await client
    .from("products")
    .select("id, name, sku, parent_sku, status")
    .eq("status", "publish")
    .limit(5000);

  const activeMemberSet = new Set<string>(
    (allFamilies ?? []).flatMap((f) =>
      (f.product_family_members as Array<{ member_product_id: string | null; active: boolean }> ?? [])
        .filter((m) => m.active)
        .map((m) => m.member_product_id)
        .filter(Boolean),
    ) as string[],
  );

  const products: ProductLite[] = (publishedProducts ?? []).map((p) => ({
    id: p.id as string,
    name: p.name as string,
    sku: (p.sku as string | null) ?? null,
    parent_sku: (p.parent_sku as string | null) ?? null,
    status: (p.status as string) ?? "publish",
  }));

  const suggestPreview = computeFamilySuggestions(products, "auto", activeMemberSet, 12);

  // ── Total counts ─────────────────────────────────────────────────────────────
  const { count: totalFamilies } = await client
    .from("product_families")
    .select("id", { count: "exact", head: true })
    .eq("active", true);

  const { count: pendingCandidates } = await client
    .from("product_family_candidates")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");

  return NextResponse.json({
    total_active_families: totalFamilies ?? 0,
    pending_candidates: pendingCandidates ?? 0,
    parents_without_children: parentsWithoutChildren,
    orphan_products: orphanProducts.slice(0, 100),
    large_families: largeFamilies,
    potential_suggestions: suggestPreview.suggestions.length,
    potential_breakdown: suggestPreview.breakdown,
    potential_examples: suggestPreview.suggestions.slice(0, 5),
    issues: parentsWithoutChildren.length + orphanProducts.length + largeFamilies.length,
  });
}
