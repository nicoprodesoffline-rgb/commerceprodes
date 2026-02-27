import Grid from "components/grid";
import { ProductCardImage } from "components/product-image";
import CompareButton from "components/product/compare-button";
import { WishlistButton } from "components/product/wishlist-button";
import { ProductBadges } from "components/product/product-badges";
import { Product } from "lib/supabase/types";
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
        <span className="mx-1 text-gray-400">–</span>
        {formatPriceFR(max)}
      </span>
    );
  }

  const fallback = parseFloat(product.priceRange.minVariantPrice.amount);
  if (fallback > 0) return <span>{formatPriceFR(fallback)}</span>;
  return <span className="text-gray-400">Sur devis</span>;
}

export default function ProductGridItems({ products }: { products: Product[] }) {
  return (
    <>
      {products.map((product) => (
        <Grid.Item key={product.handle} className="animate-fadeIn">
          <Link
            className="group relative flex h-full w-full flex-col rounded-lg border border-gray-200 bg-white overflow-hidden hover:border-[#cc1818] hover:shadow-md transition-all duration-200"
            href={`/product/${product.handle}`}
            prefetch={true}
          >
            {/* Image — ratio 4:3 */}
            <div className="relative w-full aspect-[4/3] overflow-hidden bg-gray-50">
              <ProductBadges product={product} />
              {product.featuredImage?.url ? (
                <ProductCardImage
                  src={product.featuredImage.url}
                  alt={product.featuredImage.altText || product.title}
                  sizes="(min-width: 768px) 33vw, (min-width: 640px) 50vw, 100vw"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-gray-300">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M4 5h16v14H4V5zm2 2v10h12V7H6zm3 3a1 1 0 1 1 2 0 1 1 0 0 1-2 0zm-1 7 2.5-3.5L13 16l2.5-3.5L18 17H6z" />
                  </svg>
                </div>
              )}

              {/* Badge livraison offerte */}
              {product.isFreeshipping && (
                <span className="absolute bottom-2 left-2 rounded-full bg-green-600 px-2 py-0.5 text-xs font-medium text-white">
                  Livraison offerte
                </span>
              )}

              {/* Badge "Voir le produit" au hover */}
              <div className="absolute inset-0 flex items-center justify-center bg-[#cc1818]/0 group-hover:bg-[#cc1818]/10 transition-colors duration-200">
                <span className="translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-200 rounded-md bg-[#cc1818] px-4 py-1.5 text-xs font-semibold text-white shadow">
                  Voir le produit
                </span>
              </div>
            </div>

            {/* Info sous l'image */}
            <div className="flex flex-1 flex-col p-3">
              {/* Badge catégorie */}
              {product.categoryName && (
                <span className="mb-1 self-start rounded-sm bg-red-50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[#cc1818]">
                  {product.categoryName}
                </span>
              )}

              <h3 className="line-clamp-2 text-sm font-medium text-gray-800 leading-tight flex-1">
                {product.title}
              </h3>

              <p className="mt-2 text-sm font-bold text-gray-900">
                <PriceRange product={product} />
              </p>
              <div className="mt-2 flex items-center gap-2">
                <CompareButton handle={product.handle} title={product.title} />
                <WishlistButton handle={product.handle} />
              </div>
            </div>
          </Link>
        </Grid.Item>
      ))}
    </>
  );
}
