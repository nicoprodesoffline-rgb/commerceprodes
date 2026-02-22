import { NextRequest, NextResponse } from 'next/server';
import { getProduct } from 'lib/supabase';
import { generateProductPDF } from 'lib/pdf/product-pdf';
import { rateLimit } from 'lib/rate-limit';
import { log } from 'lib/logger';
import { sanitizeHandle, sanitizeString } from 'lib/validation';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ handle: string }> },
) {
  const ip = request.headers.get('x-forwarded-for') ?? 'unknown';

  if (!rateLimit(ip, 10, 60000)) {
    return NextResponse.json({ error: 'Trop de requêtes' }, { status: 429 });
  }

  const { handle: rawHandle } = await params;
  const handle = sanitizeHandle(rawHandle);
  const sku = sanitizeString(request.nextUrl.searchParams.get('sku') ?? '', 100);

  if (!handle) {
    return NextResponse.json({ error: 'Handle invalide' }, { status: 400 });
  }

  const product = await getProduct(handle);
  if (!product) {
    return NextResponse.json({ error: 'Produit introuvable' }, { status: 404 });
  }

  log('info', 'pdf.generate_start', { handle, sku });

  try {
    const pdfBuffer = await generateProductPDF(product, sku || undefined);
    const filename = sku ? `${handle}--${sku}.pdf` : `${handle}.pdf`;

    log('info', 'pdf.generate_success', { handle, size: pdfBuffer.length });

    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'public, max-age=604800', // 7 jours
      },
    });
  } catch (err) {
    log('error', 'pdf.generate_failed', { handle, error: String(err) });
    return NextResponse.json(
      { error: 'Erreur lors de la génération du PDF' },
      { status: 500 },
    );
  }
}
