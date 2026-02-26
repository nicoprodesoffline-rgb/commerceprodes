"use client";

import useEmblaCarousel from "embla-carousel-react";
import Link from "next/link";
import { useCallback } from "react";
import type { Product } from "lib/supabase/types";
import { ProductCardImage } from "components/product-image";

function formatPriceFR(price: number): string {
  return new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2 }).format(price) + " € HT";
}

function ProductPrice({ product }: { product: Product }) {
  const min = product.priceMin;
  const max = product.priceMax;
  if (min != null && max != null && min > 0) {
    if (min === max) return <span>{formatPriceFR(min)}</span>;
    return (
      <span>
        {formatPriceFR(min)}<span className="mx-1 text-gray-400">–</span>{formatPriceFR(max)}
      </span>
    );
  }
  const fallback = parseFloat(product.priceRange.minVariantPrice.amount);
  if (fallback > 0) return <span>{formatPriceFR(fallback)}</span>;
  return <span className="text-gray-400">Sur devis</span>;
}

interface ProductCarouselProps {
  title: string;
  subtitle: string;
  products: Product[];
  viewAllHref: string;
}

export default function ProductCarousel({ title, subtitle, products, viewAllHref }: ProductCarouselProps) {
  const [emblaRef, emblaApi] = useEmblaCarousel({
    align: "start",
    containScroll: "trimSnaps",
    slidesToScroll: 1,
  });

  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);

  if (products.length === 0) return null;

  return (
    <div className="w-full">
      {/* En-tête */}
      <div className="flex items-end justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900">{title}</h2>
          <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Boutons desktop */}
          <button
            onClick={scrollPrev}
            className="hidden md:flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 bg-white shadow-sm hover:bg-gray-50 transition-colors"
            aria-label="Précédent"
          >
            <svg className="h-4 w-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            onClick={scrollNext}
            className="hidden md:flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 bg-white shadow-sm hover:bg-gray-50 transition-colors"
            aria-label="Suivant"
          >
            <svg className="h-4 w-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <Link href={viewAllHref} className="text-sm text-[#cc1818] hover:underline ml-1">
            Voir tout →
          </Link>
        </div>
      </div>

      {/* Carousel desktop (Embla) */}
      <div className="hidden md:block overflow-hidden" ref={emblaRef}>
        <div className="flex gap-4">
          {products.map((product) => (
            <div
              key={product.handle}
              className="flex-none w-[calc(25%-12px)] lg:w-[calc(25%-12px)] xl:w-[calc(25%-12px)]"
            >
              <CarouselCard product={product} />
            </div>
          ))}
        </div>
      </div>

      {/* Scroll horizontal mobile */}
      <div className="flex md:hidden gap-3 overflow-x-auto snap-x snap-mandatory pb-3 scrollbar-hide">
        {products.map((product) => (
          <div key={product.handle} className="flex-none w-[72vw] snap-start">
            <CarouselCard product={product} />
          </div>
        ))}
      </div>
    </div>
  );
}

function CarouselCard({ product }: { product: Product }) {
  return (
    <Link
      href={`/product/${product.handle}`}
      className="group flex flex-col rounded-lg border border-gray-200 bg-white overflow-hidden hover:border-[#cc1818] hover:shadow-md transition-all duration-200"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-gray-50">
        {product.featuredImage?.url ? (
          <ProductCardImage
            src={product.featuredImage.url}
            alt={product.featuredImage.altText || product.title}
            sizes="(min-width: 1024px) 25vw, (min-width: 768px) 33vw, 75vw"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-gray-300">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor">
              <path d="M4 5h16v14H4V5zm2 2v10h12V7H6zm3 3a1 1 0 1 1 2 0 1 1 0 0 1-2 0zm-1 7 2.5-3.5L13 16l2.5-3.5L18 17H6z" />
            </svg>
          </div>
        )}
        <div className="absolute inset-0 flex items-center justify-center bg-[#cc1818]/0 group-hover:bg-[#cc1818]/10 transition-colors duration-200">
          <span className="translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-200 rounded-md bg-[#cc1818] px-3 py-1 text-xs font-semibold text-white shadow">
            Voir le produit
          </span>
        </div>
      </div>

      <div className="flex flex-1 flex-col p-3">
        {product.categoryName && (
          <span className="mb-1 self-start rounded-sm bg-red-50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[#cc1818]">
            {product.categoryName}
          </span>
        )}
        <h3 className="line-clamp-2 text-sm font-medium text-gray-800 leading-tight flex-1">
          {product.title}
        </h3>
        <p className="mt-2 text-sm font-bold text-gray-900">
          <ProductPrice product={product} />
        </p>
      </div>
    </Link>
  );
}
