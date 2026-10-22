"use client";

import { MinusIcon, PlusIcon } from "@heroicons/react/24/outline";
import clsx from "clsx";

export function EditItemQuantityButton({
  itemKey,
  type,
  optimisticUpdate,
}: {
  itemKey: string;
  type: "plus" | "minus";
  optimisticUpdate: (itemKey: string, updateType: "plus" | "minus") => void;
}) {
  return (
    <button
      type="button"
      onClick={() => optimisticUpdate(itemKey, type)}
      aria-label={type === "plus" ? "Augmenter la quantité" : "Diminuer la quantité"}
      className={clsx(
        "ease flex h-full min-w-[36px] max-w-[36px] flex-none items-center justify-center rounded-full p-2 transition-all duration-200 hover:border-neutral-800 hover:opacity-80",
        {
          "ml-auto": type === "minus",
        },
      )}
    >
      {type === "plus" ? (
        <PlusIcon className="h-4 w-4 dark:text-neutral-500" />
      ) : (
        <MinusIcon className="h-4 w-4 dark:text-neutral-500" />
      )}
    </button>
  );
}
