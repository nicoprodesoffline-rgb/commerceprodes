/**
 * GET /api/admin/families/export?format=csv
 */
import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "lib/admin/auth";
import { checkFamiliesDb, degradedResponse } from "lib/admin/families-db";
import { supabaseServer } from "lib/supabase/client";

function escapeCsv(v: unknown): string {
  const s = String(v ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET(req: NextRequest) {
  if (!checkAdminAuth(req))
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const db = await checkFamiliesDb();
  if (!db.available)
    return NextResponse.json(degradedResponse(db), { status: 503 });

  const client = supabaseServer();
  const { data } = await client
    .from("product_families")
    .select(
      `
      id, name, slug, strategy, active, created_at,
      products!product_families_parent_product_id_fkey (name, sku),
      product_family_members (id, active, member_type,
        products (name, sku),
        variants (name, sku)
      )
    `,
    )
    .order("created_at", { ascending: false });

  const rows: string[] = [
    [
      "family_id",
      "family_name",
      "strategy",
      "active",
      "parent_sku",
      "parent_name",
      "member_type",
      "member_sku",
      "member_name",
    ].join(","),
  ];

  for (const f of data ?? []) {
    const parent = f.products as unknown as {
      name: string;
      sku: string;
    } | null;
    const members =
      (f.product_family_members as unknown as Array<{
        active: boolean;
        member_type: string;
        products: { name: string; sku: string } | null;
        variants: { name: string; sku: string } | null;
      }>) ?? [];

    if (members.length === 0) {
      rows.push(
        [
          f.id,
          f.name,
          f.strategy,
          f.active,
          parent?.sku ?? "",
          parent?.name ?? "",
          "",
          "",
          "",
        ]
          .map(escapeCsv)
          .join(","),
      );
    } else {
      for (const m of members) {
        if (!m.active) continue;
        const mp = m.products ?? m.variants;
        rows.push(
          [
            f.id,
            f.name,
            f.strategy,
            f.active,
            parent?.sku ?? "",
            parent?.name ?? "",
            m.member_type,
            mp?.sku ?? "",
            mp?.name ?? "",
          ]
            .map(escapeCsv)
            .join(","),
        );
      }
    }
  }

  const csv = rows.join("\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="families-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
