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

  const days = 7;

  try {
    const { supabaseServer } = await import("lib/supabase/client");
    const client = supabaseServer();

    const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();

    const [viewsRes, cartRes, topRes] = await Promise.allSettled([
      // Vues par jour (7 derniers jours)
      client
        .from("product_views")
        .select("created_at")
        .gte("created_at", since),

      // Événements panier par type
      client
        .from("cart_events")
        .select("event_type, created_at")
        .gte("created_at", since),

      // Top produits vus
      client
        .from("product_views")
        .select("product_handle")
        .gte("created_at", since)
        .limit(200),
    ]);

    // Build daily view counts for the last 7 days
    const dailyViews: Record<string, number> = {};
    for (let i = 0; i < days; i++) {
      const d = new Date(Date.now() - i * 24 * 3600 * 1000);
      const key = d.toISOString().slice(0, 10);
      dailyViews[key] = 0;
    }
    if (viewsRes.status === "fulfilled" && viewsRes.value.data) {
      for (const row of viewsRes.value.data) {
        const key = row.created_at.slice(0, 10);
        if (key in dailyViews) dailyViews[key] = (dailyViews[key] ?? 0) + 1;
      }
    }
    const totalViews = Object.values(dailyViews).reduce((s, v) => s + v, 0);

    // Cart events summary
    let cartAdds = 0;
    let cartRemovals = 0;
    if (cartRes.status === "fulfilled" && cartRes.value.data) {
      for (const row of cartRes.value.data) {
        if (row.event_type === "add") cartAdds++;
        else if (row.event_type === "remove") cartRemovals++;
      }
    }

    // Top products
    const handleCounts: Record<string, number> = {};
    if (topRes.status === "fulfilled" && topRes.value.data) {
      for (const row of topRes.value.data) {
        if (row.product_handle) {
          handleCounts[row.product_handle] = (handleCounts[row.product_handle] ?? 0) + 1;
        }
      }
    }
    const topProducts = Object.entries(handleCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([handle, views]) => ({ handle, views }));

    // dailyViews sorted ascending by date
    const chartData = Object.entries(dailyViews)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, views]) => ({ date, views }));

    return NextResponse.json({
      totalViews,
      cartAdds,
      cartRemovals,
      topProducts,
      chartData,
      days,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
