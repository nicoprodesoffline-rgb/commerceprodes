"use client";

import { PriceGrid } from "components/product/price-grid";
import { DevisModal } from "components/product/devis-modal";
import { MandatModal } from "components/product/mandat-modal";
import { StripeButton } from "components/checkout/stripe-button";
import { VariantSelector } from "./variant-selector";
import Prose from "components/prose";
import { Product } from "lib/supabase/types";
import { useSearchParams } from "next/navigation";
import { useState, useMemo } from "react";

function formatPriceFR(price: number): string {
  return (
    new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2 }).format(price) + " € HT"
  );
}

export function ProductDescription({ product }: { product: Product }) {
  const searchParams = useSearchParams();
  const [devisOpen, setDevisOpen] = useState(false);
  const [mandatOpen, setMandatOpen] = useState(false);
  const [quantity, setQuantity] = useState(product.pbqMinQuantity ?? 1);

  // Find selected variant from URL params
  const selectedVariant = useMemo(() => {
    if (!product.variants || product.variants.length === 0) return null;
    if (product.variants.length === 1) return product.variants[0]!;

    // Match all options present in URL
    return (
      product.variants.find((variant) =>
        variant.selectedOptions.every(
          (opt) => searchParams.get(opt.name.toLowerCase()) === opt.value,
        ),
      ) ?? product.variants[0]!
    );
  }, [product.variants, searchParams]);

  // Displayed price: selected variant price, or product min price
  const displayPrice = useMemo(() => {
    if (selectedVariant) {
      return parseFloat(selectedVariant.price.amount);
    }
    return product.priceMin ?? parseFloat(product.priceRange.minVariantPrice.amount);
  }, [selectedVariant, product]);

  const basePrice = displayPrice;

  // Tabs: Description + Caractéristiques
  const [activeTab, setActiveTab] = useState<"description" | "specs">("description");

  const hasSpecs =
    product.weightKg != null ||
    product.lengthCm != null ||
    product.widthCm != null ||
    product.heightCm != null;

  return (
    <>
      {/* Title + SKU */}
      <div className="mb-4 border-b pb-4 dark:border-neutral-700">
        <h1 className="mb-1 text-2xl font-semibold leading-tight text-neutral-900 dark:text-white">
          {product.title}
        </h1>
        {product.sku && (
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Réf : <span className="font-mono">{product.sku}</span>
          </p>
        )}
      </div>

      {/* Price */}
      <div className="mb-4">
        {product.variants.length > 1 && !searchParams.has(
          product.options[0]?.name.toLowerCase() ?? "",
        ) ? (
          <p className="text-xl font-semibold text-neutral-900 dark:text-white">
            {product.priceMin != null && product.priceMax != null &&
            product.priceMin !== product.priceMax ? (
              <>
                {formatPriceFR(product.priceMin)}
                <span className="mx-2 text-neutral-400">–</span>
                {formatPriceFR(product.priceMax)}
              </>
            ) : (
              formatPriceFR(displayPrice)
            )}
          </p>
        ) : (
          <p className="text-xl font-semibold text-neutral-900 dark:text-white">
            {formatPriceFR(displayPrice)}
          </p>
        )}

        {/* Eco-participation */}
        {product.ecoContribution != null && product.ecoContribution > 0 && (
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            Dont éco-participation :{" "}
            <span className="font-medium">
              {formatPriceFR(product.ecoContribution)}
            </span>
          </p>
        )}
      </div>

      {/* Short description */}
      {product.shortDescription && (
        <p className="mb-4 text-sm text-neutral-600 dark:text-neutral-400">
          {product.shortDescription}
        </p>
      )}

      {/* Variant selector */}
      <VariantSelector options={product.options} variants={product.variants} />

      {/* Quantity */}
      <div className="mb-6">
        <label
          htmlFor="qty"
          className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300"
        >
          Quantité
        </label>
        <input
          id="qty"
          type="number"
          min={product.pbqMinQuantity ?? 1}
          value={quantity}
          onChange={(e) => setQuantity(Math.max(product.pbqMinQuantity ?? 1, parseInt(e.target.value) || 1))}
          className="w-24 rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-800 dark:text-white"
        />
        {(product.pbqMinQuantity ?? 0) > 1 && (
          <p className="mt-1 text-xs text-neutral-500">
            Quantité minimale : {product.pbqMinQuantity}
          </p>
        )}
      </div>

      {/* PBQ Price grid */}
      {product.pbqEnabled && product.priceTiers && product.priceTiers.length > 0 && (
        <PriceGrid
          tiers={product.priceTiers}
          pricingType={product.pbqPricingType ?? null}
          basePrice={basePrice}
        />
      )}

      {/* 3 B2B action buttons */}
      <div className="mt-6 space-y-3">
        <button
          onClick={() => setDevisOpen(true)}
          className="w-full rounded-md bg-blue-600 py-3 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
        >
          Demander un devis
        </button>
        <button
          onClick={() => setMandatOpen(true)}
          className="w-full rounded-md border border-neutral-800 py-3 text-sm font-semibold text-neutral-800 hover:bg-neutral-50 transition-colors dark:border-neutral-300 dark:text-neutral-200 dark:hover:bg-neutral-800"
        >
          Mandat administratif
        </button>
        <div className="flex justify-center pt-1">
          <StripeButton
            productTitle={product.title}
            productSku={product.sku}
            variantId={selectedVariant?.id}
            quantity={quantity}
            unitPrice={displayPrice}
          />
        </div>
      </div>

      {/* Tabs: Description / Caractéristiques */}
      <div className="mt-8">
        <div className="flex border-b dark:border-neutral-700">
          <button
            onClick={() => setActiveTab("description")}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === "description"
                ? "border-b-2 border-blue-600 text-blue-600"
                : "text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
            }`}
          >
            Description
          </button>
          {hasSpecs && (
            <button
              onClick={() => setActiveTab("specs")}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === "specs"
                  ? "border-b-2 border-blue-600 text-blue-600"
                  : "text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
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
                  className="text-sm leading-relaxed text-neutral-700 dark:text-neutral-300"
                  html={product.descriptionHtml}
                />
              ) : (
                <p className="text-sm text-neutral-500">Aucune description disponible.</p>
              )}
            </>
          )}
          {activeTab === "specs" && hasSpecs && (
            <table className="w-full text-sm">
              <tbody>
                {product.weightKg != null && (
                  <tr className="border-b dark:border-neutral-700">
                    <td className="py-2 pr-4 font-medium text-neutral-600 dark:text-neutral-400">
                      Poids
                    </td>
                    <td className="py-2 text-neutral-800 dark:text-neutral-200">
                      {product.weightKg} kg
                    </td>
                  </tr>
                )}
                {product.lengthCm != null && (
                  <tr className="border-b dark:border-neutral-700">
                    <td className="py-2 pr-4 font-medium text-neutral-600 dark:text-neutral-400">
                      Longueur
                    </td>
                    <td className="py-2 text-neutral-800 dark:text-neutral-200">
                      {product.lengthCm} cm
                    </td>
                  </tr>
                )}
                {product.widthCm != null && (
                  <tr className="border-b dark:border-neutral-700">
                    <td className="py-2 pr-4 font-medium text-neutral-600 dark:text-neutral-400">
                      Largeur
                    </td>
                    <td className="py-2 text-neutral-800 dark:text-neutral-200">
                      {product.widthCm} cm
                    </td>
                  </tr>
                )}
                {product.heightCm != null && (
                  <tr className="border-b dark:border-neutral-700">
                    <td className="py-2 pr-4 font-medium text-neutral-600 dark:text-neutral-400">
                      Hauteur
                    </td>
                    <td className="py-2 text-neutral-800 dark:text-neutral-200">
                      {product.heightCm} cm
                    </td>
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
        productSku={product.sku}
        defaultQuantity={quantity}
      />
      <MandatModal
        open={mandatOpen}
        onClose={() => setMandatOpen(false)}
        productTitle={product.title}
        productSku={product.sku}
      />
    </>
  );
}
