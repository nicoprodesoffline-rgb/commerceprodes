"use client";

import { removeItem, updateItemQuantity } from "components/cart/actions";
import { useTransition } from "react";
import { useRouter } from "next/navigation";

export function CartActions({
  merchandiseId,
  quantity,
  itemId,
}: {
  merchandiseId: string;
  quantity: number;
  itemId: string | undefined;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const update = (newQty: number) => {
    startTransition(async () => {
      await updateItemQuantity(null, { merchandiseId, quantity: newQty });
      router.refresh();
    });
  };

  const remove = () => {
    startTransition(async () => {
      await removeItem(null, merchandiseId);
      router.refresh();
    });
  };

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => {
          if (quantity <= 1) remove();
          else update(quantity - 1);
        }}
        disabled={isPending}
        className="flex h-7 w-7 items-center justify-center rounded-md border border-gray-300 text-gray-600 hover:border-[#cc1818] hover:text-[#cc1818] transition-colors disabled:opacity-40"
      >
        <span className="text-lg leading-none">−</span>
      </button>
      <span className="w-8 text-center text-sm font-medium tabular-nums">
        {isPending ? "…" : quantity}
      </span>
      <button
        onClick={() => update(quantity + 1)}
        disabled={isPending}
        className="flex h-7 w-7 items-center justify-center rounded-md border border-gray-300 text-gray-600 hover:border-[#cc1818] hover:text-[#cc1818] transition-colors disabled:opacity-40"
      >
        <span className="text-lg leading-none">+</span>
      </button>
      <button
        onClick={remove}
        disabled={isPending}
        title="Supprimer"
        className="ml-2 text-gray-400 hover:text-red-600 transition-colors disabled:opacity-40"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
