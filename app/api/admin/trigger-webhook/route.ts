import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { N8N_WEBHOOK_KEYS, triggerN8nWebhook } from "lib/admin/n8n-webhooks";

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

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  let body: { webhook: string; payload?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  if (!body.webhook || typeof body.webhook !== "string") {
    return NextResponse.json({ error: "Webhook manquant" }, { status: 400 });
  }
  if (!N8N_WEBHOOK_KEYS.includes(body.webhook as (typeof N8N_WEBHOOK_KEYS)[number])) {
    return NextResponse.json(
      {
        error: `Webhook inconnu: ${body.webhook}`,
        allowed: N8N_WEBHOOK_KEYS,
      },
      { status: 400 },
    );
  }

  const result = await triggerN8nWebhook(body.webhook, body.payload);
  console.log(JSON.stringify({ event: "n8n.trigger", webhook: body.webhook, success: result.success }));

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
