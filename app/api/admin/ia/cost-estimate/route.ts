import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "lib/admin/auth";
import { estimateActionCost, getIaControlConfig } from "lib/admin/ia-control";
import { sanitizeNumber, sanitizeString } from "lib/validation";

export async function POST(req: NextRequest) {
  if (!checkAdminAuth(req)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Corps invalide" }, { status: 400 });
  }

  const action = sanitizeString(String(body.action ?? ""), 120);
  const count = sanitizeNumber(Number(body.count ?? 1), 1, 10_000);
  const model = sanitizeString(String(body.model ?? ""), 120) || undefined;

  if (!action) {
    return NextResponse.json({ error: "action requise" }, { status: 400 });
  }

  const config = await getIaControlConfig();

  try {
    const estimate = estimateActionCost({
      config,
      action,
      count,
      model,
    });

    return NextResponse.json({
      ok: true,
      estimate,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Action non supportée" },
      { status: 400 },
    );
  }
}
