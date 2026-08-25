import type { Metadata } from "next";
import Grid from "components/grid";
import CatalogPagination from "components/layout/search/catalog-pagination";
import ProductGridItems from "components/layout/product-grid-items";
import { defaultSort, sorting } from "lib/constants";
import {
  buildCatalogPageUrl,
  CATALOG_PAGE_SIZE,
  normalizePageParam,
} from "lib/search-pagination";
import { getProductsPage } from "lib/supabase";
import { baseUrl } from "lib/utils";

export async function generateMetadata(props: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}): Promise<Metadata> {
  const searchParams = (await props.searchParams) ?? {};
  const currentPage = normalizePageParam(searchParams.page);
  const canonicalPath = buildCatalogPageUrl("/search", searchParams, currentPage);

  return {
    title: "Catalogue – PRODES",
    description: "Recherchez parmi nos équipements pour collectivités.",
    alternates: {
      canonical: `${baseUrl}${canonicalPath}`,
    },
  };
}

export default async function SearchPage(props: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const searchParams = (await props.searchParams) ?? {};
  const {
    sort,
    q: searchValue,
    minPrice,
    maxPrice,
    inStock,
    supplier,
    eco,
  } = searchParams as { [key: string]: string };
  const currentPage = normalizePageParam(searchParams.page);
  const { sortKey, reverse } =
    sorting.find((item) => item.slug === sort) || defaultSort;

  const result = await getProductsPage({
    page: currentPage,
    pageSize: CATALOG_PAGE_SIZE,
    sortKey,
    reverse,
    query: searchValue,
    minPrice: minPrice ? parseFloat(minPrice) : undefined,
    maxPrice: maxPrice ? parseFloat(maxPrice) : undefined,
    inStockOnly: inStock === "1",
    supplier: supplier || undefined,
    ecoOnly: eco === "1",
  });
  const { products, total, totalPages, currentPage: resolvedPage } = result;
  const resultsText = total > 1 ? "résultats" : "résultat";

  return (
    <>
      <h1 className="mb-1 text-2xl font-bold text-gray-900 dark:text-white">
        {searchValue
          ? `Résultats pour « ${searchValue} »`
          : "Tout le catalogue"}
      </h1>
      {searchValue ? (
        <p className="mb-6 text-sm text-gray-500">
          {total === 0
            ? "Aucun produit ne correspond à cette recherche."
            : `${total} ${resultsText}`}
        </p>
      ) : (
        <p className="mb-6 text-sm text-gray-500">
          {total} produit{total !== 1 ? "s" : ""}
        </p>
      )}
      {products.length > 0 ? (
        <>
          <Grid className="grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            <ProductGridItems products={products} />
          </Grid>
          <CatalogPagination
            pathname="/search"
            searchParams={searchParams}
            currentPage={resolvedPage}
            totalPages={totalPages}
            totalItems={total}
          />
        </>
      ) : null}
    </>
  );
}
