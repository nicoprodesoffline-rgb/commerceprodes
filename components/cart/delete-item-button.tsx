"use client";

import { XMarkIcon } from "@heroicons/react/24/outline";

export function DeleteItemButton({
  itemKey,
  optimisticUpdate,
}: {
  itemKey: string;
  optimisticUpdate: (itemKey: string, updateType: "delete") => void;
}) {
  return (
    <button
      type="button"
      onClick={() => optimisticUpdate(itemKey, "delete")}
      aria-label="Retirer la ligne du panier"
      className="flex h-[24px] w-[24px] items-center justify-center rounded-full bg-neutral-500"
    >
      <XMarkIcon className="mx-[1px] h-4 w-4 text-white dark:text-black" />
    </button>
  );
}
