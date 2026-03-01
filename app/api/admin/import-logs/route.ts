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
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const filename = typeof body.filename === "string" ? body.filename.trim().slice(0, 255) : "";
  const file_url = typeof body.file_url === "string" ? body.file_url.trim().slice(0, 2000) : "";

  if (!filename) return NextResponse.json({ error: "filename requis" }, { status: 400 });
  if (!file_url) return NextResponse.json({ error: "file_url requis" }, { status: 400 });

  const client = supabaseServer();
  const { data, error } = await client
    .from("import_logs")
    .insert({ filename, file_url, status: "pending" })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  console.log(JSON.stringify({ event: "admin.import_log.create", id: data?.id, filename }));
  return NextResponse.json({ id: data.id });
}
