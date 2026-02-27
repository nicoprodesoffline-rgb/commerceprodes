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
    .select('id, name, slug, sku, regular_price, product_images!inner(url, is_featured, position)')
    .or(`name.ilike.%${q}%,sku.ilike.%${q}%`)
    .eq('status', 'publish')
    .limit(limit);

  // Fallback: retry without images join if it fails (e.g. RLS)
  if (error) {
    const { data: data2, error: error2 } = await supabase
      .from('products')
      .select('id, name, slug, sku, regular_price')
      .or(`name.ilike.%${q}%,sku.ilike.%${q}%`)
      .eq('status', 'publish')
      .limit(limit);

    if (error2) {
      log('error', 'search.query_failed', { error: error2.message, q });
      return NextResponse.json({ results: [], query: q });
    }

    log('info', 'search.query', { q, resultCount: data2?.length ?? 0 });
    const results2 = (data2 ?? []).map((p: any) => ({
      id: p.id,
      title: p.name,
      handle: p.slug,
      sku: p.sku,
      featuredImageUrl: null,
      regularPrice: p.regular_price,
    }));
    return NextResponse.json({ results: results2, query: q });
  }

  log('info', 'search.query', { q, resultCount: data?.length ?? 0 });

  const results = (data ?? []).map((p: any) => {
    const images: any[] = p.product_images ?? [];
    const featured = images.find((i: any) => i.is_featured) ?? images.sort((a: any, b: any) => a.position - b.position)[0];
    return {
      id: p.id,
      title: p.name,
      handle: p.slug,
      sku: p.sku,
      featuredImageUrl: featured?.url ?? null,
      regularPrice: p.regular_price,
    };
  });

  return NextResponse.json({ results, query: q });
}
