import { NextRequest, NextResponse } from "next/server";
import { guardRole } from "lib/admin/rbac";
import { supabaseServer } from "lib/supabase/client";
import { logAdminAction } from "lib/admin/audit-log";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ALLOWED_FIELDS = [
  "name", "sku", "regular_price", "sale_price", "status",
  "short_description", "description", "eco_contribution",
  "seo_title", "seo_description", "stock_status",
];

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { role, denied } = guardRole(req, "superadmin");
  if (denied) return denied;

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "ID invalide" }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const { version_id } = body;
  if (!version_id || typeof version_id !== "string" || !UUID_RE.test(version_id)) {
    return NextResponse.json({ error: "version_id invalide" }, { status: 400 });
  }

  const client = supabaseServer();

  // Fetch the version snapshot
  const { data: version, error: vErr } = await client
    .from("product_versions")
    .select("id, product_id, version_num, snapshot")
    .eq("id", version_id)
    .eq("product_id", id)
    .single();

  if (vErr?.code === "42P01") {
    return NextResponse.json({ error: "Table absente — appliquer migration 013", degraded: true }, { status: 503 });
  }
  if (vErr || !version) {
    return NextResponse.json({ error: "Version introuvable" }, { status: 404 });
  }

  const snapshot = version.snapshot as Record<string, unknown>;

  // Build safe updates from snapshot
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const field of ALLOWED_FIELDS) {
    if (field in snapshot) updates[field] = snapshot[field];
  }

  // Before rollback: save current state as a new version
  const { data: current } = await client
    .from("products")
    .select("id, name, sku, regular_price, status, short_description, description, eco_contribution, seo_title, seo_description, stock_status")
    .eq("id", id)
    .single();

  if (current) {
    const { data: lastV } = await client
      .from("product_versions")
      .select("version_num")
      .eq("product_id", id)
      .order("version_num", { ascending: false })
      .limit(1)
      .single();

    await client.from("product_versions").insert({
      product_id: id,
      version_num: (lastV?.version_num ?? 0) + 1,
      snapshot: current,
      changed_by: "admin",
      change_note: `Pre-rollback snapshot (rollback to v${version.version_num})`,
    });
  }

  // Apply rollback
  const { data: updated, error: uErr } = await client
    .from("products")
    .update(updates)
    .eq("id", id)
    .select("id, name, status")
    .single();

  if (uErr) {
    await logAdminAction({
      role,
      action: "product.rollback",
      entity: "product",
      entity_id: id,
      payload_summary: `Rollback vers version ${version.version_num} — ÉCHEC: ${uErr.message}`,
      success: false,
    });
    return NextResponse.json({ error: uErr.message }, { status: 500 });
  }

  await logAdminAction({
    role,
    action: "product.rollback",
    entity: "product",
    entity_id: id,
    payload_summary: `Rollback vers version ${version.version_num} (id: ${version_id})`,
    success: true,
  });

  return NextResponse.json({ success: true, product: updated, rolled_back_to_version: version.version_num });
}
