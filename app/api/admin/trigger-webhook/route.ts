import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "lib/admin/auth";
import { triggerN8nWebhook } from "lib/admin/n8n-webhooks";
import { log } from "lib/logger";

export async function POST(req: NextRequest) {
  if (!checkAdminAuth(req)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  let body: { webhook: string; payload?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const result = await triggerN8nWebhook(body.webhook, body.payload);
  log("info", "n8n.trigger", {
    webhook: body.webhook,
    success: result.success,
  });

  if (result.success) {
    return NextResponse.json({
      success: true,
      message: "✓ Workflow n8n démarré — résultats dans quelques minutes",
    });
  } else {
    return NextResponse.json({
      success: false,
      message: `⚠️ ${result.reason}`,
    });
  }
}
