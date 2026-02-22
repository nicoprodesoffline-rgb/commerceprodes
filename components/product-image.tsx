"use client";

import Image from "next/image";
import { useState } from "react";

const FallbackIcon = () => (
  <div className="flex h-full w-full items-center justify-center text-neutral-300">
    <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor">
      <path d="M4 5h16v14H4V5zm2 2v10h12V7H6zm3 3a1 1 0 1 1 2 0 1 1 0 0 1-2 0zm-1 7 2.5-3.5L13 16l2.5-3.5L18 17H6z" />
    </svg>
  </div>
);

export function ProductCardImage({
  src,
  alt,
  sizes,
}: {
  src: string;
  alt: string;
  sizes: string;
}) {
  const [error, setError] = useState(false);

  if (error) return <FallbackIcon />;

  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      className="relative h-full w-full object-contain transition duration-300 ease-in-out group-hover:scale-105"
      onError={() => setError(true)}
    />
  );
}
