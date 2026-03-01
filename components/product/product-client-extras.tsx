"use client";

import { useCart } from "components/cart/cart-context";
import { BundleWidget } from "./bundle-widget";
import { QuantitySimulator } from "./quantity-simulator";
import type { Product, ProductVariant } from "lib/supabase/types";

interface ProductClientExtrasProps {
  product: Product;
}

/**
 * Client-side extras for the product page:
 * - Bundle widget (packs recommandés)
 * - Quantity simulator
 * Both require useCart for add-to-cart integration.
 */
export function ProductClientExtras({ product }: ProductClientExtrasProps) {
  const { addCartItem, openCart } = useCart();

  function handleAddBundle(items: Array<{ handle: string; title: string; quantity: number }>) {
    for (const item of items) {
      // Minimal variant and product objects for the localStorage cart
      const variant: ProductVariant = {
        id: `bundle-${item.handle}`,
        title: item.title,
        availableForSale: true,
        selectedOptions: [],
        price: { amount: "0", currencyCode: "EUR" },
      };
      const cartProduct: Product = {
        id: `bundle-${item.handle}`,
        handle: item.handle,
        title: item.title,
        availableForSale: true,
        description: "",
        descriptionHtml: "",
        options: [],
        priceRange: {
          minVariantPrice: { amount: "0", currencyCode: "EUR" },
          maxVariantPrice: { amount: "0", currencyCode: "EUR" },
        },
        variants: [variant],
        featuredImage: { url: "", altText: item.title, width: 200, height: 200 },
        images: [],
        seo: { title: item.title, description: "" },
        tags: [],
        updatedAt: new Date().toISOString(),
      };
      addCartItem(variant, cartProduct, item.quantity);
    }
    openCart();
  }

  function handleApplyQuantity(qty: number) {
    // Emit custom event — ProductDescription can listen to update its quantity input
    const event = new CustomEvent("prodes:apply-quantity", { detail: { qty } });
    window.dispatchEvent(event);
  }

  return (
    <>
      <BundleWidget productId={product.id} onAddBundle={handleAddBundle} />
      <QuantitySimulator
        productHandle={product.handle}
        categoryName={product.categoryName}
        tags={product.tags}
        onApply={handleApplyQuantity}
      />
    </>
  );
}
