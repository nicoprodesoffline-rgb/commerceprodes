import { NextRequest, NextResponse } from "next/server";

function checkAuth(req: NextRequest): boolean {
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace("Bearer ", "");
  return token === (process.env.ADMIN_PASSWORD ?? "");
}

interface DuplicateGroup {
  products: Array<{ id: string; title: string; handle: string; sku: string | null }>;
  similarity: "title" | "sku";
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  try {
    const { supabaseServer } = await import("lib/supabase/client");
    const client = supabaseServer();

    const { data: products, error } = await client
      .from("products")
      .select("id, name, slug, sku")
      .eq("status", "publish")
      .limit(5000);

    if (error || !products) {
      return NextResponse.json({ groups: [] });
    }

    const groups: DuplicateGroup[] = [];
    const seen = new Set<string>();

    // Group by first 5 words of title
    const titleGroups: Record<string, typeof products> = {};
    for (const p of products) {
      const key = (p.name as string)
        .toLowerCase()
        .split(/\s+/)
        .slice(0, 5)
        .join(" ");
      if (!titleGroups[key]) titleGroups[key] = [];
      titleGroups[key].push(p);
    }
    for (const [, group] of Object.entries(titleGroups)) {
      if (group.length >= 2) {
        const ids = group.map((p) => p.id).sort().join(",");
        if (!seen.has(ids)) {
          seen.add(ids);
          groups.push({
            products: group.map((p) => ({
              id: p.id,
              title: p.name as string,
              handle: p.slug as string,
              sku: p.sku as string | null,
            })),
            similarity: "title",
          });
        }
      }
    }

    // Group by first 8 chars of SKU
    const skuGroups: Record<string, typeof products> = {};
    for (const p of products) {
      if (!p.sku) continue;
      const key = (p.sku as string).slice(0, 8).toLowerCase();
      if (!skuGroups[key]) skuGroups[key] = [];
      skuGroups[key].push(p);
    }
    for (const [, group] of Object.entries(skuGroups)) {
      if (group.length >= 2) {
        const ids = group.map((p) => p.id).sort().join(",");
        if (!seen.has(ids)) {
          seen.add(ids);
          groups.push({
            products: group.map((p) => ({
              id: p.id,
              title: p.name as string,
              handle: p.slug as string,
              sku: p.sku as string | null,
            })),
            similarity: "sku",
          });
        }
      }
    }

    return NextResponse.json({ groups: groups.slice(0, 50) });
  } catch (err) {
    console.error("ia.detect_duplicates error", err);
    return NextResponse.json({ error: "Erreur détection" }, { status: 500 });
  }
}
