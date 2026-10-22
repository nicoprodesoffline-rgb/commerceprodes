import { getCategories, getCategoryBySlug, getFamiliesInCategory } from "lib/site-dto";
import { Metadata } from "next";
import { notFound } from "next/navigation";

import Grid from "components/grid";
import ProductGridItems from "components/layout/product-grid-items";

export async function generateMetadata(props: {
  params: Promise<{ collection: string }>;
}): Promise<Metadata> {
  const params = await props.params;
  const category = getCategoryBySlug(params.collection);

  if (!category) return notFound();

  return {
    title: `${category.name} — Équipements collectivités | PRODES`,
    description: `Découvrez notre gamme ${category.name} — équipements pour mairies, écoles et collectivités.`,
  };
}

export default async function CategoryPage(props: {
  params: Promise<{ collection: string }>;
}) {
  const params = await props.params;
  const category = getCategoryBySlug(params.collection);

  if (!category) return notFound();

  const families = getFamiliesInCategory(category.category_key);

  return (
    <section>
      <h1 className="mb-1 text-2xl font-bold text-gray-900 dark:text-white">{category.name}</h1>
      <p className="mb-6 text-sm text-gray-500">
        {families.length} famille{families.length !== 1 ? "s" : ""} dans cette catégorie
      </p>
      {families.length === 0 ? (
        <p className="py-3 text-lg text-neutral-500">Aucune famille dans cette catégorie.</p>
      ) : (
        <Grid className="grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          <ProductGridItems families={families} categories={getCategories()} />
        </Grid>
      )}
    </section>
  );
}
