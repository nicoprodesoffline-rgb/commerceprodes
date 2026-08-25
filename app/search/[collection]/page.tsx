import { getCollection, getCollectionProductsPage } from "lib/supabase";
import { Metadata } from "next";
import { notFound } from "next/navigation";
import { baseUrl } from "lib/utils";

import Grid from "components/grid";
import CatalogPagination from "components/layout/search/catalog-pagination";
import ProductGridItems from "components/layout/product-grid-items";
import { defaultSort, sorting } from "lib/constants";
import {
  buildCatalogPageUrl,
  CATALOG_PAGE_SIZE,
  normalizePageParam,
} from "lib/search-pagination";

export async function generateMetadata(props: {
  params: Promise<{ collection: string }>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}): Promise<Metadata> {
  const params = await props.params;
  const searchParams = (await props.searchParams) ?? {};
  const currentPage = normalizePageParam(searchParams.page);
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
      canonical: `${baseUrl}${buildCatalogPageUrl(
        `/search/${params.collection}`,
        searchParams,
        currentPage,
      )}`,
    },
  };
}

export default async function CategoryPage(props: {
  params: Promise<{ collection: string }>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const searchParams = (await props.searchParams) ?? {};
  const params = await props.params;
  const { sort, minPrice, maxPrice, inStock, supplier, eco } = searchParams as {
    [key: string]: string;
  };
  const currentPage = normalizePageParam(searchParams.page);
  const { sortKey, reverse } =
    sorting.find((item) => item.slug === sort) || defaultSort;

  const [collection, result] = await Promise.all([
    getCollection(params.collection),
    getCollectionProductsPage({
      collection: params.collection,
      page: currentPage,
      pageSize: CATALOG_PAGE_SIZE,
      sortKey,
      reverse,
      minPrice: minPrice ? parseFloat(minPrice) : undefined,
      maxPrice: maxPrice ? parseFloat(maxPrice) : undefined,
      inStockOnly: inStock === "1",
      supplier: supplier || undefined,
      ecoOnly: eco === "1",
    }),
  ]);

  if (!collection) return notFound();

  const { products, total, totalPages, currentPage: resolvedPage } = result;

  return (
    <section>
      <h1 className="mb-1 text-2xl font-bold text-gray-900 dark:text-white">
        {collection.title}
      </h1>
      <p className="mb-6 text-sm text-gray-500">
        {total} produit{total !== 1 ? "s" : ""} dans cette
        catégorie
      </p>
      {products.length === 0 ? (
        <p className="py-3 text-lg text-neutral-500">
          Aucun produit trouvé dans cette catégorie.
        </p>
      ) : (
        <>
          <Grid className="grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            <ProductGridItems products={products} />
          </Grid>
          <CatalogPagination
            pathname={`/search/${params.collection}`}
            searchParams={searchParams}
            currentPage={resolvedPage}
            totalPages={totalPages}
            totalItems={total}
          />
        </>
      )}
    </section>
  );
}
