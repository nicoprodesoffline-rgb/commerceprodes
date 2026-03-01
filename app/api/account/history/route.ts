import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "lib/supabase/client";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type HistoryItem = {
  id: string;
  type: "order" | "devis" | "saved_cart" | "shared_cart";
  label: string;
  status?: string;
  date: string;
  amount?: number | null;
  extra?: Record<string, unknown>;
};

export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get("email");
  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Email invalide" }, { status: 400 });
  }

  const client = supabaseServer();
  const timeline: HistoryItem[] = [];

  // ── 1. Devis / commandes (devis_requests) ────────────────────
  try {
    const { data: devis } = await client
      .from("devis_requests")
      .select("id, created_at, produit, sku, status, quantite")
      .eq("email", email.toLowerCase())
      .order("created_at", { ascending: false })
      .limit(50);

    for (const d of devis ?? []) {
      const isOrder = String(d.sku ?? "").startsWith("PRODES-");
      timeline.push({
        id: d.id,
        type: isOrder ? "order" : "devis",
        label: d.produit ?? (isOrder ? `Commande ${d.sku}` : "Demande de devis"),
        status: d.status,
        date: d.created_at,
        extra: { sku: d.sku, quantite: d.quantite },
      });
    }
  } catch {
    // Degrade silently
  }

  // ── 2. Paniers sauvegardés (saved_carts) ─────────────────────
  try {
    const { data: carts } = await client
      .from("saved_carts")
      .select("id, name, created_at, updated_at, cart_snapshot")
      .eq("email", email.toLowerCase())
      .order("updated_at", { ascending: false })
      .limit(20);

    for (const c of carts ?? []) {
      const lines = Array.isArray(c.cart_snapshot) ? c.cart_snapshot : [];
      const total = lines.reduce((s: number, l: { lineTotal?: number }) => s + (l.lineTotal ?? 0), 0);
      timeline.push({
        id: c.id,
        type: "saved_cart",
        label: `Panier "${c.name}"`,
        date: c.updated_at ?? c.created_at,
        amount: total > 0 ? total : null,
        extra: { lines_count: lines.length },
      });
    }
  } catch {
    // Table may not exist yet
  }

  // ── 3. Paniers partagés (shared_carts) ───────────────────────
  try {
    const { data: shared } = await client
      .from("shared_carts")
      .select("id, created_at, cart_data, share_id")
      .eq("email", email.toLowerCase())
      .order("created_at", { ascending: false })
      .limit(10);

    for (const s of shared ?? []) {
      timeline.push({
        id: s.id,
        type: "shared_cart",
        label: `Panier partagé`,
        date: s.created_at,
        extra: { share_id: s.share_id },
      });
    }
  } catch {
    // Table may not exist
  }

  // Sort descending by date
  timeline.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return NextResponse.json({ email, timeline });
}
