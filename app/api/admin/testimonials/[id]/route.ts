import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "lib/admin/auth";
import { safeErrorMessage } from "lib/admin/security";
import { supabaseServer } from "lib/supabase/client";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!checkAdminAuth(req))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json();
  const allowed = ["active", "author", "role", "content", "rating"] as const;
  const update: Record<string, unknown> = {};
  for (const k of allowed) {
    if (k in body) update[k] = body[k];
  }
  const client = supabaseServer();
  const { error } = await client
    .from("testimonials")
    .update(update)
    .eq("id", id);
  if (error)
    return NextResponse.json(
      { error: safeErrorMessage(error) },
      { status: 500 },
    );
  return NextResponse.json({ ok: true });
}
