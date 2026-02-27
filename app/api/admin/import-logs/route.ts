import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "lib/supabase/client";
import { timingSafeEqual } from "crypto";

function checkAuth(req: NextRequest): boolean {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace("Bearer ", "");
  const expected = process.env.ADMIN_PASSWORD ?? "";
  if (!token || !expected || token.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const client = supabaseServer();
  const { data } = await client
    .from("import_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(20);
  return NextResponse.json({ logs: data ?? [] });
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
