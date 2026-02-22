import type { Product } from 'lib/supabase/types';
import { log } from 'lib/logger';

/**
 * Generates a product datasheet PDF using jsPDF.
 * Returns a Buffer of the PDF file.
 */
export async function generateProductPDF(
  product: Product,
  sku?: string,
): Promise<Buffer> {
  // Dynamic import for SSR compatibility
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { jsPDF } = await import('jspdf');

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  // ── En-tête rouge PRODES ──────────────────────────────────────
  doc.setFillColor(204, 24, 24); // #cc1818
  doc.rect(0, 0, 210, 30, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('PRODES', 15, 18);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Équipements pour collectivités', 15, 24);
  doc.text('prodes.fr  —  04 67 24 30 34  —  contact@prodes.fr', 120, 22);

  // ── Titre produit ─────────────────────────────────────────────
  doc.setTextColor(17, 24, 39); // #111827
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  const titleLines = doc.splitTextToSize(product.title, 100);
  doc.text(titleLines, 15, 42);

  // ── SKU ───────────────────────────────────────────────────────
  const displaySku = sku ?? product.sku ?? '';
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(107, 114, 128); // #6b7280
  if (displaySku) {
    doc.text(`Référence : ${displaySku}`, 15, 42 + titleLines.length * 7);
  }

  // ── Image produit ─────────────────────────────────────────────
  const imageUrl = product.featuredImage?.url;
  if (imageUrl) {
    try {
      const imgRes = await fetch(imageUrl);
      if (imgRes.ok) {
        const imgBuffer = await imgRes.arrayBuffer();
        const imgBase64 = Buffer.from(imgBuffer).toString('base64');
        const imgMime = imgRes.headers.get('content-type') ?? 'image/jpeg';
        const format = imgMime.includes('png') ? 'PNG' : 'JPEG';
        doc.addImage(
          `data:${imgMime};base64,${imgBase64}`,
          format,
          130,
          35,
          65,
          65,
        );
      }
    } catch {
      log('warn', 'pdf.image_load_failed', { url: imageUrl });
    }
  }

  // ── Description courte ────────────────────────────────────────
  let yPos = 65;
  const shortDesc = product.shortDescription ?? '';
  if (shortDesc) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(17, 24, 39);
    const cleanDesc = shortDesc.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const lines = doc.splitTextToSize(cleanDesc, 100);
    doc.text(lines, 15, yPos);
    yPos += lines.length * 5 + 8;
  }

  // ── Tarifs ───────────────────────────────────────────────────
  yPos = Math.max(yPos, 110);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(17, 24, 39);
  doc.text('Tarif HT', 15, yPos);
  yPos += 6;

  const basePrice = product.regularPrice ?? product.priceMin ?? 0;
  const tiers = product.priceTiers;

  if (tiers && tiers.length > 0) {
    // Tableau dégressif
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setFillColor(243, 244, 246);
    doc.rect(15, yPos, 120, 7, 'F');
    doc.text('Quantité', 17, yPos + 5);
    doc.text('Prix unitaire HT', 65, yPos + 5);
    doc.text('Économie', 110, yPos + 5);
    yPos += 7;

    // Ligne de référence
    doc.setFont('helvetica', 'normal');
    doc.text('1 unité', 17, yPos + 5);
    doc.text(`${basePrice.toFixed(2)} €`, 65, yPos + 5);
    doc.setTextColor(107, 114, 128);
    doc.text('—', 110, yPos + 5);
    doc.setTextColor(17, 24, 39);
    yPos += 7;

    for (const tier of tiers) {
      const pricingType = product.pbqPricingType;
      let finalPrice: number | null = null;

      if (pricingType === 'fixed' && tier.price != null) {
        finalPrice = basePrice - tier.price;
      } else if (pricingType === 'percentage' && tier.discountPercent != null) {
        finalPrice = basePrice * (1 - tier.discountPercent / 100);
      }

      if (finalPrice !== null && finalPrice > 0 && finalPrice < basePrice) {
        const savings = Math.round(((basePrice - finalPrice) / basePrice) * 100);
        doc.setTextColor(17, 24, 39);
        doc.text(`À partir de ${tier.minQuantity}`, 17, yPos + 5);
        doc.text(`${finalPrice.toFixed(2)} €`, 65, yPos + 5);
        doc.setTextColor(22, 163, 74); // vert
        doc.text(`-${savings} %`, 110, yPos + 5);
        doc.setTextColor(17, 24, 39);
        yPos += 7;
      }
    }
  } else if (basePrice > 0) {
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text(`${basePrice.toFixed(2)} € HT`, 15, yPos + 5);
    yPos += 12;
  }

  // ── Éco-participation ─────────────────────────────────────────
  const eco = product.ecoContribution;
  if (eco && eco > 0) {
    yPos += 3;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(107, 114, 128);
    doc.text(`Éco-participation : ${eco.toFixed(2)} € / unité`, 15, yPos);
    yPos += 8;
  }

  // ── Catégorie ─────────────────────────────────────────────────
  if (product.categoryName) {
    yPos += 3;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(107, 114, 128);
    doc.text(`Catégorie : ${product.categoryName}`, 15, yPos);
  }

  // ── Pied de page ─────────────────────────────────────────────
  doc.setFillColor(204, 24, 24);
  doc.rect(0, 277, 210, 20, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(
    'PRODES — Prix HT — TVA 20% non incluse — Document non contractuel',
    15,
    285,
  );
  doc.text(
    `Généré le ${new Date().toLocaleDateString('fr-FR')}`,
    15,
    290,
  );
  doc.text('www.prodes.fr', 175, 290);

  // Return as Buffer
  return Buffer.from(doc.output('arraybuffer'));
}
