/**
 * GET /api/admin/seo/audit
 * Retourne un rapport SEO scoré pour tous les produits publiés.
 * Utilisable par scripts CI, exports, ou le cockpit SEO.
 *
 * Query params:
 *   status   all | publish (default: publish)
 *   limit    number (default: 500, max 2000)
 *   minScore number — ne retourner que les produits avec score <= minScore
 *   format   json (default) | csv
 */
import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "lib/admin/auth";

interface ProductRow {
  id: string;
  title?: string;
  name?: string;
  handle?: string;
  slug?: string;
  sku: string | null;
  short_description: string | null;
  featured_image_url: string | null;
  seo_title: string | null;
  seo_description: string | null;
  status: string;
}

interface AuditRow extends ProductRow {
  score: number;
  suggestions: string[];
}

function stripHtml(s: string | null): string {
  return (s ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function computeScore(p: ProductRow): { score: number; suggestions: string[] } {
  const suggestions: string[] = [];
  let score = 0;
  const title = p.title ?? p.name ?? "";
  if (title.length >= 30 && title.length <= 70) score += 20;
  else suggestions.push(title.length < 30 ? "Titre trop court (<30)" : "Titre trop long (>70)");
  const descLen = stripHtml(p.short_description).length;
  if (descLen >= 80 && descLen <= 300) score += 20;
  else suggestions.push(descLen < 80 ? "Description trop courte ou absente" : "Description trop longue");
  if (p.featured_image_url && !p.featured_image_url.includes("placeholder")) score += 20;
  else suggestions.push("Image principale manquante");
  if (p.sku?.trim()) score += 20;
  else suggestions.push("SKU manquant");
  if (p.seo_title && p.seo_title.length >= 30) score += 10;
  else suggestions.push("Titre SEO absent ou trop court");
  if (p.seo_description && p.seo_description.length >= 80) score += 10;
  else suggestions.push("Meta description absente ou trop courte");
  return { score, suggestions };
}

function toCsv(rows: AuditRow[]): string {
  const headers = ["id", "titre", "slug", "sku", "score", "suggestions", "seo_title", "seo_description"];
  const lines = [headers.join(";")];
  for (const r of rows) {
    const title = String(r.title ?? r.name ?? "");
    const slug = String(r.handle ?? r.slug ?? "");
    lines.push([
      r.id,
      `"${title.replace(/"/g, '""')}"`,
      slug,
      r.sku ?? "",
      r.score,
      `"${r.suggestions.join(" | ").replace(/"/g, '""')}"`,
      `"${(r.seo_title ?? "").replace(/"/g, '""')}"`,
      `"${(r.seo_description ?? "").replace(/"/g, '""')}"`,
    ].join(";"));
  }
  return "\uFEFF" + lines.join("\n");
}

export async function GET(req: NextRequest) {
  if (!checkAdminAuth(req)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") ?? "publish";
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "500"), 2000);
  const minScoreParam = searchParams.get("minScore");
  const minScore = minScoreParam !== null ? parseInt(minScoreParam) : null;
  const format = searchParams.get("format") ?? "json";

  try {
    const { supabaseServer } = await import("lib/supabase/client");
    const client = supabaseServer();

    let query = client
      .from("products")
      .select("id, title, name, handle, slug, sku, short_description, featured_image_url, seo_title, seo_description, status")
      .limit(limit);

    if (status !== "all") {
      query = query.eq("status", status);
    }

    const { data, error } = await query;
    if (error) throw error;

    const rows: AuditRow[] = (data ?? []).map((p: ProductRow) => {
      const { score, suggestions } = computeScore(p);
      return { ...p, score, suggestions };
    });

    // Sort by score ascending (worst first)
    rows.sort((a, b) => a.score - b.score);

    // Optional score filter
    const filtered = minScore !== null ? rows.filter((r) => r.score <= minScore) : rows;

    // Summary stats
    const green = filtered.filter((r) => r.score >= 90).length;
    const orange = filtered.filter((r) => r.score >= 40 && r.score < 90).length;
    const red = filtered.filter((r) => r.score < 40).length;
    const avg = filtered.length
      ? Math.round(filtered.reduce((s, r) => s + r.score, 0) / filtered.length)
      : 0;

    if (format === "csv") {
      return new NextResponse(toCsv(filtered), {
        headers: {
          "Content-Type": "text/csv;charset=utf-8",
          "Content-Disposition": `attachment; filename="seo-audit-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      });
    }

    return NextResponse.json({
      total: filtered.length,
      summary: { green, orange, red, avg },
      products: filtered.map((r) => ({
        id: r.id,
        title: r.title ?? r.name ?? "",
        slug: r.handle ?? r.slug ?? "",
        sku: r.sku,
        score: r.score,
        suggestions: r.suggestions,
        seo_title: r.seo_title,
        seo_description: r.seo_description,
      })),
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
