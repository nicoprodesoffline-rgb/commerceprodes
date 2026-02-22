import { getCart } from "lib/supabase";
import Image from "next/image";
import Link from "next/link";
import Footer from "components/layout/footer";
import { CartActions } from "./cart-actions";

function formatHT(amount: string | number): string {
  return new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2 }).format(Number(amount)) + " € HT";
}

function formatTTC(amount: string | number): string {
  return new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2 }).format(Number(amount) * 1.2) + " € TTC";
}

export default async function CartPage() {
  const cart = await getCart();

  if (!cart || cart.lines.length === 0) {
    return (
      <>
        <div className="mx-auto max-w-screen-2xl px-4 py-24 text-center lg:px-6">
          <div className="mx-auto max-w-sm">
            <svg className="mx-auto h-20 w-20 text-gray-200" fill="none" stroke="currentColor" strokeWidth={1} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13l-2 8m2-8h10m0 0l2 8M9 21a1 1 0 100 2 1 1 0 000-2zm10 0a1 1 0 100 2 1 1 0 000-2z" />
            </svg>
            <h1 className="mt-6 text-2xl font-bold text-gray-900">Votre panier est vide</h1>
            <p className="mt-2 text-gray-500">Parcourez notre catalogue pour trouver vos produits.</p>
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

  const subtotalHT = Number(cart.cost.subtotalAmount.amount);
  const tvaAmount = subtotalHT * 0.2;
  const totalTTC = subtotalHT + tvaAmount;

  return (
    <>
      <div className="mx-auto max-w-screen-2xl px-4 py-8 lg:px-6">
        <h1 className="mb-8 text-2xl font-bold text-gray-900">Mon panier</h1>

        <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
          {/* Colonne gauche — Articles */}
          <div className="flex-1">
            <div className="rounded-lg border border-gray-200 bg-white divide-y divide-gray-100">
              {cart.lines.map((item) => {
                const unitPrice = Number(item.cost.totalAmount.amount) / item.quantity;
                const lineTotal = Number(item.cost.totalAmount.amount);
                const hasImage = !!item.merchandise.product.featuredImage?.url;
                const variantOptions = item.merchandise.selectedOptions
                  .filter((o) => o.value && o.value !== "Default Title")
                  .map((o) => o.value)
                  .join(" — ");

                return (
                  <div key={item.id} className="flex gap-4 p-4">
                    {/* Image */}
                    <div className="h-20 w-20 flex-none overflow-hidden rounded-md border border-gray-200 bg-gray-50">
                      {hasImage ? (
                        <Image
                          src={item.merchandise.product.featuredImage.url}
                          alt={item.merchandise.product.title}
                          width={80}
                          height={80}
                          className="h-full w-full object-contain"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-gray-300">
                          <svg className="h-8 w-8" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M4 5h16v14H4V5zm2 2v10h12V7H6z"/>
                          </svg>
                        </div>
                      )}
                    </div>

                    {/* Info produit */}
                    <div className="flex flex-1 flex-col justify-between">
                      <div>
                        <Link
                          href={`/product/${item.merchandise.product.handle}`}
                          className="text-sm font-medium text-gray-900 hover:text-[#cc1818] line-clamp-2"
                        >
                          {item.merchandise.product.title}
                        </Link>
                        {variantOptions && (
                          <p className="mt-0.5 text-xs text-gray-500">{variantOptions}</p>
                        )}
                        <p className="mt-0.5 text-xs text-gray-400">
                          {formatHT(unitPrice)} / unité
                        </p>
                      </div>

                      {/* Contrôles quantité + sous-total */}
                      <div className="mt-2 flex items-center justify-between">
                        <CartActions
                          merchandiseId={item.merchandise.id}
                          quantity={item.quantity}
                          itemId={item.id}
                        />
                        <p className="text-sm font-bold text-gray-900">
                          {formatHT(lineTotal)}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Colonne droite — Récapitulatif */}
          <div className="w-full lg:w-80 lg:flex-none">
            <div className="sticky top-28 rounded-lg border border-gray-200 bg-white">
              <div className="border-b border-gray-100 px-5 py-4">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-700">
                  Récapitulatif
                </h2>
              </div>
              <div className="space-y-3 px-5 py-4 text-sm">
                <div className="flex items-center justify-between text-gray-600">
                  <span>Sous-total HT</span>
                  <span className="font-medium text-gray-900">{formatHT(subtotalHT)}</span>
                </div>
                <div className="flex items-center justify-between text-gray-600">
                  <span>Frais de livraison</span>
                  <span className="text-gray-500">À calculer</span>
                </div>
                <div className="flex items-center justify-between text-gray-600">
                  <span>TVA 20%</span>
                  <span className="font-medium text-gray-900">{formatHT(tvaAmount)}</span>
                </div>
                <div className="border-t border-gray-200 pt-3">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-gray-900">Total TTC</span>
                    <span className="text-lg font-bold text-gray-900">{formatTTC(subtotalHT)}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-2 border-t border-gray-100 px-5 py-4">
                <Link
                  href="/checkout"
                  className="flex w-full items-center justify-center rounded-md bg-[#cc1818] py-3 text-sm font-semibold text-white hover:bg-[#aa1414] transition-colors"
                >
                  Finaliser la commande →
                </Link>
                <Link
                  href="/search"
                  className="flex w-full items-center justify-center rounded-md border border-gray-300 py-2.5 text-sm text-gray-600 hover:border-gray-400 transition-colors"
                >
                  Continuer mes achats
                </Link>
              </div>

              <p className="px-5 pb-4 text-xs text-gray-400">
                Prix HT — TVA 20% applicable · Livraison calculée à la commande
              </p>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </>
  );
}
