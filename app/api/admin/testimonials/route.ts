import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "lib/admin/auth";
import { supabaseServer } from "lib/supabase/client";

export async function GET(req: NextRequest) {
  if (!checkAdminAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const client = supabaseServer();
  const { data } = await client
    .from("testimonials")
    .select("*")
    .order("created_at", { ascending: false });
  return NextResponse.json({ testimonials: data ?? [] });
}

export async function POST(req: NextRequest) {
  if (!checkAdminAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const author = typeof body.author === "string" ? body.author.trim().slice(0, 200) : "";
  const role = typeof body.role === "string" ? body.role.trim().slice(0, 200) : "";
  const content = typeof body.content === "string" ? body.content.trim().slice(0, 2000) : "";
  const rating = Math.min(5, Math.max(1, Math.round(Number(body.rating) || 5)));

  if (!author || !content) {
    return NextResponse.json({ error: "author et content requis" }, { status: 400 });
  }

  const client = supabaseServer();
  const { data, error } = await client
    .from("testimonials")
    .insert({ author, role: role || null, content, rating })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  console.log(JSON.stringify({ event: "admin.testimonial.create", id: data?.id, author }));
  return NextResponse.json({ testimonial: data });
}
