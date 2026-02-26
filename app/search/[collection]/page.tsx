import { getCollection, getCollectionProducts } from "lib/supabase";
import { Metadata } from "next";
import { notFound } from "next/navigation";
import { baseUrl } from "lib/utils";

import Grid from "components/grid";
import ProductGridItems from "components/layout/product-grid-items";
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
  const { sort } = searchParams as { [key: string]: string };
  const { sortKey, reverse } =
    sorting.find((item) => item.slug === sort) || defaultSort;

  const [collection, products] = await Promise.all([
    getCollection(params.collection),
    getCollectionProducts({ collection: params.collection, sortKey, reverse }),
  ]);

  if (!collection) return notFound();

  return (
    <section>
      <h1 className="mb-1 text-2xl font-bold text-gray-900 dark:text-white">
        {collection.title}
      </h1>
      <p className="mb-6 text-sm text-gray-500">
        {products.length} produit{products.length !== 1 ? "s" : ""} dans cette catégorie
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
    </section>
  );
}
