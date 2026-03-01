import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "lib/admin/auth";
import { supabaseServer } from "lib/supabase/client";

// Whitelist of allowed site_config keys that admins may set via this endpoint.
// ia_control_center is managed by the dedicated /api/admin/ia/control-center route.
const ALLOWED_KEYS = new Set([
  "site_name",
  "contact_email",
  "contact_phone",
  "address",
  "siret",
  "tva_number",
  "footer_text",
  "meta_title",
  "meta_description",
  "og_image_url",
  "devis_intro",
  "devis_footer",
  "homepage_hero_title",
  "homepage_hero_subtitle",
  "homepage_hero_cta",
]);

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
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }
  const { key, value } = body;
  if (!key || typeof key !== "string") return NextResponse.json({ error: "key manquant" }, { status: 400 });
  if (!ALLOWED_KEYS.has(key)) {
    return NextResponse.json({ error: `Clé non autorisée: ${key}` }, { status: 400 });
  }
  if (typeof value !== "string") {
    return NextResponse.json({ error: "value doit être une chaîne" }, { status: 400 });
  }
  if (value.length > 5000) {
    return NextResponse.json({ error: "value trop longue (max 5000)" }, { status: 400 });
  }

  const client = supabaseServer();
  const { error } = await client
    .from("site_config")
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  console.log(JSON.stringify({ event: "admin.site_config.update", key }));
  return NextResponse.json({ ok: true });
}
