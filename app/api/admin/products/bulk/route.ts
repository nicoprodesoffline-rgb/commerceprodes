import { NextRequest, NextResponse } from "next/server";

function checkAuth(req: NextRequest): boolean {
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace("Bearer ", "");
  return token === (process.env.ADMIN_PASSWORD ?? "");
}

// UUID v4 pattern
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  let body: { ids: string[]; action: string; value?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const { ids, action, value } = body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "IDs requis" }, { status: 400 });
  }
  if (!ids.every((id) => UUID_RE.test(id))) {
    return NextResponse.json({ error: "IDs invalides" }, { status: 400 });
  }

  try {
    const { supabaseServer } = await import("lib/supabase/client");
    const client = supabaseServer();

    let updates: Record<string, unknown> | null = null;

    if (action === "publish") {
      updates = { status: "publish" };
    } else if (action === "draft") {
      updates = { status: "draft" };
    } else if (action === "price_discount" || action === "price_increase") {
      const pct = Number(value);
      if (isNaN(pct) || pct <= 0 || pct > 100) {
        return NextResponse.json({ error: "Pourcentage invalide (1-100)" }, { status: 400 });
      }
      // Fetch current prices
      const { data: prods } = await client.from("products").select("id, regular_price").in("id", ids);
      for (const p of prods ?? []) {
        const base = Number(p.regular_price) || 0;
        const newPrice = action === "price_discount"
          ? Math.max(0.01, base * (1 - pct / 100))
          : base * (1 + pct / 100);
        await client.from("products").update({ regular_price: Math.round(newPrice * 100) / 100 }).eq("id", p.id);
      }
      console.log(JSON.stringify({ event: "admin.bulk.price", action, pct, count: ids.length }));
      return NextResponse.json({ success: true, updated: ids.length });
    } else if (action === "change_category") {
      updates = {};
      // Insert product_categories rows (simplified: replace primary cat)
      for (const pid of ids) {
        await client.from("product_categories").upsert({ product_id: pid, category_id: value });
      }
      console.log(JSON.stringify({ event: "admin.bulk.category", category_id: value, count: ids.length }));
      return NextResponse.json({ success: true, updated: ids.length });
    } else {
      return NextResponse.json({ error: "Action inconnue" }, { status: 400 });
    }

    if (updates) {
      await client.from("products").update(updates).in("id", ids);
    }

    console.log(JSON.stringify({ event: "admin.bulk", action, count: ids.length }));
    return NextResponse.json({ success: true, updated: ids.length });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
