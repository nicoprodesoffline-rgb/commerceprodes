"use client";

import Link from "next/link";
import Image from "next/image";
import type { Product } from "lib/supabase/types";
import { useCompare } from "lib/compare/context";

function formatPriceFR(price: number): string {
  return new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2 }).format(price) + " € HT";
}

interface CompareClientProps {
  products: Product[];
}

export default function CompareClient({ products }: CompareClientProps) {
  const { removeFromCompare } = useCompare();

  if (products.length < 2) {
    return (
      <div className="mx-auto max-w-screen-lg px-4 py-16 text-center">
        <div className="text-4xl mb-4">⚖️</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Comparateur de produits</h1>
        <p className="text-gray-500 mb-6">
          Sélectionnez au moins 2 produits pour les comparer côte à côte.
        </p>
        <Link
          href="/search"
          className="inline-flex items-center gap-2 rounded-lg bg-[#cc1818] px-6 py-3 text-sm font-semibold text-white hover:bg-[#b01414] transition-colors"
        >
          ← Retour au catalogue
        </Link>
      </div>
    );
  }

  // Best price index
  const prices = products.map((p) => p.priceMin ?? parseFloat(p.priceRange.minVariantPrice.amount) ?? 0);
  const minPrice = Math.min(...prices.filter((p) => p > 0));

  function isBestPrice(product: Product): boolean {
    const p = product.priceMin ?? parseFloat(product.priceRange.minVariantPrice.amount) ?? 0;
    return p > 0 && p === minPrice;
  }

  const rows: Array<{ label: string; getValue: (p: Product) => React.ReactNode }> = [
    {
      label: "Photo",
      getValue: (p) => (
        <div className="aspect-square max-h-48 overflow-hidden rounded-lg bg-gray-50">
          {p.featuredImage?.url ? (
            <Image
              src={p.featuredImage.url}
              alt={p.title}
              width={200}
              height={200}
              className="h-full w-full object-contain"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-gray-300 text-3xl">📦</div>
          )}
        </div>
      ),
    },
    {
      label: "Nom",
      getValue: (p) => <span className="font-semibold text-gray-900">{p.title}</span>,
    },
    {
      label: "Référence / SKU",
      getValue: (p) => (
        <span className="font-mono text-sm text-gray-500">{p.sku ?? "—"}</span>
      ),
    },
    {
      label: "Prix HT",
      getValue: (p) => {
        const price = p.priceMin ?? parseFloat(p.priceRange.minVariantPrice.amount) ?? 0;
        const best = isBestPrice(p);
        return (
          <div className={best ? "rounded-md bg-[#fef2f2] px-2 py-1" : ""}>
            <span className="text-lg font-bold text-gray-900">
              {price > 0 ? formatPriceFR(price) : "Sur devis"}
            </span>
            {best && (
              <span className="ml-2 rounded-full bg-[#cc1818] px-2 py-0.5 text-xs font-medium text-white">
                Meilleur prix
              </span>
            )}
          </div>
        );
      },
    },
    {
      label: "Éco-participation",
      getValue: (p) =>
        p.ecoContribution && p.ecoContribution > 0
          ? formatPriceFR(p.ecoContribution)
          : "—",
    },
    {
      label: "Tarifs dégressifs",
      getValue: (p) =>
        p.pbqEnabled ? (
          <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
            Oui
          </span>
        ) : (
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">Non</span>
        ),
    },
    {
      label: "Coloris disponibles",
      getValue: (p) => {
        const colorVariants = p.variants.length;
        return colorVariants > 1 ? `${colorVariants} variantes` : "—";
      },
    },
    {
      label: "Catégorie",
      getValue: (p) =>
        p.categoryName ? (
          <span className="rounded-sm bg-red-50 px-1.5 py-0.5 text-xs text-[#cc1818]">
            {p.categoryName}
          </span>
        ) : (
          "—"
        ),
    },
    {
      label: "Livraison",
      getValue: (p) =>
        p.isFreeshipping ? (
          <span className="text-green-700 font-medium">Offerte</span>
        ) : (
          <span className="text-gray-500">Incluse</span>
        ),
    },
    {
      label: "Stock",
      getValue: (p) =>
        p.availableForSale ? (
          <span className="text-green-700 font-medium">Disponible</span>
        ) : (
          <span className="text-orange-600">Sur commande</span>
        ),
    },
  ];

  return (
    <div className="mx-auto max-w-screen-xl px-4 py-10 lg:px-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Comparateur</h1>
          <p className="text-sm text-gray-500">{products.length} produits comparés</p>
        </div>
        <Link href="/search" className="text-sm text-[#cc1818] hover:underline">
          ← Retour au catalogue
        </Link>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[600px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="w-32 px-4 py-3 text-left text-xs font-medium text-gray-500" />
              {products.map((p) => (
                <th
                  key={p.handle}
                  className="px-4 py-3 text-left font-medium text-gray-700"
                >
                  <span className="line-clamp-1">{p.title}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={row.label}
                className={`border-b border-gray-100 ${i % 2 === 0 ? "bg-white" : "bg-gray-50"}`}
              >
                <td className="px-4 py-3 text-xs font-medium text-gray-600 bg-gray-50 whitespace-nowrap">
                  {row.label}
                </td>
                {products.map((p) => (
                  <td key={p.handle} className="px-4 py-3 text-gray-700">
                    {row.getValue(p)}
                  </td>
                ))}
              </tr>
            ))}

            {/* Actions row */}
            <tr className="border-b border-gray-200 bg-white">
              <td className="px-4 py-4 text-xs font-medium text-gray-600 bg-gray-50" />
              {products.map((p) => (
                <td key={p.handle} className="px-4 py-4">
                  <div className="flex flex-col gap-2">
                    <Link
                      href={`/product/${p.handle}`}
                      className="rounded-lg bg-[#cc1818] px-4 py-2 text-center text-xs font-semibold text-white hover:bg-[#b01414] transition-colors"
                    >
                      Voir la fiche →
                    </Link>
                    <button
                      onClick={() => removeFromCompare(p.handle)}
                      className="text-xs text-gray-400 hover:text-gray-600 transition-colors text-center"
                    >
                      Retirer
                    </button>
                  </div>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
