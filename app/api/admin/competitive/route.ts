import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "lib/admin/auth";
import { log } from "lib/logger";
import { safeErrorMessage } from "lib/admin/security";

function checkAuth(req: NextRequest): boolean {
  if (checkAdminAuth(req)) return true;
  // Also accept N8N webhook secret
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  return token === (process.env.N8N_WEBHOOK_SECRET ?? "");
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
    body.competitorPrice > 0 ? (priceDiff / body.competitorPrice) * 100 : 0;

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
    log("error", "admin.competitive.insert_failed", { error: String(err) });
    return NextResponse.json({ error: safeErrorMessage(err) }, { status: 500 });
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
      log("error", "admin.competitive.fetch_failed", { error: error.message });
      return NextResponse.json(
        { error: safeErrorMessage(error) },
        { status: 500 },
      );
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
    log("error", "admin.competitive.get_failed", { error: String(err) });
    return NextResponse.json({ error: safeErrorMessage(err) }, { status: 500 });
  }
}
