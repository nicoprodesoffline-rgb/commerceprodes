import Grid from "components/grid";
import ProductGridItems from "components/layout/product-grid-items";
import { defaultSort, sorting } from "lib/constants";
import { getProducts } from "lib/supabase";

export const metadata = {
  title: "Catalogue – PRODES",
  description: "Recherchez parmi nos équipements pour collectivités.",
};

export default async function SearchPage(props: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const searchParams = await props.searchParams;
  const { sort, q: searchValue, minPrice, maxPrice, inStock } = searchParams as { [key: string]: string };
  const { sortKey, reverse } =
    sorting.find((item) => item.slug === sort) || defaultSort;

  const products = await getProducts({
    sortKey,
    reverse,
    query: searchValue,
    minPrice: minPrice ? parseFloat(minPrice) : undefined,
    maxPrice: maxPrice ? parseFloat(maxPrice) : undefined,
    inStockOnly: inStock === "1",
  });
  const resultsText = products.length > 1 ? "résultats" : "résultat";

  return (
    <>
      <h1 className="mb-1 text-2xl font-bold text-gray-900 dark:text-white">
        {searchValue
          ? `Résultats pour « ${searchValue} »`
          : "Tout le catalogue"}
      </h1>
      {searchValue ? (
        <p className="mb-6 text-sm text-gray-500">
          {products.length === 0
            ? "Aucun produit ne correspond à cette recherche."
            : `${products.length} ${resultsText}`}
        </p>
      ) : (
        <p className="mb-6 text-sm text-gray-500">
          {products.length} produit{products.length !== 1 ? "s" : ""}
        </p>
      )}
      {products.length > 0 ? (
        <Grid className="grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          <ProductGridItems products={products} />
        </Grid>
      ) : null}
    </>
  );
}
