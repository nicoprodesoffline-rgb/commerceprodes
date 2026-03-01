import { Suspense } from "react";
import Hero from "components/home/hero";
import CategoryGrid from "components/home/category-grid";
import FeaturedProducts from "components/home/featured-products";
import ProductCarousel from "components/home/product-carousel";
import Link from "next/link";
import Image from "next/image";
import {
  getRootCategories,
  getFeaturedProducts,
  getPromoProducts,
  getNewProducts,
  getHomepageCategories,
  getProducts,
  getTestimonialsFromDB,
  getActiveHomepageSections,
  type DbTestimonial,
  type HomepageSection,
} from "lib/supabase/index";

export const metadata = {
  title: "PRODES – Équipements pour collectivités",
  description:
    "Spécialiste des équipements pour mairies, écoles et collectivités. 7 000+ références. Devis gratuit sous 24h. Livraison incluse.",
  openGraph: {
    type: "website",
  },
};

const FALLBACK_TESTIMONIALS = [
  {
    id: "fallback-1",
    author: "Marie-Claire B.",
    role: "Directrice des services techniques — Mairie de Montpellier",
    content:
      "Excellent service, livraison rapide et produits conformes à nos attentes. Le devis a été traité en quelques heures. Je recommande PRODES pour tout achat de mobilier urbain.",
    rating: 5,
  },
  {
    id: "fallback-2",
    author: "Jean-Pierre L.",
    role: "Responsable achats — Communauté de communes du Pays de Sommières",
    content:
      "Nous utilisons PRODES depuis 3 ans pour nos équipements d'espaces verts. Qualité constante, prix compétitifs avec les tarifs dégressifs et un interlocuteur dédié réactif.",
    rating: 5,
  },
  {
    id: "fallback-3",
    author: "Sophie M.",
    role: "Gestionnaire de patrimoine — Conseil Régional Occitanie",
    content:
      "Le mandat administratif simplifie nos procédures d'achat. Produits robustes, compatibles Chorus Pro. Un partenaire fiable pour nos collectivités.",
    rating: 5,
  },
] satisfies DbTestimonial[];

