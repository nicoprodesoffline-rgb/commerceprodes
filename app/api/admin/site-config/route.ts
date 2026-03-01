import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "lib/admin/auth";
import { supabaseServer } from "lib/supabase/client";

export async function GET(req: NextRequest) {
  if (!checkAdminAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const client = supabaseServer();
  const { data } = await client.from("site_config").select("key, value");
  const config: Record<string, string> = {};
  for (const row of data ?? []) {
    config[row.key] = row.value ?? "";
  }
  return NextResponse.json({ config });
}

export async function PATCH(req: NextRequest) {
  if (!checkAdminAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { key, value } = await req.json();
  if (!key) return NextResponse.json({ error: "key manquant" }, { status: 400 });
  const client = supabaseServer();
  const { error } = await client
    .from("site_config")
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
