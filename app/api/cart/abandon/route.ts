import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from 'lib/supabase/client';
import { rateLimit } from 'lib/rate-limit';
import { log } from 'lib/logger';
import { sanitizeString, sanitizeEmail, sanitizeNumber } from 'lib/validation';

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for') ?? 'unknown';

  if (!rateLimit(ip, 10, 60000)) {
    return NextResponse.json({ ok: false }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: true }); // silent
  }

  const b = body as Record<string, unknown>;
  const sessionId = sanitizeString(b.session_id, 100);
  const email = sanitizeEmail(b.email) ?? null;
  const itemsJson = Array.isArray(b.items_json) ? b.items_json : [];
  const totalHt = sanitizeNumber(b.total_ht, 0, 9999999);
  const totalItems = sanitizeNumber(b.total_items, 0, 9999);

  if (!sessionId) {
    return NextResponse.json({ ok: true }); // silent
  }

  const client = supabaseServer();

  const { error } = await client.from('abandoned_carts').upsert(
    {
      session_id: sessionId,
      email,
      items_json: itemsJson,
      total_ht: totalHt,
      total_items: totalItems,
      last_updated_at: new Date().toISOString(),
    },
    { onConflict: 'session_id' },
  );

  if (error) {
    log('error', 'abandoned_cart.upsert_failed', { error: error.message });
  } else {
    log('info', 'abandoned_cart.saved', { sessionId, totalHt, totalItems });
  }

  return NextResponse.json({ ok: true });
}
