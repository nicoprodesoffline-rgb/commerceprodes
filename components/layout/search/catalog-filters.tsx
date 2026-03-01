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
  const [minLength, setMinLength] = useState(searchParams.get("minLength") ?? "");
  const [maxLength, setMaxLength] = useState(searchParams.get("maxLength") ?? "");
  const [minWidth, setMinWidth] = useState(searchParams.get("minWidth") ?? "");
  const [maxWidth, setMaxWidth] = useState(searchParams.get("maxWidth") ?? "");
  const [showDimensions, setShowDimensions] = useState(false);

  // Sync state when URL changes (e.g. browser back/forward)
  useEffect(() => {
    setMinPrice(searchParams.get("minPrice") ?? "");
    setMaxPrice(searchParams.get("maxPrice") ?? "");
    setInStock(searchParams.get("inStock") === "1");
    setMinLength(searchParams.get("minLength") ?? "");
    setMaxLength(searchParams.get("maxLength") ?? "");
    setMinWidth(searchParams.get("minWidth") ?? "");
    setMaxWidth(searchParams.get("maxWidth") ?? "");
  }, [searchParams]);

  const hasActiveFilters = Boolean(
    searchParams.get("minPrice") ||
    searchParams.get("maxPrice") ||
    searchParams.get("inStock") ||
    searchParams.get("minLength") ||
    searchParams.get("maxLength") ||
    searchParams.get("minWidth") ||
    searchParams.get("maxWidth"),
  );

  const hasDimFilters = Boolean(
    searchParams.get("minLength") ||
    searchParams.get("maxLength") ||
    searchParams.get("minWidth") ||
    searchParams.get("maxWidth"),
  );

  function apply() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("page");
    if (minPrice) params.set("minPrice", minPrice); else params.delete("minPrice");
    if (maxPrice) params.set("maxPrice", maxPrice); else params.delete("maxPrice");
    if (inStock) params.set("inStock", "1"); else params.delete("inStock");
    if (minLength) params.set("minLength", minLength); else params.delete("minLength");
    if (maxLength) params.set("maxLength", maxLength); else params.delete("maxLength");
    if (minWidth) params.set("minWidth", minWidth); else params.delete("minWidth");
    if (maxWidth) params.set("maxWidth", maxWidth); else params.delete("maxWidth");
    router.push(`${pathname}?${params.toString()}`);
  }

  function reset() {
    setMinPrice(""); setMaxPrice(""); setInStock(false);
    setMinLength(""); setMaxLength(""); setMinWidth(""); setMaxWidth("");
    const params = new URLSearchParams(searchParams.toString());
    ["minPrice", "maxPrice", "inStock", "minLength", "maxLength", "minWidth", "maxWidth", "page"].forEach(
      (k) => params.delete(k),
    );
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  const activeBadges = [
    searchParams.get("minPrice") && `≥ ${searchParams.get("minPrice")} €`,
    searchParams.get("maxPrice") && `≤ ${searchParams.get("maxPrice")} €`,
    searchParams.get("inStock") === "1" && "En stock",
    searchParams.get("minLength") && `L ≥ ${searchParams.get("minLength")} cm`,
    searchParams.get("maxLength") && `L ≤ ${searchParams.get("maxLength")} cm`,
    searchParams.get("minWidth") && `l ≥ ${searchParams.get("minWidth")} cm`,
    searchParams.get("maxWidth") && `l ≤ ${searchParams.get("maxWidth")} cm`,
  ].filter(Boolean);

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
      <label className="mb-3 flex cursor-pointer items-center gap-2 text-xs text-gray-700">
        <input
          type="checkbox"
          checked={inStock}
          onChange={(e) => setInStock(e.target.checked)}
          className="h-3.5 w-3.5 rounded border-gray-300 accent-[#cc1818]"
        />
        Disponibles seulement
      </label>

      {/* Dimensions (toggle) */}
      <button
        onClick={() => setShowDimensions((v) => !v)}
        className="mb-2 flex w-full items-center justify-between text-xs font-medium text-gray-600 hover:text-[#cc1818]"
      >
        <span>Dimensions (cm)</span>
        <span className="text-gray-400">{showDimensions || hasDimFilters ? "▲" : "▼"}</span>
      </button>

      {(showDimensions || hasDimFilters) && (
        <div className="mb-3 space-y-2 rounded bg-gray-50 p-2">
          <div>
            <p className="mb-1 text-[10px] text-gray-500">Longueur</p>
            <div className="flex items-center gap-1.5">
              <input
                type="number" min={0} placeholder="Min"
                value={minLength} onChange={(e) => setMinLength(e.target.value)}
                className="w-full rounded border border-gray-300 px-2 py-1 text-xs focus:border-[#cc1818] focus:outline-none"
              />
              <span className="flex-none text-gray-400 text-xs">–</span>
              <input
                type="number" min={0} placeholder="Max"
                value={maxLength} onChange={(e) => setMaxLength(e.target.value)}
                className="w-full rounded border border-gray-300 px-2 py-1 text-xs focus:border-[#cc1818] focus:outline-none"
              />
            </div>
          </div>
          <div>
            <p className="mb-1 text-[10px] text-gray-500">Largeur</p>
            <div className="flex items-center gap-1.5">
              <input
                type="number" min={0} placeholder="Min"
                value={minWidth} onChange={(e) => setMinWidth(e.target.value)}
                className="w-full rounded border border-gray-300 px-2 py-1 text-xs focus:border-[#cc1818] focus:outline-none"
              />
              <span className="flex-none text-gray-400 text-xs">–</span>
              <input
                type="number" min={0} placeholder="Max"
                value={maxWidth} onChange={(e) => setMaxWidth(e.target.value)}
                className="w-full rounded border border-gray-300 px-2 py-1 text-xs focus:border-[#cc1818] focus:outline-none"
              />
            </div>
          </div>
        </div>
      )}

      {/* Bouton appliquer */}
      <button
        onClick={apply}
        className="w-full rounded bg-[#cc1818] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#aa1414] transition-colors"
      >
        Appliquer
      </button>

      {/* Badge filtres actifs */}
      {activeBadges.length > 0 && (
        <p className="mt-2 text-center text-[10px] text-[#cc1818]">
          {activeBadges.join(" · ")}
        </p>
      )}
    </div>
  );
}
