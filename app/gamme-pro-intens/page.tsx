import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import Footer from "components/layout/footer";
import { getProducts } from "lib/supabase";

export const metadata: Metadata = {
  title: "Gamme PRO-INTENS — PRODES",
  description:
    "Découvrez la gamme exclusive PRO-INTENS de PRODES : mobilier haute résistance conçu pour un usage intensif en collectivités.",
};

export default async function GammeProIntensPage() {
  let products = await getProducts({ query: "pro-intens", limit: 48 });

  // Fallback: search "pro intens" with space
  if (products.length === 0) {
    products = await getProducts({ query: "pro intens", limit: 48 });
  }

  return (
    <>
      {/* Hero premium */}
      <div className="bg-gradient-to-r from-[#1f2937] to-[#374151] px-4 py-16 text-center">
        <div className="mx-auto max-w-3xl">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-amber-500 px-4 py-1.5 text-sm font-bold text-white">
            ★ Gamme exclusive PRODES
          </div>
          <h1 className="text-4xl font-black text-white md:text-5xl">
            PRO-INTENS
          </h1>
          <p className="mt-4 text-lg text-gray-300">
            Mobilier haute résistance conçu pour un usage intensif en
            collectivités. Garantie renforcée, entretien simplifié.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <div className="rounded-lg bg-white/10 px-5 py-3 text-sm text-white">
              <span className="block text-2xl font-bold text-amber-400">10 ans</span>
              Garantie structure
            </div>
            <div className="rounded-lg bg-white/10 px-5 py-3 text-sm text-white">
              <span className="block text-2xl font-bold text-amber-400">NF</span>
              Certifié collectivités
            </div>
            <div className="rounded-lg bg-white/10 px-5 py-3 text-sm text-white">
              <span className="block text-2xl font-bold text-amber-400">Chorus</span>
              Compatible Pro
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-screen-xl px-4 py-10">
        {products.length === 0 ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 py-20 text-center">
            <div className="mb-3 text-5xl">🏗️</div>
            <h2 className="text-xl font-bold text-gray-900">
              Gamme en cours de référencement
            </h2>
            <p className="mt-2 text-gray-600">
              Les produits PRO-INTENS seront disponibles très prochainement.
            </p>
            <Link
              href="/devis-express?ref=PRO-INTENS"
              className="mt-6 inline-flex items-center rounded-lg bg-[#cc1818] px-6 py-3 text-sm font-semibold text-white hover:bg-[#aa1414] transition-colors"
            >
              Demander un devis sur mesure
            </Link>
          </div>
        ) : (
          <>
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">
                {products.length} produit{products.length > 1 ? "s" : ""} PRO-INTENS
              </h2>
              <Link
                href="/devis-express?ref=PRO-INTENS"
                className="rounded-lg bg-[#cc1818] px-4 py-2 text-sm font-semibold text-white hover:bg-[#aa1414] transition-colors"
              >
                📋 Demander un devis groupé
              </Link>
            </div>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {products.map((product) => (
                <Link
                  key={product.handle}
                  href={`/product/${product.handle}`}
                  className="group rounded-xl border border-gray-200 bg-white p-3 hover:border-amber-400 hover:shadow-md transition-all"
                >
                  <div className="relative mb-3 aspect-square overflow-hidden rounded-lg bg-gray-100">
                    {product.featuredImage?.url ? (
                      <Image
                        src={product.featuredImage.url}
                        alt={product.title}
                        fill
                        sizes="(min-width:1024px) 25vw, (min-width:640px) 33vw, 50vw"
                        className="object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-4xl text-gray-300">
                        🏗️
                      </div>
                    )}
                    <div className="absolute left-2 top-2 rounded bg-amber-500 px-1.5 py-0.5 text-xs font-bold text-white">
                      PRO-INTENS
                    </div>
                  </div>
                  <p className="line-clamp-2 text-sm font-medium text-gray-800 group-hover:text-[#cc1818] transition-colors">
                    {product.title}
                  </p>
                  {product.priceRange?.minVariantPrice?.amount && (
                    <p className="mt-1 text-xs font-semibold text-[#cc1818]">
                      À partir de{" "}
                      {new Intl.NumberFormat("fr-FR", {
                        minimumFractionDigits: 2,
                      }).format(Number(product.priceRange.minVariantPrice.amount))}{" "}
                      € HT
                    </p>
                  )}
                </Link>
              ))}
            </div>

            {/* CTA bas */}
            <div className="mt-12 rounded-xl bg-gradient-to-r from-[#1f2937] to-[#374151] px-8 py-10 text-center">
              <h3 className="text-2xl font-bold text-white">
                Un projet d&apos;équipement PRO-INTENS ?
              </h3>
              <p className="mt-2 text-gray-300">
                Nos experts vous accompagnent de la sélection à la livraison.
                Devis gratuit sous 24h.
              </p>
              <Link
                href="/devis-express?ref=PRO-INTENS"
                className="mt-6 inline-flex items-center gap-2 rounded-lg bg-amber-500 px-8 py-3 text-base font-bold text-white hover:bg-amber-600 transition-colors"
              >
                📋 Demander un devis PRO-INTENS
              </Link>
            </div>
          </>
        )}
      </div>

      <Footer />
    </>
  );
}
