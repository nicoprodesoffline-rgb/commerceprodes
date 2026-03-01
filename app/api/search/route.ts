import { NextRequest, NextResponse } from 'next/server';
import { supabase } from 'lib/supabase/client';
import { rateLimit } from 'lib/rate-limit';
import { log } from 'lib/logger';
import { sanitizeString, sanitizeNumber } from 'lib/validation';
import { expandQuery, normalize } from 'lib/search/synonyms';
import { rankResults } from 'lib/search/rank';
import type { SearchCandidate } from 'lib/search/rank';

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

  // ── Expand query with synonyms ────────────────────────────────
  const { terms, enriched } = expandQuery(q);
  const qNorm = normalize(q);

  // Build OR condition covering original term + synonyms
  const orClauses = [...new Set([q, ...terms])]
    .map((t) => `name.ilike.%${t.replace(/%/g, '')}%`)
    .join(',');

  // Add SKU match
  const orWithSku = `sku.ilike.%${q.replace(/%/g, '')}%,${orClauses}`;

  const { data, error } = await supabase
    .from('products')
    .select('id, name, slug, sku, regular_price, product_images!inner(url, is_featured, position)')
    .or(orWithSku)
    .eq('status', 'publish')
    .limit(Math.min(limit * 5, 100)); // Fetch more for re-ranking

  // Fallback: retry without images join if RLS fails
  if (error) {
    const { data: data2, error: error2 } = await supabase
      .from('products')
      .select('id, name, slug, sku, regular_price')
      .or(`name.ilike.%${qNorm}%,sku.ilike.%${q.replace(/%/g, '')}%`)
      .eq('status', 'publish')
      .limit(100);

    if (error2) {
      log('error', 'search.query_failed', { error: error2.message, q });
      return NextResponse.json({ results: [], query: q });
    }

    const candidates: SearchCandidate[] = (data2 ?? []).map((p: any) => ({
      id: p.id,
      title: p.name,
      handle: p.slug,
      sku: p.sku ?? null,
      featuredImageUrl: null,
      regularPrice: p.regular_price ?? null,
    }));

    const ranked = rankResults(candidates, q).slice(0, limit);
    log('info', 'search.query', { q, resultCount: ranked.length, enriched });
    return NextResponse.json({ results: ranked, query: q, enriched });
  }

  const candidates: SearchCandidate[] = (data ?? []).map((p: any) => {
    const images: any[] = p.product_images ?? [];
    const featured = images.find((i: any) => i.is_featured) ?? images.sort((a: any, b: any) => a.position - b.position)[0];
    return {
      id: p.id,
      title: p.name,
      handle: p.slug,
      sku: p.sku ?? null,
      featuredImageUrl: featured?.url ?? null,
      regularPrice: p.regular_price ?? null,
    };
  });

  const ranked = rankResults(candidates, q).slice(0, limit);
  log('info', 'search.query', { q, resultCount: ranked.length, enriched });

  return NextResponse.json({ results: ranked, query: q, enriched });
}
