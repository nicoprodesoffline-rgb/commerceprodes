/**
 * GET /api/admin/proposals/suggest
 * Analyse le catalogue et génère des propositions d'amélioration nouvelles.
 * Ne sauvegarde pas automatiquement — retourne les suggestions pour validation.
 * POST /api/admin/proposals/suggest — ajoute les suggestions générées dans proposals.json
 */
import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "lib/admin/auth";
import fs from "fs";
import path from "path";

const PROPOSALS_PATH = path.join(process.cwd(), "..", "state", "proposals.json");

interface Proposal {
  id: string;
  title: string;
  description: string;
  source: string;
  status: string;
  priority: string;
  created_at: string;
  updated_at: string;
}

interface ProposalsFile {
  updated_at: string;
  items: Proposal[];
}

function readProposals(): ProposalsFile {
  try {
    return JSON.parse(fs.readFileSync(PROPOSALS_PATH, "utf-8")) as ProposalsFile;
  } catch {
    return { updated_at: new Date().toISOString(), items: [] };
  }
}

function writeProposals(data: ProposalsFile): void {
  fs.writeFileSync(PROPOSALS_PATH, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

function stripHtml(s: string | null): string {
  return (s ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

export async function GET(req: NextRequest) {
  if (!checkAdminAuth(req)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  try {
    const { supabaseServer } = await import("lib/supabase/client");
    const client = supabaseServer();

    const [productsRes, devisRes] = await Promise.allSettled([
      client
        .from("products")
        .select("id, title, name, sku, short_description, featured_image_url, seo_title, seo_description, status, regular_price")
        .eq("status", "publish")
        .limit(500),
      client
        .from("devis_requests")
        .select("id, status")
        .gt("created_at", new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()),
    ]);

    const products = productsRes.status === "fulfilled" ? (productsRes.value.data ?? []) : [];
    const devis = devisRes.status === "fulfilled" ? (devisRes.value.data ?? []) : [];

    // Analyse des produits
    let missingDesc = 0;
    let missingImage = 0;
    let missingSku = 0;
    let missingSeoTitle = 0;

    for (const p of products) {
      const descLen = stripHtml(p.short_description).length;
      if (descLen < 80) missingDesc++;
      if (!p.featured_image_url || p.featured_image_url.includes("placeholder")) missingImage++;
      if (!p.sku?.trim()) missingSku++;
      if (!p.seo_title || (p.seo_title as string).length < 30) missingSeoTitle++;
    }

    const total = products.length;
    const devisPending = devis.filter((d: { status: string }) => d.status === "nouveau").length;

    // Charger les propositions existantes (titres déjà proposés/approuvés)
    const existing = readProposals();
    const existingTitles = new Set(
      existing.items
        .filter((p) => p.status !== "rejected")
        .map((p) => p.title.toLowerCase())
    );

    const now = new Date().toISOString();
    const suggestions: Proposal[] = [];

    function suggest(title: string, description: string, priority: "high" | "medium" | "low") {
      if (existingTitles.has(title.toLowerCase())) return;
      suggestions.push({
        id: `prop-suggest-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        title,
        description,
        source: "auto-suggest",
        status: "proposed",
        priority,
        created_at: now,
        updated_at: now,
      });
    }

    // Règles d'analyse
    if (missingDesc > 5) {
      const pct = Math.round((missingDesc / total) * 100);
      suggest(
        `Descriptions manquantes: ${missingDesc} produits (${pct}%)`,
        `${missingDesc} produits publiés sur ${total} n'ont pas de description courte ≥ 80 caractères. Utiliser ✨ Générer descriptions dans les outils IA pour les compléter en masse.`,
        missingDesc > 20 ? "high" : "medium"
      );
    }

    if (missingImage > 3) {
      const pct = Math.round((missingImage / total) * 100);
      suggest(
        `Images manquantes: ${missingImage} produits (${pct}%)`,
        `${missingImage} produits n'ont pas d'image principale ou utilisent un placeholder. Une image augmente le taux de conversion de ~40%.`,
        missingImage > 10 ? "high" : "medium"
      );
    }

    if (missingSku > 3) {
      suggest(
        `SKU manquant: ${missingSku} produits sans référence`,
        `${missingSku} produits publiés n'ont pas de SKU. Un SKU est nécessaire pour les exports, le scoring SEO, et le B2B.`,
        "medium"
      );
    }

    if (missingSeoTitle > 10) {
      const pct = Math.round((missingSeoTitle / total) * 100);
      suggest(
        `Titres SEO absents: ${missingSeoTitle} produits (${pct}%)`,
        `${missingSeoTitle} produits n'ont pas de titre SEO optimisé. Utiliser le cockpit SEO → Auto SEO pour les générer en masse.`,
        missingSeoTitle > 30 ? "high" : "medium"
      );
    }

    if (devisPending > 5) {
      suggest(
        `${devisPending} devis en attente de traitement`,
        `${devisPending} demandes de devis sont en statut "nouveau" cette semaine. Assigner ou traiter pour ne pas perdre des opportunités commerciales.`,
        "high"
      );
    }

    return NextResponse.json({
      suggestions,
      analysis: { total, missingDesc, missingImage, missingSku, missingSeoTitle, devisPending },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!checkAdminAuth(req)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  let body: { suggestions?: Proposal[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide" }, { status: 400 });
  }

  const { suggestions } = body;
  if (!Array.isArray(suggestions) || suggestions.length === 0) {
    return NextResponse.json({ error: "suggestions[] requis" }, { status: 400 });
  }

  const data = readProposals();
  const existingIds = new Set(data.items.map((p) => p.id));

  let added = 0;
  for (const s of suggestions) {
    if (!existingIds.has(s.id)) {
      data.items.push(s);
      added++;
    }
  }

  data.updated_at = new Date().toISOString();

  try {
    writeProposals(data);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }

  return NextResponse.json({ ok: true, added });
}
