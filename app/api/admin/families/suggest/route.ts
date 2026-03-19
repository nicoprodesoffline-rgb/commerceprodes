/**
 * POST /api/admin/families/suggest
 * Suggest family groupings using configured strategy.
 * Supports:
 * - parent_sku: exact Woo parent_sku links
 * - sku_root: shared SKU root
 * - title_root: normalized title clustering
 * - auto: merge all and rank
 */
import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "lib/admin/auth";
import { checkFamiliesDb, degradedResponse } from "lib/admin/families-db";
import { supabaseServer } from "lib/supabase/client";
import {
  computeFamilySuggestions,
  type FamilySuggestStrategy,
  type ProductLite,
} from "lib/admin/family-suggest";

const ALLOWED_STRATEGIES: FamilySuggestStrategy[] = [
  "auto",
  "parent_sku",
  "sku_root",
  "title_root",
];

export async function POST(req: NextRequest) {
  if (!checkAdminAuth(req)) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const db = await checkFamiliesDb();
  if (!db.available) return NextResponse.json(degradedResponse(db), { status: 503 });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty body ok */ }

  const requestedStrategy =
    typeof body.strategy === "string" && ALLOWED_STRATEGIES.includes(body.strategy as FamilySuggestStrategy)
      ? (body.strategy as FamilySuggestStrategy)
      : "auto";
  const limit = Math.min(200, Math.max(1, Number(body.limit) || 50));
  const importScope =
    body.import_scope === "latest_import" || body.import_scope === "latest"
      ? "latest_import"
      : "all";
  const client = supabaseServer();

  let sinceIso: string | null = null;
  if (importScope === "latest_import") {
    const latestImport = await client
      .from("import_logs")
      .select("created_at")
      .in("status", ["pending", "processing", "done"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!latestImport.error && latestImport.data?.created_at) {
      sinceIso = String(latestImport.data.created_at);
    }
  }

  let productsQuery = client
    .from("products")
    .select("id, name, sku, parent_sku, status")
    .eq("status", "publish")
    .limit(5000);
  if (sinceIso) {
    productsQuery = productsQuery.gte("updated_at", sinceIso);
  }

  const { data: allProducts, error: productsError } = await productsQuery;
  if (productsError) return NextResponse.json({ error: productsError.message }, { status: 500 });

  const { data: activeMembers } = await client
    .from("product_family_members")
    .select("member_product_id")
    .eq("active", true)
    .not("member_product_id", "is", null);
  const excludedChildren = new Set<string>(
    (activeMembers ?? []).map((m) => m.member_product_id as string).filter(Boolean),
  );

  const products: ProductLite[] = (allProducts ?? []).map((p) => ({
    id: p.id as string,
    name: p.name as string,
    sku: (p.sku as string | null) ?? null,
    parent_sku: (p.parent_sku as string | null) ?? null,
    status: (p.status as string) ?? "publish",
  }));

  const { suggestions, strategy_used, breakdown } = computeFamilySuggestions(
    products,
    requestedStrategy,
    excludedChildren,
    limit,
  );

  // Rebuild pending candidates snapshot for transparency in audit.
  const activeStrategies = suggestions.map((s) => s.strategy);
  const uniqueStrategies = [...new Set(activeStrategies)];
  if (uniqueStrategies.length > 0) {
    await client
      .from("product_family_candidates")
      .delete()
      .eq("status", "pending")
      .in("strategy", uniqueStrategies as ("parent_sku" | "sku_root" | "title_root" | "manual")[]);
  }

  const candidateRows = suggestions.flatMap((s) =>
    s.children.map((child) => ({
      suggested_parent_id: s.parent.id,
      suggested_child_id: child.id,
      strategy: s.strategy,
      score: s.score,
      reasons: s.reasons,
      status: "pending",
    })),
  );

  if (candidateRows.length > 0) {
    const { error: insertError } = await client.from("product_family_candidates").insert(candidateRows as never);
    if (insertError) {
      // Non-blocking: suggestions are still returned to the UI even if candidate snapshot fails.
      console.error("admin.family.suggest.candidates_insert_failed", insertError);
    }
  }

  return NextResponse.json({
    suggestions,
    strategy: strategy_used,
    total: suggestions.length,
    breakdown,
    excluded_already_grouped: excludedChildren.size,
    scope: {
      mode: importScope,
      since: sinceIso,
      products_considered: products.length,
    },
  });
}
