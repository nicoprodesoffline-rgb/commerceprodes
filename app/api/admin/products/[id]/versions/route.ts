import { NextRequest, NextResponse } from "next/server";
import { guardRole } from "lib/admin/rbac";
import { supabaseServer } from "lib/supabase/client";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { denied } = guardRole(req, "viewer");
  if (denied) return denied;

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "ID invalide" }, { status: 400 });
  }

  const client = supabaseServer();
  const { data, error } = await client
    .from("product_versions")
    .select("id, product_id, version_num, snapshot, changed_by, change_note, created_at")
    .eq("product_id", id)
    .order("version_num", { ascending: false })
    .limit(20);

  if (error?.code === "42P01") {
    return NextResponse.json({ versions: [], degraded: true, reason: "Table absente — appliquer migration 013" });
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ versions: data ?? [] });
}
