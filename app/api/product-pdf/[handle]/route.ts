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

    // Fallback : page HTML imprimable à défaut du PDF
    const fallbackHtml = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>Fiche produit — ${product.title ?? handle}</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 700px; margin: 40px auto; color: #111; }
    h1 { color: #cc1818; font-size: 22px; }
    .ref { color: #666; font-size: 13px; margin-bottom: 16px; }
    .desc { font-size: 14px; line-height: 1.6; }
    .price { font-size: 18px; font-weight: bold; margin-top: 16px; }
    .notice { background: #fff3cd; border: 1px solid #ffc107; padding: 10px 14px;
              border-radius: 6px; font-size: 13px; margin-bottom: 20px; }
    @media print { .notice { display: none; } }
  </style>
</head>
<body>
  <div class="notice">⚠️ La génération PDF automatique est temporairement indisponible.
    Vous pouvez imprimer cette page (Ctrl+P / Cmd+P).</div>
  <h1>${product.title ?? handle}</h1>
  ${product.description ? `<p class="desc">${product.description}</p>` : ''}
  <p class="ref">Référence : ${sku || handle}</p>
  <p style="font-size:12px;color:#999;margin-top:32px">PRODES — Équipements pour collectivités</p>
</body>
</html>`;

    return new NextResponse(fallbackHtml, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'X-PDF-Fallback': 'true',
      },
    });
  }
}
