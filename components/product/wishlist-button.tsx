"use client";

import { useWishlist } from "lib/wishlist/context";

export function WishlistButton({
  handle,
  className,
}: {
  handle: string;
  className?: string;
}) {
  const { toggle, isWishlisted } = useWishlist();
  const active = isWishlisted(handle);

  return (
    <button
      type="button"
      aria-label={active ? "Retirer des favoris" : "Ajouter aux favoris"}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle(handle);
      }}
      className={
        className ??
        `flex h-8 w-8 items-center justify-center rounded-full border transition-colors ${
          active
            ? "border-red-300 bg-red-50 text-[#cc1818]"
            : "border-gray-200 bg-white text-gray-400 hover:text-[#cc1818] hover:border-red-200"
        }`
      }
    >
      <svg
        className="h-4 w-4"
        fill={active ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth={2}
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
        />
      </svg>
    </button>
  );
}
