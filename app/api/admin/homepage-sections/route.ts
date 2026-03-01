import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "lib/admin/auth";
import { supabaseServer } from "lib/supabase/client";

export async function GET(req: NextRequest) {
  if (!checkAdminAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const client = supabaseServer();
  const { data } = await client
    .from("homepage_sections")
    .select("*")
    .order("position", { ascending: true });
  return NextResponse.json({ sections: data ?? [] });
}

export async function POST(req: NextRequest) {
  if (!checkAdminAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const client = supabaseServer();
  const { data, error } = await client
    .from("homepage_sections")
    .insert({
      title: body.title,
      intro: body.intro ?? null,
      product_ids: body.product_ids ?? [],
      position: body.position ?? 0,
      active: body.active ?? true,
      expires_at: body.expires_at ?? null,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ section: data });
}

export async function PATCH(req: NextRequest) {
  if (!checkAdminAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const { id, ...update } = body;
  if (!id) return NextResponse.json({ error: "id manquant" }, { status: 400 });
  const client = supabaseServer();
  const { error } = await client.from("homepage_sections").update(update).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
