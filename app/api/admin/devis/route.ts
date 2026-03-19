import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "lib/admin/auth";
import { safeErrorMessage } from "lib/admin/security";
import { supabaseServer } from "lib/supabase/client";

export async function GET(request: NextRequest) {
  if (!checkAdminAuth(request)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const url = new URL(request.url);
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") || 10)));

  try {
    const client = supabaseServer();
    const [rowsRes, totalRes] = await Promise.all([
      client
        .from("devis_requests")
        .select("id, nom, email, produit, sku, status, created_at")
        .order("created_at", { ascending: false })
        .limit(limit),
      client.from("devis_requests").select("id", { count: "exact", head: true }),
    ]);

    if (rowsRes.error) {
      throw rowsRes.error;
    }

    return NextResponse.json({
      total: totalRes.count ?? 0,
      items: rowsRes.data ?? [],
    });
  } catch (error) {
    return NextResponse.json(
      { error: safeErrorMessage(error, "Impossible de charger les devis") },
      { status: 500 },
    );
  }
}
