import { NextRequest, NextResponse } from "next/server";
import { supabase } from "lib/supabase/client";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const { orderId } = await params;
  if (!orderId) {
    return NextResponse.json({ error: "ID manquant" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("devis_requests")
    .select("id, status, created_at, name, items_json, total_ht")
    .eq("id", orderId)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Commande introuvable" }, { status: 404 });
  }

  return NextResponse.json({ order: data });
}
