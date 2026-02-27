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
  if (!event || !payload) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  try {
    const client = supabaseServer();
    if (event === "product_view") {
      await client.from("product_views").insert({
        product_handle: payload.product_handle,
        product_id: payload.product_id || null,
        session_id: payload.session_id || null,
      });
    } else if (event === "cart_event") {
      await client.from("cart_events").insert({
        event_type: payload.event_type,
        product_handle: payload.product_handle || null,
        product_id: payload.product_id || null,
        sku: payload.sku || null,
        quantity: payload.quantity || 1,
        session_id: payload.session_id || null,
      });
    }
  } catch {
    // silently fail — analytics must never break UX
  }

  return NextResponse.json({ ok: true });
}
