import Grid from "components/grid";
import ProductGridItems from "components/layout/product-grid-items";
import CataloguePagination from "components/layout/catalogue-pagination";
import { defaultSort, sorting } from "lib/constants";
import { getProductsPage, CATALOGUE_PAGE_SIZE } from "lib/supabase";

export const metadata = {
  title: "Catalogue – PRODES",
  description: "Recherchez parmi nos équipements pour collectivités.",
};

export default async function SearchPage(props: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const searchParams = await props.searchParams;
  const {
    sort,
    q: searchValue,
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

  const result = await getProductsPage({
    sortKey,
    reverse,
    query: searchValue,
    page,
    pageSize: CATALOGUE_PAGE_SIZE,
    minPrice: minPrice ? parseFloat(minPrice) : undefined,
    maxPrice: maxPrice ? parseFloat(maxPrice) : undefined,
    inStockOnly: inStock === "1",
    minLength: minLength ? parseFloat(minLength) : undefined,
    maxLength: maxLength ? parseFloat(maxLength) : undefined,
    minWidth: minWidth ? parseFloat(minWidth) : undefined,
    maxWidth: maxWidth ? parseFloat(maxWidth) : undefined,
  });

  const { products, total, totalPages, hasMore } = result;
  const resultsText = total > 1 ? "résultats" : "résultat";

  const currentParams: Record<string, string | undefined> = {
    sort,
    q: searchValue,
    minPrice,
    maxPrice,
    inStock,
    minLength,
    maxLength,
    minWidth,
    maxWidth,
  };

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
          {totalPages > 1 && (
            <span className="ml-2 text-gray-400">
              — page {page + 1}/{totalPages}
            </span>
          )}
        </p>
      )}
      {products.length > 0 ? (
        <Grid className="grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          <ProductGridItems products={products} />
        </Grid>
      ) : null}
      <CataloguePagination
        page={page}
        totalPages={totalPages}
        total={total}
        pageSize={CATALOGUE_PAGE_SIZE}
        searchParams={currentParams}
        basePath="/search"
      />
    </>
  );
}
