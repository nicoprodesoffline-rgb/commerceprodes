/**
 * PATCH /api/admin/products/[id]/default-attributes
 * Set the default attribute values for a variable product.
 * Stored in products.default_attribute_values (jsonb, migration 017).
 */
import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "lib/admin/auth";
import { checkVariationsDb } from "lib/admin/families-db";
import { log } from "lib/logger";
import { supabaseServer } from "lib/supabase/client";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!checkAdminAuth(req))
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const { id } = await params;
  if (!UUID_RE.test(id))
    return NextResponse.json({ error: "ID invalide" }, { status: 400 });

  const dbStatus = await checkVariationsDb();

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const defaults = body.defaults;
  if (!defaults || typeof defaults !== "object" || Array.isArray(defaults)) {
    return NextResponse.json(
      { error: "defaults (objet) requis" },
      { status: 400 },
    );
  }

  // Sanitize: only string values
  const sanitized: Record<string, string> = {};
  for (const [k, v] of Object.entries(defaults as Record<string, unknown>)) {
    if (typeof k === "string" && k.length <= 100 && typeof v === "string") {
      sanitized[k.trim()] = v.trim().slice(0, 200);
    }
  }

  const client = supabaseServer();

  if (dbStatus.available) {
    // Use new jsonb column
    const { data, error } = await client
      .from("products")
      .update({ default_attribute_values: sanitized })
      .eq("id", id)
      .select("id, default_attribute_values")
      .single();

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });
    log("info", "admin.product.default_attributes", {
      id,
      count: Object.keys(sanitized).length,
    });
    return NextResponse.json({
      ok: true,
      defaults: data?.default_attribute_values ?? sanitized,
    });
  } else {
    // Degraded: store in meta if possible, or just return ok with warning
    return NextResponse.json({
      ok: true,
      defaults: sanitized,
      warning:
        "Colonne default_attribute_values absente — appliquez la migration 017",
    });
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!checkAdminAuth(req))
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const { id } = await params;
  if (!UUID_RE.test(id))
    return NextResponse.json({ error: "ID invalide" }, { status: 400 });

  const dbStatus = await checkVariationsDb();
  const client = supabaseServer();

  if (dbStatus.available) {
    const { data } = await client
      .from("products")
      .select("default_attribute_values")
      .eq("id", id)
      .single();
    return NextResponse.json({
      defaults: data?.default_attribute_values ?? {},
    });
  }

  return NextResponse.json({
    defaults: {},
    warning: "Migration 017 non appliquée",
  });
}
