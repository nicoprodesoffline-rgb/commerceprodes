import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "lib/supabase/client";
import { rateLimit } from "lib/rate-limit";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? "unknown";
  if (!rateLimit(ip, 20, 60000)) {
    return NextResponse.json({ ok: false }, { status: 429 });
  }

  let body: { event: string; payload: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const { event, payload } = body;
  const ALLOWED_EVENTS = ["product_view", "cart_event"] as const;
  if (!event || !payload || !ALLOWED_EVENTS.includes(event as typeof ALLOWED_EVENTS[number])) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  // Sanitize payload fields to prevent arbitrary data injection
  const sanitizeStr = (v: unknown, max = 255): string | null => {
    if (typeof v !== "string" || !v) return null;
    return v.slice(0, max);
  };
  const sanitizeQty = (v: unknown): number => {
    const n = Number(v);
    if (!Number.isFinite(n) || n < 1) return 1;
    return Math.min(Math.round(n), 10_000);
  };

  try {
    const client = supabaseServer();
    if (event === "product_view") {
      await client.from("product_views").insert({
        product_handle: sanitizeStr(payload.product_handle),
        product_id: sanitizeStr(payload.product_id),
        session_id: sanitizeStr(payload.session_id),
      });
    } else if (event === "cart_event") {
      await client.from("cart_events").insert({
        event_type: sanitizeStr(payload.event_type, 50),
        product_handle: sanitizeStr(payload.product_handle),
        product_id: sanitizeStr(payload.product_id),
        sku: sanitizeStr(payload.sku, 100),
        quantity: sanitizeQty(payload.quantity),
        session_id: sanitizeStr(payload.session_id),
      });
    }
  } catch {
    // silently fail — analytics must never break UX
  }

  return NextResponse.json({ ok: true });
}
