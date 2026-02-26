import { NextResponse } from "next/server";

export async function GET() {
  try {
    const { supabaseServer } = await import("lib/supabase/client");
    const client = supabaseServer();

    const { data, error } = await client
      .from("products")
      .select(
        `id, sku, name, regular_price, status,
         product_categories(categories(name)),
         variants(id)`,
      )
      .eq("status", "publish")
      .order("name", { ascending: true })
      .limit(10000);

    if (error) throw error;

    const rows = (data || []).map((p: any) => {
      const categories = (p.product_categories || [])
        .map((pc: any) => pc.categories?.name)
        .filter(Boolean)
        .join(" | ");
      const variantCount = (p.variants || []).length;
      const price = p.regular_price ?? "";

      return [
        p.id,
        p.sku ?? "",
        `"${(p.name ?? "").replace(/"/g, '""')}"`,
        price,
        p.status,
        `"${categories.replace(/"/g, '""')}"`,
        variantCount,
      ].join(",");
    });

    const header = "id,sku,titre,prix_ht,statut,categories,nb_variants";
    const csv = [header, ...rows].join("\n");

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="produits-prodes.csv"',
      },
    });
  } catch (err) {
    console.error("export-products error", err);
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}
