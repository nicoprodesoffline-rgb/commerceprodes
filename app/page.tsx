import { Suspense } from "react";
import Hero from "components/home/hero";
import CategoryGrid from "components/home/category-grid";
import FeaturedProducts from "components/home/featured-products";
import ProductCarousel from "components/home/product-carousel";
import Link from "next/link";
import {
  getRootCategories,
  getFeaturedProducts,
  getPromoProducts,
  getNewProducts,
  getHomepageCategories,
} from "lib/supabase/index";

export const metadata = {
  title: "PRODES – Équipements pour collectivités",
  description:
    "Spécialiste des équipements pour mairies, écoles et collectivités. 7 000+ références. Devis gratuit sous 24h. Livraison incluse.",
  openGraph: {
    type: "website",
  },
};

export default async function HomePage() {
  let categories: Awaited<ReturnType<typeof getRootCategories>> = [];
  let featuredProducts: Awaited<ReturnType<typeof getFeaturedProducts>> = [];
  let promoProducts: Awaited<ReturnType<typeof getPromoProducts>> = [];
  let newProducts: Awaited<ReturnType<typeof getNewProducts>> = [];
  let homepageCategories: Awaited<ReturnType<typeof getHomepageCategories>> = [];

  try {
    [categories, featuredProducts, promoProducts, newProducts, homepageCategories] =
      await Promise.all([
        getRootCategories(),
        getFeaturedProducts(12),
        getPromoProducts(12),
        getNewProducts(12),
        getHomepageCategories(),
      ]);
  } catch (e) {
    console.error("Homepage data fetch error:", e);
  }

  return (
    <main>
      {/* Section 1 — Hero */}
      <Hero />

      {/* Section 2 — Bande réassurance */}
      <div className="border-y border-gray-100 bg-[#fafafa]">
        <div className="mx-auto max-w-screen-2xl px-4 py-4 lg:px-6">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              { icon: "🚚", title: "Livraison incluse", sub: "Sur la gamme PUB26" },
              { icon: "📋", title: "Devis sous 24h", sub: "Réponse garantie" },
              { icon: "🏛️", title: "Mandat administratif", sub: "Organismes publics" },
              { icon: "📞", title: "04 67 24 30 34", sub: "Lun–Sam 8h30–19h" },
            ].map((item) => (
              <div key={item.title} className="flex items-center gap-2.5">
                <span className="text-2xl">{item.icon}</span>
                <div>
                  <p className="text-sm font-semibold text-gray-800">{item.title}</p>
                  <p className="text-xs text-gray-500">{item.sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <Suspense>
        {/* Section 3 — Grille catégories */}
        {homepageCategories.length > 0 && (
          <section className="mx-auto max-w-screen-2xl px-4 py-12 lg:px-6">
            <h2 className="text-xl font-bold text-gray-900 mb-6">Nos univers produits</h2>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {homepageCategories.map((cat) => {
                const imgUrl = cat.cover_image_url ?? cat.image_url;
                return (
                  <Link
                    key={cat.slug}
                    href={`/search/${cat.slug}`}
                    className="group relative overflow-hidden rounded-xl border border-gray-200 hover:border-[#cc1818] transition-all duration-200"
                  >
                    <div className="aspect-[16/9] overflow-hidden">
                      {imgUrl ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={imgUrl}
                          alt={cat.name}
                          className="h-full w-full object-cover group-hover:scale-[1.04] transition-transform duration-300"
                        />
                      ) : (
                        <div className="h-full w-full bg-[#fef2f2] flex items-center justify-center">
                          <span className="text-3xl font-bold text-[#cc1818] opacity-30">
                            {cat.name.charAt(0)}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex items-end p-3">
                      <div>
                        <p className="font-semibold text-white text-sm leading-tight">{cat.name}</p>
                        <p className="text-xs text-white/70">{cat.product_count} produits</p>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {/* Fallback CategoryGrid si pas de homepage categories */}
        {homepageCategories.length === 0 && categories.length > 0 && (
          <section className="mx-auto max-w-screen-2xl px-4 py-12 lg:px-6">
            <CategoryGrid categories={categories} />
          </section>
        )}

        {/* Section 4 — Carousel promotions */}
        {promoProducts.length > 0 && (
          <section className="mx-auto max-w-screen-2xl px-4 pb-12 lg:px-6">
            <ProductCarousel
              title="Promotions en cours"
              subtitle="Prix réduits sur une sélection"
              products={promoProducts}
              viewAllHref="/search?promo=1"
            />
          </section>
        )}

        {/* Section 5 — Carousel best-sellers */}
        <section className="mx-auto max-w-screen-2xl px-4 pb-12 lg:px-6">
          <ProductCarousel
            title="Nos best-sellers"
            subtitle="Les produits les plus demandés"
            products={featuredProducts}
            viewAllHref="/search"
          />
        </section>

        {/* Section 6 — Bandeau CTA devis express */}
        <section className="mx-auto max-w-screen-2xl px-4 pb-12 lg:px-6">
          <div className="rounded-xl bg-[#cc1818] px-6 py-8 md:px-10">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-xl font-bold text-white">
                  Besoin d&apos;un devis personnalisé ?
                </h2>
                <p className="mt-1 text-sm text-red-100">
                  Décrivez votre besoin, nous répondons sous 24h
                </p>
              </div>
              <Link
                href="/devis-express"
                className="inline-flex items-center gap-2 rounded-lg bg-white px-6 py-3 text-sm font-semibold text-[#cc1818] hover:bg-red-50 transition-colors whitespace-nowrap self-start md:self-auto"
              >
                Demander un devis →
              </Link>
            </div>
          </div>
        </section>

        {/* Section 7 — Carousel nouveautés */}
        {newProducts.length > 0 && (
          <section className="mx-auto max-w-screen-2xl px-4 pb-16 lg:px-6">
            <ProductCarousel
              title="Nouveautés"
              subtitle="Les derniers ajouts au catalogue"
              products={newProducts}
              viewAllHref="/search?sort=newest"
            />
          </section>
        )}

        {/* Fallback: FeaturedProducts si pas assez de produits */}
        {featuredProducts.length === 0 && (
          <section className="mx-auto max-w-screen-2xl px-4 pb-16 lg:px-6">
            <FeaturedProducts products={[]} />
          </section>
        )}
      </Suspense>
    </main>
  );
}
