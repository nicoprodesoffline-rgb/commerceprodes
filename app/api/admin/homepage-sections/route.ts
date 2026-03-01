import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "lib/admin/auth";
import { supabaseServer } from "lib/supabase/client";

function safeTrim(v: unknown, max = 500): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function safeInt(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : fallback;
}

function safeBool(v: unknown, fallback: boolean): boolean {
  if (typeof v === "boolean") return v;
  return fallback;
}

function safeDate(v: unknown): string | null {
  if (!v || typeof v !== "string") return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function safeProductIds(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((id) => typeof id === "string" && id.length > 0).slice(0, 200);
}

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
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }
  const title = safeTrim(body.title, 200);
  if (!title) return NextResponse.json({ error: "title requis" }, { status: 400 });

  const client = supabaseServer();
  const { data, error } = await client
    .from("homepage_sections")
    .insert({
      title,
      intro: safeTrim(body.intro, 1000) || null,
      product_ids: safeProductIds(body.product_ids),
      position: safeInt(body.position, 0),
      active: safeBool(body.active, true),
      expires_at: safeDate(body.expires_at),
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  console.log(JSON.stringify({ event: "admin.homepage_section.create", title, id: data?.id }));
  return NextResponse.json({ section: data });
}

export async function PATCH(req: NextRequest) {
  if (!checkAdminAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }
  const id = body.id;
  if (!id || typeof id !== "string") return NextResponse.json({ error: "id manquant" }, { status: 400 });

  // Whitelist only allowed fields
  const update: Record<string, unknown> = {};
  if (body.title != null) {
    const t = safeTrim(body.title, 200);
    if (!t) return NextResponse.json({ error: "title invalide" }, { status: 400 });
    update.title = t;
  }
  if (body.intro != null) update.intro = safeTrim(body.intro, 1000) || null;
  if (body.product_ids != null) update.product_ids = safeProductIds(body.product_ids);
  if (body.position != null) update.position = safeInt(body.position, 0);
  if (body.active != null) update.active = safeBool(body.active, true);
  if (body.expires_at != null) update.expires_at = safeDate(body.expires_at);

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Aucun champ valide" }, { status: 400 });
  }

  const client = supabaseServer();
  const { error } = await client.from("homepage_sections").update(update).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  console.log(JSON.stringify({ event: "admin.homepage_section.update", id, fields: Object.keys(update) }));
  return NextResponse.json({ ok: true });
}
