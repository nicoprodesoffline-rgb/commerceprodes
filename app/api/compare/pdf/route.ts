import { NextRequest, NextResponse } from "next/server";
import { getProduct } from "lib/supabase/index";
import { rateLimit } from "lib/rate-limit";
import { sanitizeHandle } from "lib/validation";
import type { Product } from "lib/supabase/types";

export const dynamic = "force-dynamic";

function formatPrice(p: number | undefined | null): string {
  if (!p) return "Sur devis";
  return new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2 }).format(p) + " € HT";
}

function attr(label: string, value: string): string {
  return `
    <tr>
      <td class="label">${label}</td>
      ${value}
    </tr>`;
}

function buildHtml(products: Product[], exportDate: string): string {
  const colCount = products.length;
  const colWidth = Math.floor(75 / colCount);

  const rows: Array<{ label: string; values: (p: Product) => string }> = [
    {
      label: "Référence",
      values: (p) => `<span class="mono">${p.sku ?? "—"}</span>`,
    },
    {
      label: "Prix HT",
      values: (p) => {
        const price = p.priceMin ?? parseFloat(p.priceRange.minVariantPrice.amount) ?? 0;
        return `<strong>${formatPrice(price > 0 ? price : null)}</strong>`;
      },
    },
    {
      label: "Éco-participation",
      values: (p) =>
        p.ecoContribution && p.ecoContribution > 0 ? formatPrice(p.ecoContribution) : "—",
    },
    {
      label: "Disponibilité",
      values: (p) => (p.availableForSale ? "✓ En stock" : "Sur commande"),
    },
    {
      label: "Tarifs dégressifs",
      values: (p) => (p.pbqEnabled ? "Oui" : "Non"),
    },
    {
      label: "Livraison",
      values: (p) => (p.isFreeshipping ? "Offerte" : "Incluse"),
    },
    {
      label: "Dimensions (L×l×H cm)",
      values: (p) => {
        const parts = [p.lengthCm, p.widthCm, p.heightCm];
        const filled = parts.filter((x) => x != null);
        return filled.length > 0 ? parts.map((x) => x ?? "–").join(" × ") : "—";
      },
    },
    {
      label: "Poids (kg)",
      values: (p) => (p.weightKg != null ? String(p.weightKg) : "—"),
    },
    {
      label: "Catégorie",
      values: (p) => p.categoryName ?? "—",
    },
    {
      label: "Variantes",
      values: (p) => (p.variants.length > 1 ? `${p.variants.length} coloris` : "—"),
    },
  ];

  const headerCells = products
    .map((p) => `<th style="width:${colWidth}%">${p.title}</th>`)
    .join("\n");

  const bodyRows = rows
    .map(({ label, values }) => {
      const cells = products.map((p) => `<td>${values(p)}</td>`).join("\n");
      return `<tr><td class="label">${label}</td>${cells}</tr>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Comparatif produits — PRODES</title>
<style>
  @page { size: A4 landscape; margin: 12mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #111827; }
  header { background: #cc1818; color: white; padding: 10px 16px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; border-radius: 4px; }
  header h1 { font-size: 16px; font-weight: 700; }
  header p { font-size: 9px; opacity: 0.85; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #f3f4f6; border: 1px solid #d1d5db; padding: 6px 8px; text-align: left; font-size: 10px; font-weight: 600; color: #374151; }
  td { border: 1px solid #e5e7eb; padding: 5px 8px; vertical-align: top; }
  td.label { background: #f9fafb; font-weight: 600; color: #6b7280; width: 22%; white-space: nowrap; font-size: 10px; }
  tr:nth-child(even) td:not(.label) { background: #fafafa; }
  .mono { font-family: monospace; color: #6b7280; }
  strong { color: #111827; }
  .product-img { max-height: 90px; max-width: 100%; object-fit: contain; display: block; margin: 0 auto 6px; }
  .product-title { font-weight: 700; font-size: 11px; color: #111827; }
  footer { margin-top: 14px; font-size: 9px; color: #9ca3af; text-align: center; }
  @media print {
    header { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    td.label { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .no-print { display: none !important; }
  }
</style>
</head>
<body>
<header>
  <div>
    <h1>PRODES — Comparatif produits</h1>
    <p>Équipements pour collectivités · prodes.fr · 04 67 24 30 34</p>
  </div>
  <p>Exporté le ${exportDate}</p>
</header>
<button class="no-print" onclick="window.print()" style="margin-bottom:10px;background:#cc1818;color:white;border:none;border-radius:4px;padding:6px 14px;font-size:12px;cursor:pointer;font-weight:600">
  🖨 Imprimer / Enregistrer PDF
</button>
<table>
  <thead>
    <tr>
      <th style="width:22%">Critère</th>
      ${headerCells}
    </tr>
    <tr>
      <td class="label">Photo</td>
      ${products
        .map(
          (p) =>
            `<td style="text-align:center">${
              p.featuredImage?.url
                ? `<img src="${p.featuredImage.url}" class="product-img" alt="${p.title}">`
                : "—"
            }</td>`,
        )
        .join("\n")}
    </tr>
  </thead>
  <tbody>
    ${bodyRows}
  </tbody>
</table>
<footer>
  Document généré automatiquement par PRODES · ${exportDate} · Les prix sont indicatifs HT et peuvent varier. Contactez-nous pour un devis personnalisé.
</footer>
</body>
</html>`;
}

export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? "unknown";
  if (!rateLimit(ip, 10, 60000)) {
    return new NextResponse("Trop de requêtes", { status: 429 });
  }

  const { searchParams } = req.nextUrl;
  const handlesRaw = searchParams.get("handles") ?? "";
  const handles = handlesRaw
    .split(",")
    .map((h) => sanitizeHandle(h.trim()))
    .filter(Boolean)
    .slice(0, 4);

  if (handles.length < 2) {
    return new NextResponse("Au moins 2 handles requis", { status: 400 });
  }

  const results = await Promise.allSettled(handles.map((h) => getProduct(h)));
  const products: Product[] = results
    .filter(
      (r): r is PromiseFulfilledResult<NonNullable<Product>> =>
        r.status === "fulfilled" && r.value != null,
    )
    .map((r) => r.value);

  if (products.length < 2) {
    return new NextResponse("Produits introuvables", { status: 404 });
  }

  const exportDate = new Date().toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  const html = buildHtml(products, exportDate);

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
