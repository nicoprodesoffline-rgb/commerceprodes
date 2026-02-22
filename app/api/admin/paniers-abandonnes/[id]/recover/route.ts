import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from 'lib/supabase/client';
import { log } from 'lib/logger';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const client = supabaseServer();
  const { error } = await client
    .from('abandoned_carts')
    .update({ recovered_at: new Date().toISOString() })
    .eq('id', id);

  if (error) {
    log('error', 'abandoned_cart.recover_failed', { error: error.message, id });
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
  }

  log('info', 'abandoned_cart.recovered', { id });
  return NextResponse.json({ ok: true });
}
