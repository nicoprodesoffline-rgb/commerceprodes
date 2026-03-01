import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "lib/supabase/client";
import { timingSafeEqual } from "crypto";

function checkAuth(req: NextRequest): boolean {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace("Bearer ", "");
  const expected = process.env.ADMIN_PASSWORD ?? "";
  if (!token || !expected || token.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  } catch {
    return false;
  }
}

const VALID_STATUSES = ["nouveau", "en_cours", "traite", "archive", "refuse"];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
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

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, updated: count ?? validIds.length });
}
