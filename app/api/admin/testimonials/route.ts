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
  const body = await req.json();
  const client = supabaseServer();
  const { data, error } = await client
    .from("testimonials")
    .insert({ author: body.author, role: body.role, content: body.content, rating: body.rating ?? 5 })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ testimonial: data });
}
