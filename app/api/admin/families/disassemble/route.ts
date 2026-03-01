/**
 * POST /api/admin/families/disassemble
 * Remove members from a family or deactivate an entire family.
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

  const family_id = body.family_id;
  if (!family_id || typeof family_id !== "string" || !UUID_RE.test(family_id)) {
    return NextResponse.json({ error: "family_id UUID requis" }, { status: 400 });
  }

  const client = supabaseServer();

  // If member_ids provided: remove specific members
  if (Array.isArray(body.member_ids) && body.member_ids.length > 0) {
    const ids = (body.member_ids as unknown[]).filter((x): x is string => typeof x === "string" && UUID_RE.test(x));
    const { error } = await client
      .from("product_family_members")
      .update({ active: false })
      .eq("family_id", family_id)
      .in("id", ids);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    console.log(JSON.stringify({ event: "admin.family.disassemble_members", family_id, count: ids.length }));
    return NextResponse.json({ ok: true, removed: ids.length });
  }

  // Otherwise deactivate the entire family
  const { error } = await client
    .from("product_families")
    .update({ active: false })
    .eq("id", family_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  console.log(JSON.stringify({ event: "admin.family.disassemble", family_id }));
  return NextResponse.json({ ok: true });
}
