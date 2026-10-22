import Grid from "components/grid";
import ProductGridItems from "components/layout/product-grid-items";
import { getCategories, getFamilies } from "lib/site-dto";

export const metadata = {
  title: "Catalogue – PRODES",
  description: "Recherchez parmi nos équipements pour collectivités.",
};

export default async function SearchPage(props: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const searchParams = await props.searchParams;
  const q = typeof searchParams?.q === "string" ? searchParams.q.trim() : "";
  const needle = q.toLocaleLowerCase("fr");
  const families = getFamilies().filter(
    (f) =>
      !needle ||
      f.name.toLocaleLowerCase("fr").includes(needle) ||
      f.description_short.toLocaleLowerCase("fr").includes(needle),
  );

  return (
    <>
      <h1 className="mb-1 text-2xl font-bold text-gray-900 dark:text-white">
        {q ? `Résultats pour « ${q} »` : "Tout le catalogue"}
      </h1>
      <p className="mb-6 text-sm text-gray-500">
        {families.length === 0
          ? "Aucune famille ne correspond à cette recherche."
          : `${families.length} famille${families.length > 1 ? "s" : ""}`}
      </p>
      {families.length > 0 ? (
        <Grid className="grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          <ProductGridItems families={families} categories={getCategories()} />
        </Grid>
      ) : null}
    </>
  );
}
