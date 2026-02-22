"use client";

import { useCart } from "components/cart/cart-context";

export function CartActions({
  merchandiseId,
  quantity,
}: {
  merchandiseId: string;
  quantity: number;
  itemId: string | undefined;
}) {
  const { updateCartItem } = useCart();

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => updateCartItem(merchandiseId, "minus")}
        className="flex h-7 w-7 items-center justify-center rounded-md border border-gray-300 text-gray-600 hover:border-[#cc1818] hover:text-[#cc1818] transition-colors"
      >
        <span className="text-lg leading-none">−</span>
      </button>
      <span className="w-8 text-center text-sm font-medium tabular-nums">{quantity}</span>
      <button
        onClick={() => updateCartItem(merchandiseId, "plus")}
        className="flex h-7 w-7 items-center justify-center rounded-md border border-gray-300 text-gray-600 hover:border-[#cc1818] hover:text-[#cc1818] transition-colors"
      >
        <span className="text-lg leading-none">+</span>
      </button>
      <button
        onClick={() => updateCartItem(merchandiseId, "delete")}
        title="Supprimer"
        className="ml-2 text-gray-400 hover:text-red-600 transition-colors"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
