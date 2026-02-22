import { NextRequest, NextResponse } from 'next/server';
import { supabase } from 'lib/supabase/client';
import { rateLimit } from 'lib/rate-limit';
import { log } from 'lib/logger';
import { sanitizeString, sanitizeNumber } from 'lib/validation';

export const revalidate = 30;

export async function GET(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for') ?? 'unknown';

  if (!rateLimit(ip, 30, 60000)) {
    return NextResponse.json({ results: [], error: 'Trop de requêtes' }, { status: 429 });
  }

  const { searchParams } = request.nextUrl;
  const q = sanitizeString(searchParams.get('q'), 100);
  const limit = Math.min(sanitizeNumber(searchParams.get('limit'), 1, 20), 20);

  if (q.length < 2) {
    return NextResponse.json({ results: [], query: q });
  }

  const { data, error } = await supabase
    .from('products')
    .select('id, name, slug, sku, featured_image_url, regular_price')
    .or(`name.ilike.%${q}%,sku.ilike.%${q}%`)
    .eq('status', 'publish')
    .limit(limit);

  if (error) {
    log('error', 'search.query_failed', { error: error.message, q });
    return NextResponse.json({ results: [], query: q });
  }

  log('info', 'search.query', { q, resultCount: data?.length ?? 0 });

  const results = (data ?? []).map((p: any) => ({
    id: p.id,
    title: p.name,
    handle: p.slug,
    sku: p.sku,
    featuredImageUrl: p.featured_image_url,
    regularPrice: p.regular_price,
  }));

  return NextResponse.json({ results, query: q });
}
