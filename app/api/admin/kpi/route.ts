import { NextRequest, NextResponse } from "next/server";
import { guardRole } from "lib/admin/rbac";
import { supabaseServer } from "lib/supabase/client";

async function safeCount(client: ReturnType<typeof supabaseServer>, table: string, filter?: Record<string, string | number>): Promise<number | null> {
  try {
    let q = client.from(table).select("id", { count: "exact", head: true });
    if (filter) {
      for (const [k, v] of Object.entries(filter)) {
        q = q.eq(k, v);
      }
    }
    const { count, error } = await q;
    if (error?.code === "42P01") return null; // table doesn't exist
    if (error) return null;
    return count ?? 0;
  } catch {
    return null;
  }
}

async function safeCountSince(
  client: ReturnType<typeof supabaseServer>,
  table: string,
  since: string,
  extra?: Record<string, string>,
): Promise<number | null> {
  try {
    let q = client
      .from(table)
      .select("id", { count: "exact", head: true })
      .gte("created_at", since);
    if (extra) {
      for (const [k, v] of Object.entries(extra)) q = q.eq(k, v);
    }
    const { count, error } = await q;
    if (error?.code === "42P01") return null;
    if (error) return null;
    return count ?? 0;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const { denied } = guardRole(req, "viewer");
  if (denied) return denied;

  const client = supabaseServer();
  const now = new Date();
  const since7d = new Date(now.getTime() - 7 * 86400_000).toISOString();
  const since30d = new Date(now.getTime() - 30 * 86400_000).toISOString();

  const [
    devis7d,
    devis30d,
    devisTotal,
    devisTraites,
    comptes7d,
    comptesTotal,
    savedCarts7d,
    savedCartsTotal,
    products,
  ] = await Promise.all([
    safeCountSince(client, "devis_requests", since7d),
    safeCountSince(client, "devis_requests", since30d),
    safeCount(client, "devis_requests"),
    safeCount(client, "devis_requests", { status: "traite" }),
    safeCountSince(client, "customer_accounts", since7d),
    safeCount(client, "customer_accounts"),
    safeCountSince(client, "saved_carts", since7d),
    safeCount(client, "saved_carts"),
    safeCount(client, "products", { status: "publish" }),
  ]);

  // Top categories
  let topCategories: { name: string; count: number }[] = [];
  try {
    const { data } = await client
      .from("product_categories")
      .select("category_id, categories(name)")
      .limit(100);

    if (data) {
      const counts: Record<string, { name: string; count: number }> = {};
      for (const row of data as unknown as { category_id: string; categories: { name: string } | null }[]) {
        const name = row.categories?.name ?? row.category_id;
        if (!counts[name]) counts[name] = { name, count: 0 };
        counts[name].count++;
      }
      topCategories = Object.values(counts)
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);
    }
  } catch {
    // Not critical
  }

  // Taux traitement
  const tauxTraitement =
    devisTotal && devisTotal > 0 && devisTraites !== null
      ? Math.round((devisTraites / devisTotal) * 100)
      : null;

  return NextResponse.json({
    generated_at: now.toISOString(),
    kpis: {
      devis: {
        last_7d: devis7d,
        last_30d: devis30d,
        total: devisTotal,
        traites: devisTraites,
        taux_traitement_pct: tauxTraitement,
      },
      comptes_b2b: {
        last_7d: comptes7d,
        total: comptesTotal,
      },
      saved_carts: {
        last_7d: savedCarts7d,
        total: savedCartsTotal,
      },
      produits: {
        published: products,
      },
      top_categories: topCategories,
    },
  });
}
