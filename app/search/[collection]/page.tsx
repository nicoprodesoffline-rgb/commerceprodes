import { getCollection, getProductsPage, CATALOGUE_PAGE_SIZE } from "lib/supabase";
import { Metadata } from "next";
import { notFound } from "next/navigation";
import { baseUrl } from "lib/utils";

import Grid from "components/grid";
import ProductGridItems from "components/layout/product-grid-items";
import CataloguePagination from "components/layout/catalogue-pagination";
import { defaultSort, sorting } from "lib/constants";

export async function generateMetadata(props: {
  params: Promise<{ collection: string }>;
}): Promise<Metadata> {
  const params = await props.params;
  const collection = await getCollection(params.collection);

  if (!collection) return notFound();

  const title = `${collection.seo?.title || collection.title} — Équipements collectivités | PRODES`;
  const description =
    collection.seo?.description ||
    collection.description ||
    `Découvrez notre gamme ${collection.title} — équipements pour mairies, écoles et collectivités. Devis gratuit sous 24h.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
    },
    alternates: {
      canonical: `${baseUrl}/search/${params.collection}`,
    },
  };
}

export default async function CategoryPage(props: {
  params: Promise<{ collection: string }>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const {
    sort,
    minPrice,
    maxPrice,
    inStock,
    minLength,
    maxLength,
    minWidth,
    maxWidth,
    page: pageParam,
  } = searchParams as { [key: string]: string };

  const page = Math.max(0, parseInt(pageParam ?? "0") || 0);
  const { sortKey, reverse } =
    sorting.find((item) => item.slug === sort) || defaultSort;

  const [collection, result] = await Promise.all([
    getCollection(params.collection),
    getProductsPage({
      category: params.collection,
      sortKey,
      reverse,
      page,
      pageSize: CATALOGUE_PAGE_SIZE,
      minPrice: minPrice ? parseFloat(minPrice) : undefined,
      maxPrice: maxPrice ? parseFloat(maxPrice) : undefined,
      inStockOnly: inStock === "1",
      minLength: minLength ? parseFloat(minLength) : undefined,
      maxLength: maxLength ? parseFloat(maxLength) : undefined,
      minWidth: minWidth ? parseFloat(minWidth) : undefined,
      maxWidth: maxWidth ? parseFloat(maxWidth) : undefined,
    }),
  ]);

  if (!collection) return notFound();

  const { products, total, totalPages } = result;
  const currentParams: Record<string, string | undefined> = {
    sort,
    minPrice,
    maxPrice,
    inStock,
    minLength,
    maxLength,
    minWidth,
    maxWidth,
  };

  return (
    <section>
      <h1 className="mb-1 text-2xl font-bold text-gray-900 dark:text-white">
        {collection.title}
      </h1>
      <p className="mb-6 text-sm text-gray-500">
        {total} produit{total !== 1 ? "s" : ""} dans cette catégorie
        {totalPages > 1 && (
          <span className="ml-2 text-gray-400">
            — page {page + 1}/{totalPages}
          </span>
        )}
      </p>
      {products.length === 0 ? (
        <p className="py-3 text-lg text-neutral-500">
          Aucun produit trouvé dans cette catégorie.
        </p>
      ) : (
        <Grid className="grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          <ProductGridItems products={products} />
        </Grid>
      )}
      <CataloguePagination
        page={page}
        totalPages={totalPages}
        total={total}
        pageSize={CATALOGUE_PAGE_SIZE}
        searchParams={currentParams}
        basePath={`/search/${params.collection}`}
      />
    </section>
  );
}
