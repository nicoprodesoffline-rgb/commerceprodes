import { NextRequest, NextResponse } from "next/server";

function checkAuth(req: NextRequest): boolean {
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace("Bearer ", "");
  return token === (process.env.ADMIN_PASSWORD ?? "");
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  try {
    const { supabaseServer } = await import("lib/supabase/client");
    const client = supabaseServer();

    const [noDesc, noPrice, noImage, noCat, noSku] = await Promise.allSettled([
      client
        .from("products")
        .select("id, name, slug", { count: "exact" })
        .eq("status", "publish")
        .or("short_description.is.null,short_description.eq."),
      client
        .from("products")
        .select("id, name, slug", { count: "exact" })
        .eq("status", "publish")
        .or("regular_price.is.null,regular_price.eq.0"),
      client
        .from("products")
        .select("id, name, slug", { count: "exact" })
        .eq("status", "publish")
        .or("featured_image_url.is.null,featured_image_url.eq."),
      client
        .from("products")
        .select("id, name, slug", { count: "exact" })
        .eq("status", "publish")
        .is("sku", null),
      client
        .from("products")
        .select("id, name, slug", { count: "exact" })
        .eq("status", "publish")
        .is("short_description", null),
    ] as const);

    function extract(r: (typeof noDesc)) {
      if (r.status === "fulfilled") {
        return {
          count: (r.value as any).count ?? 0,
          items: ((r.value as any).data ?? []).slice(0, 50).map((p: any) => ({
            id: p.id,
            title: p.name,
            handle: p.slug,
          })),
        };
      }
      return { count: 0, items: [] };
    }

    return NextResponse.json({
      noDescription: extract(noDesc),
      noPrice: extract(noPrice),
      noImage: extract(noImage),
      noCategory: extract(noCat),
      noSku: extract(noSku),
    });
  } catch (err) {
    console.error("ia.audit error", err);
    return NextResponse.json({ error: "Erreur audit" }, { status: 500 });
  }
}
