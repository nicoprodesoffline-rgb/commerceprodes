import Hero from "components/home/hero";
import CategoryGrid from "components/home/category-grid";
import Grid from "components/grid";
import ProductGridItems from "components/layout/product-grid-items";
import { getCategories, getFamilies } from "lib/site-dto";

export const metadata = {
  title: "PRODES – Équipements pour collectivités",
  description: "Spécialiste des équipements pour mairies, écoles et collectivités.",
  openGraph: {
    type: "website",
  },
};

// S01 : accueil fixe + catégories (snapshot) + familles. Une famille n'est pas
// achetable directement : on choisit une variante (item) sur sa fiche.
export default function HomePage() {
  const categories = getCategories();
  const families = getFamilies();

  return (
    <>
      <Hero />

      <section className="mx-auto max-w-screen-2xl px-4 py-12 lg:px-6">
        <CategoryGrid categories={categories} />
      </section>

      <section className="mx-auto max-w-screen-2xl px-4 pb-16 lg:px-6">
        <h2 className="mb-2 text-2xl font-bold text-gray-900">Nos familles de produits</h2>
        <p className="mb-6 text-sm text-gray-500">
          {families.length} familles · le prix dépend de la variante et de la quantité choisies sur
          la fiche.
        </p>
        <Grid className="grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          <ProductGridItems families={families} categories={categories} />
        </Grid>
      </section>
    </>
  );
}
