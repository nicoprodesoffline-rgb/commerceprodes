import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "lib/supabase/client";

const VALID_STATUSES = ["nouveau", "en_cours", "traite", "archive", "refuse"];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function checkAuth(req: NextRequest): boolean {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace("Bearer ", "");
  const expected = process.env.ADMIN_PASSWORD ?? "";

  if (token && expected && token.length === expected.length) {
    try {
      if (timingSafeEqual(Buffer.from(token), Buffer.from(expected))) return true;
    } catch {
      // ignore and fallback to cookie auth
    }
  }

  const session = req.cookies.get("admin_session")?.value;
  return Boolean(session);
}

async function parseJsonBody(req: NextRequest): Promise<Record<string, unknown> | null> {
  try {
    return (await req.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function handleBulkStatus(req: NextRequest) {
  const body = await parseJsonBody(req);
  if (!body) return NextResponse.json({ error: "JSON invalide" }, { status: 400 });

  const { ids, status } = body as { ids: unknown; status: unknown };
  if (!status || typeof status !== "string" || !VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: "Statut invalide" }, { status: 400 });
  }
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "IDs manquants" }, { status: 400 });
  }

  const validIds = (ids as unknown[]).filter(
    (id): id is string => typeof id === "string" && UUID_RE.test(id),
  );
  if (validIds.length === 0) {
    return NextResponse.json({ error: "Aucun ID valide" }, { status: 400 });
  }

  const client = supabaseServer();
  const { error, count } = await client
    .from("devis_requests")
    .update({ status, updated_at: new Date().toISOString() })
    .in("id", validIds);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, updated: count ?? validIds.length });
}

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const { id } = await props.params;
  if (id === "bulk-status") {
    return handleBulkStatus(req);
  }

  const body = await parseJsonBody(req);
  if (!body) return NextResponse.json({ error: "JSON invalide" }, { status: 400 });

  const { status, notes_internes } = body as Record<string, unknown>;
  if (typeof status !== "string" || !VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: "Statut invalide" }, { status: 400 });
  }
  if (notes_internes !== undefined && typeof notes_internes !== "string") {
    return NextResponse.json({ error: "Notes invalides" }, { status: 400 });
  }

  try {
    const { updateDevisStatus } = await import("lib/supabase/index");
    const ok = await updateDevisStatus(
      id,
      status,
      notes_internes as string | undefined,
    );
    if (!ok) {
      return NextResponse.json({ error: "Mise à jour échouée" }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[ADMIN DEVIS] PATCH error:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const { id } = await props.params;
  if (id !== "bulk-status") {
    return NextResponse.json({ error: "Method Not Allowed" }, { status: 405 });
  }
  return handleBulkStatus(req);
}
