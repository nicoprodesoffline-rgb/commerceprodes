import { NextRequest, NextResponse } from "next/server";

function checkAuth(req: NextRequest): boolean {
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace("Bearer ", "");
  return (
    token === (process.env.ADMIN_PASSWORD ?? "") ||
    token === (process.env.N8N_WEBHOOK_SECRET ?? "")
  );
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  let body: {
    sku: string;
    ourPrice: number;
    competitorName: string;
    competitorPrice: number;
    competitorUrl?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const priceDiff = body.ourPrice - body.competitorPrice;
  const priceDiffPct =
    body.competitorPrice > 0
      ? ((priceDiff / body.competitorPrice) * 100)
      : 0;

  try {
    const { supabaseServer } = await import("lib/supabase/client");
    const client = supabaseServer();

    await client.from("competitor_prices").insert({
      our_sku: body.sku,
      our_price: body.ourPrice,
      competitor_name: body.competitorName,
      competitor_price: body.competitorPrice,
      competitor_url: body.competitorUrl,
      price_diff: Math.round(priceDiff * 100) / 100,
      price_diff_pct: Math.round(priceDiffPct * 100) / 100,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  try {
    const { supabaseServer } = await import("lib/supabase/client");
    const client = supabaseServer();

    const { data, error } = await client
      .from("competitor_prices")
      .select("*")
      .order("scraped_at", { ascending: false })
      .limit(500);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Group by SKU + competitor — keep latest per pair
    const seen = new Set<string>();
    const grouped = (data ?? []).filter((row: any) => {
      const key = `${row.our_sku}__${row.competitor_name}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return NextResponse.json({ data: grouped });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
