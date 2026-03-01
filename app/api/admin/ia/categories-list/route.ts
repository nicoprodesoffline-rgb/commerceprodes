import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "lib/admin/auth";
import { supabase } from "lib/supabase/client";

export async function GET(req: NextRequest) {
  if (!checkAdminAuth(req)) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  try {
    const { data, error } = await supabase
      .from("categories")
      .select("id, name, slug")
      .is("parent_id", null)
      .order("name", { ascending: true });

    if (error) throw error;
    return NextResponse.json({ categories: data ?? [] });
  } catch {
    return NextResponse.json({ categories: [] });
  }
}
