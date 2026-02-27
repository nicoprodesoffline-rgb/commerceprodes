"use client";

import { Product } from "lib/supabase/types";

interface BadgeConfig {
  label: string;
  bg: string;
  text: string;
}

function isNewProduct(product: Product): boolean {
  // Check createdAt if available, otherwise check id-based heuristic
  if ((product as any).createdAt) {
    const created = new Date((product as any).createdAt);
    const now = new Date();
    const diffDays = (now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
    return diffDays <= 30;
  }
  return false;
}

function isPromoProduct(product: Product): boolean {
  const salePrice = (product as any).salePrice as number | undefined;
  const regularPrice = product.regularPrice ?? 0;
  return salePrice != null && salePrice > 0 && salePrice < regularPrice;
}

function isExclusifProduct(product: Product): boolean {
  return (
    product.title.toLowerCase().includes("pro-intens") ||
    product.title.toLowerCase().includes("pro intens") ||
    (product.sku?.toLowerCase().includes("proint") ?? false) ||
    (product.sku?.toLowerCase().includes("pro-int") ?? false)
  );
}

function isLotProduct(product: Product): boolean {
  return product.variants.some((v) =>
    v.selectedOptions.some(
      (o) =>
        o.name === "pa_les-lots" ||
        o.name === "lot" ||
        o.name.toLowerCase().includes("lot"),
    ),
  );
}

export function getProductBadges(product: Product): BadgeConfig[] {
  const badges: BadgeConfig[] = [];

  if (isNewProduct(product)) {
    badges.push({ label: "NOUVEAU", bg: "bg-green-100", text: "text-green-700" });
  }
  if (isPromoProduct(product)) {
    badges.push({ label: "PROMO", bg: "bg-red-100", text: "text-red-700" });
  }
  if (isExclusifProduct(product)) {
    badges.push({ label: "EXCLUSIF", bg: "bg-amber-100", text: "text-amber-700" });
  }
  if (isLotProduct(product)) {
    badges.push({ label: "LOT", bg: "bg-blue-100", text: "text-blue-700" });
  }

  return badges;
}

export function ProductBadges({ product }: { product: Product }) {
  const badges = getProductBadges(product);
  if (badges.length === 0) return null;

  return (
    <div className="absolute left-2 top-2 z-10 flex flex-col gap-1">
      {badges.map((badge) => (
        <span
          key={badge.label}
          className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${badge.bg} ${badge.text}`}
        >
          {badge.label}
        </span>
      ))}
    </div>
  );
}
