import { NextRequest, NextResponse } from 'next/server';
import { checkAdminAuth } from 'lib/admin/auth';
import { supabaseServer } from 'lib/supabase/client';
import { log } from 'lib/logger';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!checkAdminAuth(request)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  const { id } = await params;
  if (!id || !UUID_RE.test(id)) return NextResponse.json({ error: 'ID invalide' }, { status: 400 });

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
