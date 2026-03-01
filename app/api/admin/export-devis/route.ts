import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "lib/admin/auth";

const VALID_STATUSES = ["all", "nouveau", "en_cours", "traite", "archive", "refuse"] as const;

function normalizeCell(value: unknown): string {
  return String(value ?? "")
    .replace(/\r?\n/g, " ")
    .replace(/\t/g, " ");
}

function toCsv(rows: Record<string, unknown>[]): string {
  const header = [
    "id",
    "created_at",
    "nom",
    "email",
    "telephone",
    "produit",
    "sku",
    "quantite",
    "status",
    "notes_internes",
  ];
  const lines = [header.join(";")];

  for (const row of rows) {
    lines.push(
      header
        .map((key) => `"${normalizeCell(row[key]).replace(/"/g, '""')}"`)
        .join(";"),
    );
  }

  return lines.join("\n");
}

function toTsv(rows: Record<string, unknown>[]): string {
  const header = [
    "id",
    "created_at",
    "nom",
    "email",
    "telephone",
    "produit",
    "sku",
    "quantite",
    "status",
    "notes_internes",
  ];
  const lines = [header.join("\t")];

  for (const row of rows) {
    lines.push(header.map((key) => normalizeCell(row[key])).join("\t"));
  }

  return lines.join("\n");
}

export async function GET(req: NextRequest) {
  if (!checkAdminAuth(req)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const status = (searchParams.get("status") ?? "all").trim();
  const search = (searchParams.get("search") ?? "").trim();
  const format = (searchParams.get("format") ?? "xls").trim().toLowerCase();

  if (!VALID_STATUSES.includes(status as (typeof VALID_STATUSES)[number])) {
    return NextResponse.json({ error: "Statut invalide" }, { status: 400 });
  }
  if (format !== "xls" && format !== "csv") {
    return NextResponse.json({ error: "Format invalide" }, { status: 400 });
  }

  try {
    const { supabaseServer } = await import("lib/supabase/client");
    const client = supabaseServer();

    let query = client
      .from("devis_requests")
      .select("id, created_at, nom, email, telephone, produit, sku, quantite, status, notes_internes")
      .order("created_at", { ascending: false })
      .limit(10000);

    if (status !== "all") {
      query = query.eq("status", status);
    }
    if (search) {
      query = query.or(`nom.ilike.%${search}%,email.ilike.%${search}%,produit.ilike.%${search}%,telephone.ilike.%${search}%`);
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = (data ?? []) as Record<string, unknown>[];
    const safeDate = new Date().toISOString().slice(0, 10);
    const filenameBase = `devis-prodes-${status}-${safeDate}`;

    if (format === "csv") {
      const csv = `\uFEFF${toCsv(rows)}`;
      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename=\"${filenameBase}.csv\"`,
        },
      });
    }

    const tsv = `\uFEFF${toTsv(rows)}`;
    return new NextResponse(tsv, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.ms-excel; charset=utf-8",
        "Content-Disposition": `attachment; filename=\"${filenameBase}.xls\"`,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
