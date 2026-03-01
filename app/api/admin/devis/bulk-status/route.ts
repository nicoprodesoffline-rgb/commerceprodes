import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "lib/supabase/client";
import { timingSafeEqual } from "crypto";
import { logAdminAction } from "lib/admin/audit-log";

function checkAuth(req: NextRequest): boolean {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace("Bearer ", "");
  const expected = process.env.ADMIN_PASSWORD ?? "";

  if (token && expected && token.length === expected.length) {
    try {
      if (timingSafeEqual(Buffer.from(token), Buffer.from(expected))) return true;
    } catch {
      // ignore and fallback
    }
  }

  const session = req.cookies.get("admin_session")?.value;
  return Boolean(session);
}

const VALID_STATUSES = ["nouveau", "en_cours", "traite", "archive", "refuse"];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function handleBulkStatus(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { ids, status } = body as { ids: unknown; status: unknown };

  if (!status || typeof status !== "string" || !VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: "Statut invalide" }, { status: 400 });
  }
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "IDs manquants" }, { status: 400 });
  }
  // Validate all IDs are UUIDs
  const validIds = (ids as unknown[]).filter((id): id is string => typeof id === "string" && UUID_RE.test(id));
  if (validIds.length === 0) {
    return NextResponse.json({ error: "Aucun ID valide" }, { status: 400 });
  }

  const client = supabaseServer();
  const { error, count } = await client
    .from("devis_requests")
    .update({ status, updated_at: new Date().toISOString() })
    .in("id", validIds);

  if (error) {
    logAdminAction({ action: "devis.bulk_status", entity: "devis_request", payload_summary: `Bulk ${status} sur ${validIds.length} ids — ÉCHEC`, success: false }).catch(() => {});
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  logAdminAction({
    action: "devis.bulk_status",
    entity: "devis_request",
    payload_summary: `Statut → ${status} pour ${validIds.length} demande(s)`,
    success: true,
  }).catch(() => {});

  return NextResponse.json({ ok: true, updated: count ?? validIds.length });
}

export async function POST(req: NextRequest) {
  return handleBulkStatus(req);
}

export async function PATCH(req: NextRequest) {
  return handleBulkStatus(req);
}
