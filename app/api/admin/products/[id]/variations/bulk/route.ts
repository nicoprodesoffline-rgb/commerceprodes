/**
 * POST /api/admin/products/[id]/variations/bulk
 * Bulk actions on variations.
 *
 * Actions supported:
 *   activate | deactivate | set_stock_status | set_price | price_discount | price_increase
 *   set_eco_contribution | set_min_quantity | set_max_quantity | set_group_of
 *   set_supplier_ref | set_supplier_name | set_supplier_price | archive
 */
import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "lib/admin/auth";
import { checkVariationsDb } from "lib/admin/families-db";
import { log } from "lib/logger";
import { supabaseServer } from "lib/supabase/client";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const VALID_ACTIONS = new Set([
  "activate",
  "deactivate",
  "set_stock_status",
  "set_price",
  "price_discount",
  "price_increase",
  "set_eco_contribution",
  "set_min_quantity",
  "set_max_quantity",
  "set_group_of",
  "set_supplier_ref",
  "set_supplier_name",
  "set_supplier_price",
  "archive",
]);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!checkAdminAuth(req))
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const { id } = await params;
  if (!UUID_RE.test(id))
    return NextResponse.json({ error: "ID invalide" }, { status: 400 });

  let body: { variant_ids: string[]; action: string; value?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const variantIds = (body.variant_ids ?? []).filter(
    (x) => typeof x === "string" && UUID_RE.test(x),
  );
  if (variantIds.length === 0)
    return NextResponse.json({ error: "variant_ids requis" }, { status: 400 });

  const action = body.action;
  if (!VALID_ACTIONS.has(action))
    return NextResponse.json(
      { error: `Action inconnue: ${action}` },
      { status: 400 },
    );

  const client = supabaseServer();
  const dbStatus = await checkVariationsDb();
  let updates: Record<string, unknown> | null = null;

  switch (action) {
    case "activate":
      updates = dbStatus.available
        ? { active_flag: true, status: "publish" }
        : { status: "publish" };
      break;
    case "deactivate":
      updates = dbStatus.available
        ? { active_flag: false }
        : { status: "draft" };
      break;
    case "archive":
      updates = { status: "private" };
      break;
    case "set_stock_status": {
      const v = String(body.value ?? "");
      if (!["instock", "outofstock", "onbackorder"].includes(v)) {
        return NextResponse.json(
          { error: "stock_status invalide" },
          { status: 400 },
        );
      }
      updates = { stock_status: v };
      break;
    }
    case "set_price": {
      const v = Number(body.value);
      if (!Number.isFinite(v) || v < 0)
        return NextResponse.json({ error: "prix invalide" }, { status: 400 });
      updates = { regular_price: v };
      break;
    }
    case "price_discount":
    case "price_increase": {
      const pct = Number(body.value);
      if (!Number.isFinite(pct) || pct <= 0 || pct > 100) {
        return NextResponse.json(
          { error: "Pourcentage invalide (1-100)" },
          { status: 400 },
        );
      }
      const { data: variants } = await client
        .from("variants")
        .select("id, regular_price")
        .in("id", variantIds)
        .eq("product_id", id);
      for (const v of variants ?? []) {
        const base = Number(v.regular_price) || 0;
        const next =
          action === "price_discount"
            ? base * (1 - pct / 100)
            : base * (1 + pct / 100);
        await client
          .from("variants")
          .update({
            regular_price: Math.round(Math.max(0.01, next) * 100) / 100,
          })
          .eq("id", v.id);
      }
      log("info", "admin.variations.bulk", {
        action,
        pct,
        count: variantIds.length,
      });
      return NextResponse.json({ ok: true, updated: variantIds.length });
    }
    case "set_eco_contribution": {
      if (!dbStatus.available)
        return NextResponse.json(
          { error: "Migration 017 requise" },
          { status: 400 },
        );
      const v = Number(body.value);
      if (!Number.isFinite(v) || v < 0)
        return NextResponse.json(
          { error: "eco_contribution invalide" },
          { status: 400 },
        );
      updates = { eco_contribution: v };
      break;
    }
    case "set_min_quantity": {
      if (!dbStatus.available)
        return NextResponse.json(
          { error: "Migration 017 requise" },
          { status: 400 },
        );
      const v = Math.max(1, Math.round(Number(body.value) || 1));
      updates = { min_quantity: v, quantity_rules_enabled: true };
      break;
    }
    case "set_max_quantity": {
      if (!dbStatus.available)
        return NextResponse.json(
          { error: "Migration 017 requise" },
          { status: 400 },
        );
      const v = Number(body.value);
      updates = {
        max_quantity: Number.isFinite(v) && v >= 1 ? Math.round(v) : null,
      };
      break;
    }
    case "set_group_of": {
      if (!dbStatus.available)
        return NextResponse.json(
          { error: "Migration 017 requise" },
          { status: 400 },
        );
      const v = Math.max(1, Math.round(Number(body.value) || 1));
      updates = { group_of_quantity: v };
      break;
    }
    case "set_supplier_ref":
      if (!dbStatus.available)
        return NextResponse.json(
          { error: "Migration 017 requise" },
          { status: 400 },
        );
      updates = {
        supplier_ref:
          String(body.value ?? "")
            .trim()
            .slice(0, 200) || null,
      };
      break;
    case "set_supplier_name":
      if (!dbStatus.available)
        return NextResponse.json(
          { error: "Migration 017 requise" },
          { status: 400 },
        );
      updates = {
        supplier_name:
          String(body.value ?? "")
            .trim()
            .slice(0, 200) || null,
      };
      break;
    case "set_supplier_price": {
      if (!dbStatus.available)
        return NextResponse.json(
          { error: "Migration 017 requise" },
          { status: 400 },
        );
      const v = Number(body.value);
      if (!Number.isFinite(v) || v < 0)
        return NextResponse.json({ error: "prix invalide" }, { status: 400 });
      updates = { supplier_purchase_price: v };
      break;
    }
  }

  if (updates) {
    const { error } = await client
      .from("variants")
      .update(updates)
      .in("id", variantIds)
      .eq("product_id", id);
    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });
  }

  log("info", "admin.variations.bulk", {
    action,
    count: variantIds.length,
    product_id: id,
  });
  return NextResponse.json({ ok: true, updated: variantIds.length });
}
