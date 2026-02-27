"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState, useEffect } from "react";

export function CatalogFilters() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [minPrice, setMinPrice] = useState(searchParams.get("minPrice") ?? "");
  const [maxPrice, setMaxPrice] = useState(searchParams.get("maxPrice") ?? "");
  const [inStock, setInStock] = useState(searchParams.get("inStock") === "1");

  // Sync state when URL changes (e.g. browser back/forward)
  useEffect(() => {
    setMinPrice(searchParams.get("minPrice") ?? "");
    setMaxPrice(searchParams.get("maxPrice") ?? "");
    setInStock(searchParams.get("inStock") === "1");
  }, [searchParams]);

  const hasActiveFilters =
    searchParams.get("minPrice") ||
    searchParams.get("maxPrice") ||
    searchParams.get("inStock");

  function apply() {
    const params = new URLSearchParams(searchParams.toString());
    if (minPrice) params.set("minPrice", minPrice);
    else params.delete("minPrice");
    if (maxPrice) params.set("maxPrice", maxPrice);
    else params.delete("maxPrice");
    if (inStock) params.set("inStock", "1");
    else params.delete("inStock");
    router.push(`${pathname}?${params.toString()}`);
  }

  function reset() {
    setMinPrice("");
    setMaxPrice("");
    setInStock(false);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("minPrice");
    params.delete("maxPrice");
    params.delete("inStock");
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Filtres
        </h3>
        {hasActiveFilters && (
          <button
            onClick={reset}
            className="text-[10px] font-medium text-[#cc1818] hover:underline"
          >
            Effacer
          </button>
        )}
      </div>

      {/* Prix */}
      <div className="mb-3">
        <p className="mb-1.5 text-xs font-medium text-gray-700">Prix (€ HT)</p>
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            min={0}
            placeholder="Min"
            value={minPrice}
            onChange={(e) => setMinPrice(e.target.value)}
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs focus:border-[#cc1818] focus:outline-none focus:ring-1 focus:ring-[#cc1818]"
          />
          <span className="flex-none text-gray-400 text-xs">–</span>
          <input
            type="number"
            min={0}
            placeholder="Max"
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)}
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs focus:border-[#cc1818] focus:outline-none focus:ring-1 focus:ring-[#cc1818]"
          />
        </div>
      </div>

      {/* Disponibilité */}
      <label className="mb-4 flex cursor-pointer items-center gap-2 text-xs text-gray-700">
        <input
          type="checkbox"
          checked={inStock}
          onChange={(e) => setInStock(e.target.checked)}
          className="h-3.5 w-3.5 rounded border-gray-300 accent-[#cc1818]"
        />
        Disponibles seulement
      </label>

      {/* Bouton appliquer */}
      <button
        onClick={apply}
        className="w-full rounded bg-[#cc1818] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#aa1414] transition-colors"
      >
        Appliquer
      </button>

      {/* Badge filtres actifs */}
      {hasActiveFilters && (
        <p className="mt-2 text-center text-[10px] text-[#cc1818]">
          {[
            searchParams.get("minPrice") && `≥ ${searchParams.get("minPrice")} €`,
            searchParams.get("maxPrice") && `≤ ${searchParams.get("maxPrice")} €`,
            searchParams.get("inStock") === "1" && "En stock",
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}
    </div>
  );
}