export default async function HomePage() {
  let categories: Awaited<ReturnType<typeof getRootCategories>> = [];
  let featuredProducts: Awaited<ReturnType<typeof getFeaturedProducts>> = [];
  let promoProducts: Awaited<ReturnType<typeof getPromoProducts>> = [];
  let newProducts: Awaited<ReturnType<typeof getNewProducts>> = [];
  let homepageCategories: Awaited<ReturnType<typeof getHomepageCategories>> = [];
  let proIntensProducts: Awaited<ReturnType<typeof getProducts>> = [];
  let dbTestimonials: DbTestimonial[] = [];
  let dynamicSections: HomepageSection[] = [];

  try {
    [categories, featuredProducts, promoProducts, newProducts, homepageCategories, proIntensProducts, dbTestimonials, dynamicSections] =
      await Promise.all([
        getRootCategories(),
        getFeaturedProducts(12),
        getPromoProducts(12),
        getNewProducts(12),
        getHomepageCategories(),
        getProducts({ query: "pro-intens", limit: 8 }),
        getTestimonialsFromDB(6),
        getActiveHomepageSections(),
      ]);
    // Fallback PRO-INTENS avec espace
    if (proIntensProducts.length === 0) {
      proIntensProducts = await getProducts({ query: "pro intens", limit: 8 });
    }
  } catch (e) {
    console.error("Homepage data fetch error:", e);
  }

  const testimonials = dbTestimonials.length > 0 ? dbTestimonials : FALLBACK_TESTIMONIALS;

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

        {/* Section 6 — Carousel PRO-INTENS */}
        {proIntensProducts.length > 0 && (
          <section className="mx-auto max-w-screen-2xl px-4 pb-12 lg:px-6">
            <div className="rounded-xl overflow-hidden bg-gradient-to-r from-[#1f2937] to-[#374151]">
              <div className="flex flex-col gap-1 px-6 pt-6 pb-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="mb-1 inline-flex items-center gap-1.5 rounded-full bg-amber-500 px-3 py-0.5 text-xs font-bold text-white">
                    ★ Gamme exclusive
                  </div>
                  <h2 className="text-xl font-bold text-white">PRO-INTENS</h2>
                  <p className="text-sm text-gray-300 mt-0.5">
                    Mobilier haute résistance pour collectivités — Garantie 10 ans
                  </p>
                </div>
                <Link
                  href="/gamme-pro-intens"
                  className="self-start rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 transition-colors whitespace-nowrap mt-2 md:mt-0"
                >
                  Voir la gamme →
                </Link>
              </div>
              <div className="px-4 pb-4">
                <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2 scrollbar-hide">
                  {proIntensProducts.map((product) => (
                    <Link
                      key={product.handle}
                      href={`/product/${product.handle}`}
                      className="group flex-none w-48 snap-start rounded-lg bg-white/10 hover:bg-white/20 p-3 transition-colors"
                    >
                      <div className="relative mb-2 aspect-square overflow-hidden rounded bg-white/5">
                        {product.featuredImage?.url ? (
                          <Image
                            src={product.featuredImage.url}
                            alt={product.title}
                            fill
                            sizes="192px"
                            className="object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-amber-400 opacity-40 text-3xl">
                            ★
                          </div>
                        )}
                        <div className="absolute left-1.5 top-1.5 rounded bg-amber-500 px-1 py-0.5 text-[10px] font-bold text-white">
                          PRO-INTENS
                        </div>
                      </div>
                      <p className="line-clamp-2 text-xs font-medium text-white leading-tight">
                        {product.title}
                      </p>
                      {(product.priceMin ?? 0) > 0 && (
                        <p className="mt-1 text-xs font-bold text-amber-400">
                          {new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2 }).format(product.priceMin!)} € HT
                        </p>
                      )}
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Section 6b — Sections dynamiques admin */}
        {dynamicSections.map((section) =>
          section.products.length > 0 ? (
            <section key={section.id} className="mx-auto max-w-screen-2xl px-4 pb-12 lg:px-6">
              <ProductCarousel
                title={section.title}
                subtitle={section.intro ?? ""}
                products={section.products}
                viewAllHref="/search"
              />
            </section>
          ) : null,
        )}

        {/* Section 7 — Bandeau CTA devis express */}
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

        {/* Section 8 — Trouver le bon produit — IA CTA 3 étapes */}
        <section className="mx-auto max-w-screen-2xl px-4 pb-12 lg:px-6">
          <div className="rounded-xl border border-gray-200 bg-white px-6 py-8 md:px-10">
            <div className="mb-6 text-center">
              <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-blue-50 px-4 py-1.5 text-sm font-semibold text-blue-700">
                🤖 Assistance intelligente
              </div>
              <h2 className="text-xl font-bold text-gray-900">
                Trouvez le produit idéal en 3 étapes
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                Décrivez votre besoin, nous suggérons les produits adaptés à votre collectivité
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {[
                {
                  step: "1",
                  icon: "🏛️",
                  title: "Identifiez votre contexte",
                  desc: "Mairie, école, parc, espace sportif… Précisez votre type de collectivité et le lieu d'installation.",
                  color: "bg-blue-50 border-blue-200",
                  badge: "bg-blue-600",
                },
                {
                  step: "2",
                  icon: "🔍",
                  title: "Décrivez votre besoin",
                  desc: "Usage prévu, quantité, contraintes (résistance, accessibilité PMR, entretien)… Le détail permet une suggestion précise.",
                  color: "bg-amber-50 border-amber-200",
                  badge: "bg-amber-500",
                },
                {
                  step: "3",
                  icon: "📋",
                  title: "Recevez votre devis",
                  desc: "Sélection personnalisée de références, tarifs dégressifs, livraison incluse. Réponse sous 24h.",
                  color: "bg-green-50 border-green-200",
                  badge: "bg-green-600",
                },
              ].map((item) => (
                <div key={item.step} className={`rounded-xl border p-5 ${item.color}`}>
                  <div className="mb-3 flex items-center gap-3">
                    <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white ${item.badge}`}>
                      {item.step}
                    </div>
                    <span className="text-xl">{item.icon}</span>
                  </div>
                  <h3 className="mb-1 text-sm font-semibold text-gray-900">{item.title}</h3>
                  <p className="text-xs text-gray-600 leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
            <div className="mt-6 text-center">
              <Link
                href="/devis-express"
                className="inline-flex items-center gap-2 rounded-lg bg-[#cc1818] px-8 py-3 text-sm font-semibold text-white hover:bg-[#aa1414] transition-colors"
              >
                Commencer ma demande →
              </Link>
            </div>
          </div>
        </section>

        {/* Section 9 — Témoignages clients (DB-driven, fallback hardcodé) */}
        <section className="mx-auto max-w-screen-2xl px-4 pb-12 lg:px-6">
          <h2 className="mb-6 text-xl font-bold text-gray-900 text-center">Ils nous font confiance</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {testimonials.slice(0, 3).map((t) => (
              <div key={t.id} className="rounded-xl border border-gray-200 bg-white p-5">
                <div className="mb-3 flex gap-0.5">
                  {Array.from({ length: t.rating }).map((_, i) => (
                    <span key={i} className="text-amber-400 text-sm">★</span>
                  ))}
                </div>
                <p className="text-sm text-gray-700 leading-relaxed italic mb-4">
                  &ldquo;{t.content}&rdquo;
                </p>
                <div>
                  <p className="text-sm font-semibold text-gray-900">{t.author}</p>
                  {t.role && <p className="text-xs text-gray-500">{t.role}</p>}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Section 10 — Carousel nouveautés */}
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
