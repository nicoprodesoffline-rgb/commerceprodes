import { NextResponse } from "next/server";
import { supabase } from "lib/supabase/client";

export async function GET() {
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
