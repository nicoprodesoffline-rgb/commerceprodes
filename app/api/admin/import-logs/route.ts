import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "lib/admin/auth";
import { supabaseServer } from "lib/supabase/client";

export async function GET(req: NextRequest) {
  if (!checkAdminAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const client = supabaseServer();
  const { data } = await client
    .from("import_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(20);
  return NextResponse.json({ logs: data ?? [] });
}

export async function POST(req: NextRequest) {
  if (!checkAdminAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const client = supabaseServer();
  const { data, error } = await client
    .from("import_logs")
    .insert({
      filename: body.filename,
      file_url: body.file_url,
      status: "pending",
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id });
}
