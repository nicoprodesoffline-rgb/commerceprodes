import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "lib/admin/auth";
import { safeErrorMessage } from "lib/admin/security";
import { supabaseServer } from "lib/supabase/client";

export async function GET(request: NextRequest) {
  if (!checkAdminAuth(request)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  try {
    const client = supabaseServer();
    const [productsRes, publishedRes, draftRes, variantsRes] =
      await Promise.all([
        client.from("products").select("id", { count: "exact", head: true }),
        client
          .from("products")
          .select("id", { count: "exact", head: true })
          .eq("status", "publish"),
        client
          .from("products")
          .select("id", { count: "exact", head: true })
          .neq("status", "publish"),
        client.from("variants").select("id", { count: "exact", head: true }),
      ]);

    return NextResponse.json({
      total_products: productsRes.count ?? 0,
      published_products: publishedRes.count ?? 0,
      non_published_products: draftRes.count ?? 0,
      total_variants: variantsRes.count ?? 0,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: safeErrorMessage(
          error,
          "Impossible de charger le statut produits",
        ),
      },
      { status: 500 },
    );
  }
}
