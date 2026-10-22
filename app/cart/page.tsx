"use client";

import Image from "next/image";
import Link from "next/link";
import Footer from "components/layout/footer";
import Price from "components/price";
import { CartActions } from "./cart-actions";
import { axesLabel, useCart } from "components/cart/cart-context";
import { SimulationForm } from "components/cart/simulation-form";

export default function CartPage() {
  const { displayed, displayedTotal, nowUtc } = useCart();

  if (displayed.length === 0) {
    return (
      <>
        <div className="mx-auto max-w-screen-2xl px-4 py-24 text-center lg:px-6">
          <div className="mx-auto max-w-sm">
            <svg
              className="mx-auto h-20 w-20 text-gray-200"
              fill="none"
              stroke="currentColor"
              strokeWidth={1}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13l-2 8m2-8h10m0 0l2 8M9 21a1 1 0 100 2 1 1 0 000-2zm10 0a1 1 0 100 2 1 1 0 000-2z"
              />
            </svg>
            <h1 className="mt-6 text-2xl font-bold text-gray-900">
              Votre panier est vide
            </h1>
            <p className="mt-2 text-gray-500">
              Parcourez notre catalogue pour trouver vos produits.
            </p>
            <Link
              href="/search"
              className="mt-8 inline-flex items-center rounded-lg bg-[#cc1818] px-6 py-3 text-sm font-semibold text-white hover:bg-[#aa1414] transition-colors"
            >
              Voir le catalogue
            </Link>
          </div>
        </div>
        <Footer />
      </>
    );
  }

  return (
    <>
      <div className="mx-auto max-w-screen-2xl px-4 py-8 lg:px-6">
        <h1 className="mb-8 text-2xl font-bold text-gray-900">Mon panier</h1>

        <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
          {/* Colonne gauche — Articles */}
          <div className="flex-1">
            <div className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
              {displayed.map((item) => (
                <div key={item.public_item_key} className="flex gap-4 p-4" data-item-key={item.public_item_key}>
                  {/* Image */}
                  <div className="h-20 w-20 flex-none overflow-hidden rounded-md border border-gray-200 bg-gray-50">
                    <Image
                      src={item.image_url}
                      alt={item.family_name}
                      width={80}
                      height={80}
                      className="h-full w-full object-contain"
                    />
                  </div>

                  {/* Info produit */}
                  <div className="flex flex-1 flex-col justify-between">
                    <div>
                      <Link
                        href={`/product/${item.family_slug}`}
                        className="line-clamp-2 text-sm font-medium text-gray-900 hover:text-[#cc1818]"
                      >
                        {item.family_name}
                      </Link>
                      <p className="mt-0.5 text-xs text-gray-500">
                        Article {item.public_item_key}
                        {Object.keys(item.variant_axes).length > 0
                          ? ` — ${axesLabel(item.variant_axes)}`
                          : ""}
                      </p>
                      {item.price.ok ? (
                        <p className="mt-0.5 text-xs text-gray-500">
                          <Price
                            className="inline font-medium text-gray-800"
                            amount={item.price.price.unit_amount}
                            currencyCode={item.price.price.currency}
                            taxBasis={item.price.price.tax_basis_or_status}
                          />{" "}
                          / unité · tarif <span className="font-mono">{item.price.price.rate_id}</span>{" "}
                          ({item.price.price.layer})
                        </p>
                      ) : (
                        <p className="mt-0.5 text-xs font-semibold text-amber-700">
                          Prix indisponible pour cette quantité ({item.price.code})
                        </p>
                      )}
                    </div>

                    {/* Contrôles quantité + sous-total */}
                    <div className="mt-2 flex items-center justify-between">
                      <CartActions itemKey={item.public_item_key} quantity={item.quantity} />
                      {item.line_amount !== null && item.price.ok ? (
                        <Price
                          className="text-sm font-bold text-gray-900"
                          amount={item.line_amount}
                          currencyCode={item.price.price.currency}
                          taxBasis={item.price.price.tax_basis_or_status}
                        />
                      ) : (
                        <p className="text-sm font-bold text-amber-700">—</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Colonne droite — Récapitulatif */}
          <div className="w-full space-y-4 lg:w-96 lg:flex-none">
            <div className="rounded-lg border border-gray-200 bg-white">
              <div className="border-b border-gray-100 px-5 py-4">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-700">
                  Récapitulatif
                </h2>
              </div>
              <div className="space-y-3 px-5 py-4 text-sm">
                <div className="flex items-center justify-between text-gray-600">
                  <span>Somme des lignes</span>
                  {displayedTotal !== null ? (
                    <Price className="font-semibold text-gray-900" amount={displayedTotal} currencyCode="EUR" />
                  ) : (
                    <span className="text-amber-700">Prix indisponible</span>
                  )}
                </div>
                <div className="flex items-center justify-between text-gray-600">
                  <span>TVA</span>
                  <span className="text-gray-500">Non qualifiée</span>
                </div>
                <div className="flex items-center justify-between text-gray-600">
                  <span>Frais de port</span>
                  <span className="text-gray-500">Non qualifiés</span>
                </div>
              </div>
              <p className="px-5 pb-4 text-xs text-gray-400">
                Prix lus dans le snapshot à l&apos;instant {nowUtc}. Montants indicatifs : le serveur
                revalide chaque ligne.
              </p>
            </div>
            <SimulationForm />
            <Link
              href="/search"
              className="flex w-full items-center justify-center rounded-md border border-gray-300 py-2.5 text-sm text-gray-600 hover:border-gray-400 transition-colors"
            >
              Continuer mes achats
            </Link>
          </div>
        </div>
      </div>
      <Footer />
    </>
  );
}
