import { Suspense } from "react";
import Hero from "components/home/hero";
import TrustBar from "components/home/trust-bar";
import CategoryGrid from "components/home/category-grid";
import FeaturedProducts from "components/home/featured-products";
import { getRootCategories, getFeaturedProducts } from "lib/supabase/index";

export const metadata = {
  title: "PRODES – Équipements pour collectivités",
  description:
    "Large choix de tables, chaises, mobilier urbain, signalisation. Livraison rapide. Meilleurs prix HT pour les organismes publics.",
  openGraph: {
    type: "website",
  },
};

export default async function HomePage() {
  let categories: Awaited<ReturnType<typeof getRootCategories>> = [];
  let featuredProducts: Awaited<ReturnType<typeof getFeaturedProducts>> = [];
  try {
    [categories, featuredProducts] = await Promise.all([
      getRootCategories(),
      getFeaturedProducts(8),
    ]);
  } catch (e) {
    console.error('Homepage data fetch error:', e);
  }

  return (
    <main>
      <Hero />
      <TrustBar />
      <Suspense>
        <section className="mx-auto max-w-screen-2xl px-4 py-12 lg:px-6">
          <CategoryGrid categories={categories} />
        </section>
        <section className="mx-auto max-w-screen-2xl px-4 pb-16 lg:px-6">
          <FeaturedProducts products={featuredProducts} />
        </section>
      </Suspense>
    </main>
  );
}
