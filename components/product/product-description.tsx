"use client";

import { PriceGrid } from "components/product/price-grid";
import { DevisModal } from "components/product/devis-modal";
import { MandatModal } from "components/product/mandat-modal";
import { VariantSelector } from "./variant-selector";
import Prose from "components/prose";
import { Product, ProductVariant } from "lib/supabase/types";
import { useState, useCallback, useTransition } from "react";
import { useCart } from "components/cart/cart-context";
import { getEcoDisplay } from "lib/utils/eco";

function formatPriceFR(price: number): string {
  return (
    new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2 }).format(price) + " € HT"
  );
}

// Mini toast affiché après ajout au panier
function AddedToast({ title, show }: { title: string; show: boolean }) {
  if (!show) return null;
  return (
    <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-2 rounded-lg bg-green-600 px-4 py-3 text-sm font-medium text-white shadow-lg">
      ✓ {title} ajouté au panier
    </div>
  );
}

export function ProductDescription({ product }: { product: Product }) {
  const { addCartItem } = useCart();
  const [devisOpen, setDevisOpen] = useState(false);
  const [mandatOpen, setMandatOpen] = useState(false);
  const [quantity, setQuantity] = useState(product.pbqMinQuantity ?? 1);
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleVariantChange = useCallback((variant: ProductVariant | null) => {
    setSelectedVariant(variant);
  }, []);

  // Displayed SKU: variant SKU → product SKU
  const displaySku = selectedVariant?.sku ?? product.sku;

  if (process.env.NODE_ENV === 'development') {
    // eslint-disable-next-line no-console
    console.log('[VariantSelector] selectedVariant:', selectedVariant?.sku, 'displaySku:', displaySku);
  }

  // Displayed price
  const displayPrice = (() => {
    if (selectedVariant) {
      const p = parseFloat(selectedVariant.price.amount);
      if (p > 0) return p;
    }
    // Fallback: priceMin > 0, else regularPrice, else 0
    return product.priceMin && product.priceMin > 0
      ? product.priceMin
      : (product.regularPrice ?? parseFloat(product.priceRange.minVariantPrice.amount));
  })();

  const basePrice = displayPrice;

  // Tabs
  const [activeTab, setActiveTab] = useState<"description" | "specs">("description");

  const hasSpecs =
    product.weightKg != null ||
    product.lengthCm != null ||
    product.widthCm != null ||
    product.heightCm != null;

  // Eco-participation display logic
  const hasLotsVariant = product.variants.some((v) =>
    v.selectedOptions.some((o) => o.name === 'pa_les-lots'),
  );
  const ecoDisplay = getEcoDisplay(product.ecoContribution, hasLotsVariant);
  const hasPriceTiers = product.pbqEnabled && product.priceTiers && product.priceTiers.length > 0;

  // Variant label for modals
  const variantLabel = selectedVariant
    ? selectedVariant.selectedOptions.map((o) => o.value).join(" — ")
    : undefined;
  const modalSku = variantLabel
    ? `${product.sku ?? ""} (${variantLabel})`.trim()
    : product.sku;

  // Add to cart handler — uses localStorage CartContext
  const handleAddToCart = () => {
    const variant = selectedVariant ?? product.variants[0];
    if (!variant) return;
    startTransition(() => {
      addCartItem(variant, product, quantity);
      setToastVisible(true);
      setTimeout(() => setToastVisible(false), 3000);
    });
  };

  return (
    <>
      {/* Title + SKU */}
      <div className="mb-4 border-b border-gray-200 pb-4">
        {displaySku && (
          <p className="mb-1 text-xs text-gray-400 font-mono">Réf : {displaySku}</p>
        )}
        <h1 className="text-2xl font-semibold leading-tight text-gray-900">
          {product.title}
        </h1>
      </div>

      {/* Price */}
      <div className="mb-4">
        {product.variants.length > 1 && !selectedVariant ? (
          <p className="text-2xl font-bold text-gray-900">
            {product.priceMin != null && product.priceMax != null &&
            product.priceMin > 0 && product.priceMin !== product.priceMax ? (
              <>
                {formatPriceFR(product.priceMin)}
                <span className="mx-2 text-gray-400 font-normal">–</span>
                {formatPriceFR(product.priceMax)}
              </>
            ) : (
              formatPriceFR(displayPrice)
            )}
          </p>
        ) : (
          <p className="text-2xl font-bold text-gray-900">
            {formatPriceFR(displayPrice)}
          </p>
        )}

        {/* Eco-participation */}
        {ecoDisplay.show && ecoDisplay.type === 'included' && (
          <p className="mt-1 text-xs text-gray-500">
            Éco-participation :{" "}
            <span className="font-medium">{formatPriceFR(ecoDisplay.amount)}</span> incluse
          </p>
        )}
        {ecoDisplay.show && ecoDisplay.type === 'per-unit' && (
          <p className="mt-1 text-xs text-gray-500">
            +{" "}
            <span className="font-medium">{formatPriceFR(ecoDisplay.amount)}</span>{" "}
            éco-participation / unité
          </p>
        )}
      </div>

      {/* Short description — HTML rendu */}
      {product.shortDescription && (
        <div
          className="product-prose mb-5 text-sm text-gray-600 leading-relaxed"
          dangerouslySetInnerHTML={{
            __html: product.shortDescription
              .replace(/&nbsp;/g, " ")
              .replace(/\s{2,}/g, " "),
          }}
        />
      )}

      {/* Variant selector — swatches + pills */}
      {product.options.length > 0 && (
        <VariantSelector
          options={product.options}
          variants={product.variants}
          onVariantChange={handleVariantChange}
        />
      )}

      {/* Quantity */}
      <div className="mb-5">
        <label
          htmlFor="qty"
          className="mb-1 block text-sm font-medium text-gray-700"
        >
          Quantité
        </label>
        <input
          id="qty"
          type="number"
          min={product.pbqMinQuantity ?? 1}
          value={quantity}
          onChange={(e) => setQuantity(Math.max(product.pbqMinQuantity ?? 1, parseInt(e.target.value) || 1))}
          className="w-24 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[#cc1818] focus:outline-none focus:ring-1 focus:ring-[#cc1818]"
        />
        {(product.pbqMinQuantity ?? 0) > 1 && (
          <p className="mt-1 text-xs text-gray-500">
            Quantité minimale : {product.pbqMinQuantity}
          </p>
        )}
      </div>

      {/* Bloc récapitulatif dynamique (sans lots, avec éco-participation) */}
      {!hasPriceTiers && ecoDisplay.show && ecoDisplay.type === 'per-unit' && quantity > 0 && (
        <div className="mb-5 rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm">
          <div className="mb-2 font-medium text-gray-900">
            Pour {quantity} unité{quantity > 1 ? 's' : ''} :
          </div>
          <div className="space-y-1 text-gray-600">
            <div className="flex justify-between">
              <span>Sous-total HT</span>
              <span>
                {formatPriceFR(basePrice)} × {quantity} ={' '}
                <strong>{formatPriceFR(basePrice * quantity)}</strong>
              </span>
            </div>
            <div className="flex justify-between">
              <span>Éco-participation</span>
              <span>
                {formatPriceFR(ecoDisplay.amount)} × {quantity} ={' '}
                <strong>{formatPriceFR(ecoDisplay.amount * quantity)}</strong>
              </span>
            </div>
            <div className="mt-2 flex justify-between border-t border-gray-300 pt-2 font-medium text-gray-900">
              <span>Total avant TVA</span>
              <span>{formatPriceFR((basePrice + ecoDisplay.amount) * quantity)} HT</span>
            </div>
          </div>
        </div>
      )}

      {/* PBQ Price grid */}
      {product.pbqEnabled && product.priceTiers && product.priceTiers.length > 0 && (
        <PriceGrid
          tiers={product.priceTiers}
          pricingType={product.pbqPricingType ?? null}
          basePrice={basePrice}
        />
      )}

      {/* Livraison */}
      <div className="mb-4">
        {product.isFreeshipping ? (
          <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm font-medium text-green-700">
            <span>🚚</span>
            <span>Livraison offerte sur ce produit</span>
          </div>
        ) : (
          <p className="text-xs text-gray-500">🚚 Livraison incluse</p>
        )}
      </div>

      {/* Ajouter au panier */}
      <div className="mt-6 space-y-3">
        <button
          type="button"
          onClick={handleAddToCart}
          disabled={isPending}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-green-600 py-3 text-sm font-semibold text-white hover:bg-green-700 transition-colors disabled:opacity-60"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4m0 0L7 13m0 0l-2.5 6.5M7 13l2.5 6.5m0 0h8m-8 0a1 1 0 100 2 1 1 0 000-2zm8 0a1 1 0 100 2 1 1 0 000-2z" />
          </svg>
          Ajouter au panier
        </button>

        <div className="flex items-center gap-3">
          <div className="flex-1 border-t border-gray-200" />
          <span className="text-xs text-gray-400">ou</span>
          <div className="flex-1 border-t border-gray-200" />
        </div>

        {/* B2B buttons */}
        <div>
          <button
            onClick={() => setDevisOpen(true)}
            className="w-full rounded-md bg-[#cc1818] py-3 text-sm font-semibold text-white hover:bg-[#aa1414] transition-colors"
          >
            Demander un devis
          </button>
          <p className="mt-0.5 text-center text-xs text-gray-400">Réponse sous 24h</p>
        </div>
        <div>
          <button
            onClick={() => setMandatOpen(true)}
            className="w-full rounded-md border border-[#cc1818] py-3 text-sm font-semibold text-[#cc1818] hover:bg-red-50 transition-colors"
          >
            Mandat administratif
          </button>
          <p className="mt-0.5 text-center text-xs text-gray-400">Pour les collectivités</p>
        </div>
        <div>
          <button
            disabled
            className="w-full rounded-md border border-gray-300 py-3 text-sm font-medium text-gray-400 cursor-not-allowed"
          >
            Payer en ligne par carte
          </button>
          <p className="mt-0.5 text-center text-xs text-gray-400">Disponible prochainement</p>
        </div>
      </div>

      {/* Tabs: Description / Caractéristiques */}
      <div className="mt-8">
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setActiveTab("description")}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === "description"
                ? "border-b-2 border-[#cc1818] text-[#cc1818]"
                : "text-gray-500 hover:text-gray-800"
            }`}
          >
            Description
          </button>
          {hasSpecs && (
            <button
              onClick={() => setActiveTab("specs")}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === "specs"
                  ? "border-b-2 border-[#cc1818] text-[#cc1818]"
                  : "text-gray-500 hover:text-gray-800"
              }`}
            >
              Caractéristiques
            </button>
          )}
        </div>

        <div className="pt-4">
          {activeTab === "description" && (
            <>
              {product.descriptionHtml ? (
                <Prose
                  className="text-sm leading-relaxed text-gray-700"
                  html={product.descriptionHtml}
                />
              ) : (
                <p className="text-sm text-gray-500">Aucune description disponible.</p>
              )}
            </>
          )}
          {activeTab === "specs" && hasSpecs && (
            <table className="w-full text-sm">
              <tbody>
                {product.weightKg != null && (
                  <tr className="border-b border-gray-100">
                    <td className="py-2 pr-4 font-medium text-gray-600">Poids</td>
                    <td className="py-2 text-gray-800">{product.weightKg} kg</td>
                  </tr>
                )}
                {product.lengthCm != null && (
                  <tr className="border-b border-gray-100">
                    <td className="py-2 pr-4 font-medium text-gray-600">Longueur</td>
                    <td className="py-2 text-gray-800">{product.lengthCm} cm</td>
                  </tr>
                )}
                {product.widthCm != null && (
                  <tr className="border-b border-gray-100">
                    <td className="py-2 pr-4 font-medium text-gray-600">Largeur</td>
                    <td className="py-2 text-gray-800">{product.widthCm} cm</td>
                  </tr>
                )}
                {product.heightCm != null && (
                  <tr className="border-b border-gray-100">
                    <td className="py-2 pr-4 font-medium text-gray-600">Hauteur</td>
                    <td className="py-2 text-gray-800">{product.heightCm} cm</td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Modals */}
      <DevisModal
        open={devisOpen}
        onClose={() => setDevisOpen(false)}
        productTitle={product.title}
        productSku={modalSku}
        defaultQuantity={quantity}
      />
      <MandatModal
        open={mandatOpen}
        onClose={() => setMandatOpen(false)}
        productTitle={product.title}
        productSku={modalSku}
      />

      {/* Toast */}
      <AddedToast title={product.title} show={toastVisible} />
    </>
  );
}
