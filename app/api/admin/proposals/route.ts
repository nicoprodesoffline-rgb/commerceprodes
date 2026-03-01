/**
 * GET  /api/admin/proposals         — liste toutes les propositions
 * PATCH /api/admin/proposals        — met à jour le statut d'une proposition
 *   body: { id: string, status: "approved" | "standby" | "rejected" | "proposed" }
 *
 * Les propositions sont stockées dans state/proposals.json (racine du repo).
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
    const raw = fs.readFileSync(PROPOSALS_PATH, "utf-8");
    return JSON.parse(raw) as ProposalsFile;
  } catch {
    return { updated_at: new Date().toISOString(), items: [] };
  }
}

function writeProposals(data: ProposalsFile): void {
  fs.writeFileSync(PROPOSALS_PATH, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

export async function GET(req: NextRequest) {
  if (!checkAdminAuth(req)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const data = readProposals();
  const { searchParams } = new URL(req.url);
  const statusFilter = searchParams.get("status");

  const items = statusFilter
    ? data.items.filter((p) => p.status === statusFilter)
    : data.items;

  // Sort: proposed first (priority high → medium → low), then others
  const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };
  items.sort((a, b) => {
    if (a.status === "proposed" && b.status !== "proposed") return -1;
    if (a.status !== "proposed" && b.status === "proposed") return 1;
    return (PRIORITY_ORDER[a.priority] ?? 3) - (PRIORITY_ORDER[b.priority] ?? 3);
  });

  return NextResponse.json({ items, total: items.length });
}

export async function PATCH(req: NextRequest) {
  if (!checkAdminAuth(req)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  let body: { id?: string; status?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide" }, { status: 400 });
  }

  const { id, status } = body;
  if (!id || !status) {
    return NextResponse.json({ error: "id et status requis" }, { status: 400 });
  }

  const VALID_STATUSES = ["proposed", "approved", "standby", "rejected"];
  if (!VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: `Statut invalide. Valeurs: ${VALID_STATUSES.join(", ")}` }, { status: 400 });
  }

  const data = readProposals();
  const idx = data.items.findIndex((p) => p.id === id);
  if (idx === -1) {
    return NextResponse.json({ error: "Proposition introuvable" }, { status: 404 });
  }

  data.items[idx] = {
    ...data.items[idx]!,
    status,
    updated_at: new Date().toISOString(),
  };
  data.updated_at = new Date().toISOString();

  try {
    writeProposals(data);
  } catch (err) {
    return NextResponse.json({ error: `Erreur écriture: ${String(err)}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true, proposal: data.items[idx] });
}
