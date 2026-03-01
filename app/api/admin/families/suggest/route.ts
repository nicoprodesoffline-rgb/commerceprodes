/**
 * POST /api/admin/families/suggest
 * Suggest family groupings using configured strategy.
 * Primary: parent_sku matching. Fallback: sku_root / title similarity scoring.
 */
import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "lib/admin/auth";
import { checkFamiliesDb, degradedResponse } from "lib/admin/families-db";
import { supabaseServer } from "lib/supabase/client";

export async function POST(req: NextRequest) {
  if (!checkAdminAuth(req)) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const db = await checkFamiliesDb();
  if (!db.available) return NextResponse.json(degradedResponse(db), { status: 503 });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty body ok */ }

  const strategy = typeof body.strategy === "string" ? body.strategy : "parent_sku";
  const limit = Math.min(200, Math.max(1, Number(body.limit) || 50));
  const client = supabaseServer();

  // ── Strategy 1: parent_sku ───────────────────────────────────────────────────
  if (strategy === "parent_sku") {
    // Products that have parent_sku set (children imported from Woo)
    const { data: children, error } = await client
      .from("products")
      .select("id, name, sku, parent_sku, status")
      .not("parent_sku", "is", null)
      .limit(limit * 5);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Group by parent_sku
    const groups: Record<string, typeof children> = {};
    for (const p of children ?? []) {
      const key = p.parent_sku as string;
      if (!groups[key]) groups[key] = [];
      (groups[key] as typeof children).push(p);
    }

    // For each group, find if parent exists
    const suggestions = [];
    for (const [pSku, members] of Object.entries(groups)) {
      if (!members || members.length === 0) continue;
      const { data: parent } = await client
        .from("products")
        .select("id, name, sku, slug")
        .eq("sku", pSku)
        .single();

      if (!parent) continue;

      // Store as candidates
      const candidates = members.map((m) => ({
        suggested_parent_id: parent.id,
        suggested_child_id: m.id,
        strategy: "parent_sku",
        score: 100,
        reasons: JSON.stringify([`parent_sku=${pSku}`]),
        status: "pending",
      }));

      // Upsert candidates
      await client.from("product_family_candidates").upsert(candidates as never, {
        onConflict: "suggested_parent_id,suggested_child_id",
      }).then(() => {});

      suggestions.push({
        parent: { id: parent.id, name: parent.name, sku: parent.sku },
        children: members.map((m) => ({ id: m.id, name: m.name, sku: m.sku })),
        strategy: "parent_sku",
        score: 100,
        reasons: [`parent_sku=${pSku}`],
      });
    }

    return NextResponse.json({ suggestions: suggestions.slice(0, limit), strategy, total: suggestions.length });
  }

  // ── Strategy 2: sku_root (shared SKU prefix) ─────────────────────────────────
  if (strategy === "sku_root") {
    const { data: prods } = await client
      .from("products")
      .select("id, name, sku, status")
      .not("sku", "is", null)
      .limit(1000);

    const groups: Record<string, typeof prods> = {};
    for (const p of prods ?? []) {
      if (!p.sku) continue;
      // Take SKU prefix up to last hyphen segment if numeric
      const parts = p.sku.split("-");
      const lastPart = parts[parts.length - 1] ?? "";
      const prefix = /^\d+$/.test(lastPart) ? parts.slice(0, -1).join("-") : p.sku;
      if (prefix.length < 3) continue;
      if (!groups[prefix]) groups[prefix] = [];
      groups[prefix]!.push(p);
    }

    const suggestions = Object.entries(groups)
      .filter(([, m]) => m && m.length >= 2)
      .slice(0, limit)
      .map(([prefix, members]) => ({
        parent: members![0],
        children: members!.slice(1),
        strategy: "sku_root",
        score: 70,
        reasons: [`sku_root=${prefix}`],
      }));

    return NextResponse.json({ suggestions, strategy, total: suggestions.length });
  }

  return NextResponse.json({ error: "Strategy non supportée: " + strategy }, { status: 400 });
}
