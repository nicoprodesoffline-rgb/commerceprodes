import Link from "next/link";
import Grid from "components/grid";
import ProductGridItems from "components/layout/product-grid-items";
import type { Product } from "lib/supabase/types";

export default function FeaturedProducts({ products }: { products: Product[] }) {
  if (!products.length) return null;

  return (
    <section>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Produits récents</h2>
        <Link
          href="/search"
          className="text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors"
        >
          Voir tout →
        </Link>
      </div>
      <Grid className="grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
        <ProductGridItems products={products} />
      </Grid>
    </section>
  );
}
