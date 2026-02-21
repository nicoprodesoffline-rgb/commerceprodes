import Grid from "components/grid";
import { Product } from "lib/supabase/types";
import Image from "next/image";
import Link from "next/link";

function formatPriceFR(price: number): string {
  return new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2 }).format(price) + " € HT";
}

function PriceRange({ product }: { product: Product }) {
  const min = product.priceMin;
  const max = product.priceMax;

  if (min != null && max != null && min > 0) {
    if (min === max) return <span>{formatPriceFR(min)}</span>;
    return (
      <span>
        {formatPriceFR(min)}
        <span className="mx-1 text-neutral-400">–</span>
        {formatPriceFR(max)}
      </span>
    );
  }

  // Fallback to priceRange strings
  const fallback = parseFloat(product.priceRange.minVariantPrice.amount);
  if (fallback > 0) return <span>{formatPriceFR(fallback)}</span>;
  return <span className="text-neutral-400">Sur devis</span>;
}

export default function ProductGridItems({ products }: { products: Product[] }) {
  return (
    <>
      {products.map((product) => (
        <Grid.Item key={product.handle} className="animate-fadeIn">
          <Link
            className="group relative flex h-full w-full flex-col"
            href={`/product/${product.handle}`}
            prefetch={true}
          >
            {/* Image */}
            <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-lg border border-neutral-200 bg-white hover:border-blue-600 dark:border-neutral-800 dark:bg-black">
              {product.featuredImage?.url ? (
                <Image
                  src={product.featuredImage.url}
                  alt={product.featuredImage.altText || product.title}
                  fill
                  sizes="(min-width: 768px) 33vw, (min-width: 640px) 50vw, 100vw"
                  className="relative h-full w-full object-contain transition duration-300 ease-in-out group-hover:scale-105"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-neutral-300">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M4 5h16v14H4V5zm2 2v10h12V7H6zm3 3a1 1 0 1 1 2 0 1 1 0 0 1-2 0zm-1 7 2.5-3.5L13 16l2.5-3.5L18 17H6z" />
                  </svg>
                </div>
              )}
            </div>

            {/* Info below image */}
            <div className="mt-2 px-1">
              {product.categoryName && (
                <p className="text-xs text-neutral-400 dark:text-neutral-500 truncate">
                  {product.categoryName}
                </p>
              )}
              <h3 className="mt-0.5 line-clamp-2 text-sm font-medium text-neutral-800 dark:text-neutral-200 leading-tight">
                {product.title}
              </h3>
              <p className="mt-1 text-sm font-semibold text-blue-600">
                <PriceRange product={product} />
              </p>
            </div>
          </Link>
        </Grid.Item>
      ))}
    </>
  );
}
