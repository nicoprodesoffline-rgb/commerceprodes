import { GridTileImage } from "components/grid/tile";
import Link from "next/link";
import type { Product } from "lib/supabase/types";

interface CompatibleProductsProps {
  products: Product[];
  title?: string;
}

/**
 * Server component — shows a horizontal scroll list of compatible/recommended products.
 * Identical in structure to RelatedProducts but with different label.
 */
export function CompatibleProducts({ products, title = "Produits compatibles" }: CompatibleProductsProps) {
  if (!products.length) return null;

  return (
    <div className="py-6">
      <h2 className="mb-4 text-xl font-bold text-gray-900">{title}</h2>
      <ul className="flex w-full gap-4 overflow-x-auto pt-1">
        {products.map((product) => (
          <li
            key={product.handle}
            className="aspect-square w-full flex-none min-[475px]:w-1/2 sm:w-1/3 md:w-1/4 lg:w-1/5"
          >
            <Link
              className="relative h-full w-full"
              href={`/product/${product.handle}`}
              prefetch={true}
            >
              <GridTileImage
                alt={product.title}
                label={{
                  title: product.title,
                  amount: product.priceRange.maxVariantPrice.amount,
                  currencyCode: product.priceRange.maxVariantPrice.currencyCode,
                }}
                src={product.featuredImage?.url}
                fill
                sizes="(min-width: 1024px) 20vw, (min-width: 768px) 25vw, (min-width: 640px) 33vw, (min-width: 475px) 50vw, 100vw"
              />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
