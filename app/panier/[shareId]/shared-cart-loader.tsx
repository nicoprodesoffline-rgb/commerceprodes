"use client";

import { useRouter } from "next/navigation";
import { useCart } from "components/cart/cart-context";
import type { CartItem } from "lib/supabase/types";
import Image from "next/image";

function formatHT(n: number) {
  return new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2 }).format(n) + " € HT";
}

export function SharedCartLoader({ items }: { items: unknown[] }) {
  const { cart, addCartItem } = useCart();
  const router = useRouter();

  const cartLines = items as CartItem[];
  const subtotal = cartLines.reduce(
    (sum, item) => sum + Number(item.cost.totalAmount.amount),
    0,
  );

  const handleRecover = () => {
    // Restore each item into the current localStorage cart
    cartLines.forEach((item) => {
      const variant = {
        id: item.merchandise.id,
        title: item.merchandise.title,
        availableForSale: true,
        selectedOptions: item.merchandise.selectedOptions,
        price: {
          amount: (Number(item.cost.totalAmount.amount) / item.quantity).toFixed(2),
          currencyCode: item.cost.totalAmount.currencyCode,
        },
      };
      const product = {
        id: item.merchandise.product.id,
        handle: item.merchandise.product.handle,
        title: item.merchandise.product.title,
        featuredImage: item.merchandise.product.featuredImage,
        availableForSale: true,
        description: "",
        descriptionHtml: "",
        options: [],
        priceRange: {
          maxVariantPrice: { amount: variant.price.amount, currencyCode: "EUR" },
          minVariantPrice: { amount: variant.price.amount, currencyCode: "EUR" },
        },
        variants: [variant],
        images: [],
        tags: [],
        seo: { title: "", description: "" },
      } as unknown as Parameters<typeof addCartItem>[1];
      addCartItem(variant as Parameters<typeof addCartItem>[0], product, item.quantity);
    });
    router.push("/checkout");
  };

  if (cartLines.length === 0) {
    return <p className="text-gray-500">Ce panier est vide.</p>;
  }

  return (
    <div>
      <div className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
        {cartLines.map((item, i) => (
          <div key={i} className="flex items-center gap-4 p-4">
            <div className="h-14 w-14 flex-none overflow-hidden rounded border border-gray-100 bg-gray-50">
              {item.merchandise.product.featuredImage?.url ? (
                <Image
                  src={item.merchandise.product.featuredImage.url}
                  alt={item.merchandise.product.title}
                  width={56}
                  height={56}
                  className="h-full w-full object-contain"
                />
              ) : (
                <div className="h-full w-full bg-gray-100" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-900 truncate">
                {item.merchandise.product.title}
              </p>
              {item.merchandise.title !== "Default Title" && (
                <p className="text-xs text-gray-500">{item.merchandise.title}</p>
              )}
              <p className="text-xs text-gray-400">× {item.quantity}</p>
            </div>
            <p className="font-semibold text-gray-900 text-sm">
              {formatHT(Number(item.cost.totalAmount.amount))}
            </p>
          </div>
        ))}
        <div className="flex items-center justify-between px-4 py-3 bg-gray-50">
          <span className="font-semibold text-gray-700">Total HT</span>
          <span className="font-bold text-gray-900">{formatHT(subtotal)}</span>
        </div>
      </div>

      <button
        onClick={handleRecover}
        className="mt-6 w-full rounded-md bg-[#cc1818] py-3 text-center text-sm font-bold text-white hover:bg-[#aa1414] transition-colors"
      >
        Récupérer ce panier →
      </button>
      <p className="mt-2 text-center text-xs text-gray-400">
        Ce panier sera ajouté à vos articles actuels
      </p>
    </div>
  );
}
