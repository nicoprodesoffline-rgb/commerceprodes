"use client";

import { useEffect, useState } from "react";
import { getRecentlyViewed } from "lib/recently-viewed";
import Link from "next/link";
import Image from "next/image";

interface RecentProduct {
  id: string;
  handle: string;
  title: string;
  regular_price: number;
  featured_image_url?: string;
}

function formatHT(n: number) {
  return new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2 }).format(n) + " € HT";
}

export function RecentlyViewed({ currentHandle }: { currentHandle: string }) {
  const [products, setProducts] = useState<RecentProduct[]>([]);

  useEffect(() => {
    const handles = getRecentlyViewed().filter((h) => h !== currentHandle).slice(0, 8);
    if (handles.length < 2) return;
    fetch(`/api/products-by-handles?handles=${handles.join(",")}`)
      .then((r) => r.json())
      .then((data) => setProducts(data.products ?? []))
      .catch(() => {});
  }, [currentHandle]);

  if (products.length < 2) return null;

  return (
    <section className="mt-10 border-t border-gray-100 pt-8">
      <h2 className="mb-4 text-lg font-semibold text-gray-900">Récemment consultés</h2>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {products.map((p) => (
          <Link
            key={p.handle}
            href={`/product/${p.handle}`}
            className="group flex-none w-36 rounded-lg border border-gray-200 bg-white overflow-hidden hover:border-[#cc1818] hover:shadow-sm transition-all"
          >
            <div className="relative aspect-square bg-gray-50">
              {p.featured_image_url ? (
                <Image
                  src={p.featured_image_url}
                  alt={p.title}
                  fill
                  className="object-contain p-2"
                  sizes="144px"
                />
              ) : (
                <div className="h-full w-full bg-gray-100" />
              )}
            </div>
            <div className="p-2">
              <p className="line-clamp-2 text-xs font-medium text-gray-800 group-hover:text-[#cc1818] transition-colors">
                {p.title}
              </p>
              <p className="mt-1 text-xs font-bold text-gray-900">
                {formatHT(p.regular_price)}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
