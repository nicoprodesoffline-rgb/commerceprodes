"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";

type FilterOptions = {
  priceMin: number;
  priceMax: number;
  suppliers: Array<{ value: string; count: number }>;
  ecoCount: number;
  total: number;
};

function getSliderStep(min: number, max: number): number {
  const span = Math.max(0, max - min);
  if (span <= 100) return 1;
  if (span <= 1000) return 10;
  if (span <= 5000) return 25;
  if (span <= 20000) return 100;
  return 250;
}

export function CatalogFilters() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  const [options, setOptions] = useState<FilterOptions | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [supplier, setSupplier] = useState(searchParams.get("supplier") ?? "");
  const [ecoOnly, setEcoOnly] = useState(searchParams.get("eco") === "1");

  const [minPrice, setMinPrice] = useState(searchParams.get("minPrice") ?? "");
  const [maxPrice, setMaxPrice] = useState(searchParams.get("maxPrice") ?? "");
  const [inStock, setInStock] = useState(searchParams.get("inStock") === "1");

  const query = searchParams.get("q") ?? "";
  const collection = useMemo(() => {
    if (!pathname.startsWith("/search/")) return "";
    return decodeURIComponent(
      pathname.replace(/^\/search\//, "").split("/")[0] ?? "",
    );
  }, [pathname]);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    if (collection) params.set("collection", collection);
    if (query) params.set("q", query);

    setIsLoading(true);
    fetch(`/api/search/filters?${params.toString()}`, { cache: "no-store" })
      .then((res) => res.json())
      .then((data: FilterOptions) => {
        if (cancelled) return;
        setOptions(data);
      })
      .catch(() => {
        if (cancelled) return;
        setOptions({
          priceMin: 0,
          priceMax: 0,
          suppliers: [],
          ecoCount: 0,
          total: 0,
        });
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [collection, query]);

  // Sync state when URL changes (e.g. browser back/forward)
  useEffect(() => {
    setMinPrice(
      searchParams.get("minPrice") ?? (options ? String(options.priceMin) : ""),
    );
    setMaxPrice(
      searchParams.get("maxPrice") ?? (options ? String(options.priceMax) : ""),
    );
    setInStock(searchParams.get("inStock") === "1");
    setSupplier(searchParams.get("supplier") ?? "");
    setEcoOnly(searchParams.get("eco") === "1");
  }, [options, searchParams]);

  const hasActiveFilters =
    searchParams.get("minPrice") ||
    searchParams.get("maxPrice") ||
    searchParams.get("inStock") ||
    searchParams.get("supplier") ||
    searchParams.get("eco");

  const boundsMin = options?.priceMin ?? 0;
  const boundsMax = options?.priceMax ?? 0;
  const sliderStep = getSliderStep(boundsMin, boundsMax);
  const selectedMin = minPrice === "" ? boundsMin : Number(minPrice);
  const selectedMax = maxPrice === "" ? boundsMax : Number(maxPrice);
  const clampedMin = Number.isFinite(selectedMin)
    ? Math.max(boundsMin, Math.min(selectedMin, selectedMax || boundsMax))
    : boundsMin;
  const clampedMax = Number.isFinite(selectedMax)
    ? Math.min(boundsMax, Math.max(selectedMax, selectedMin || boundsMin))
    : boundsMax;

  function pushParams(params: URLSearchParams) {
    const qs = params.toString();
    startTransition(() => {
      router.push(qs ? `${pathname}?${qs}` : pathname);
    });
  }

  function apply() {
    const params = new URLSearchParams(searchParams.toString());
    if (options && clampedMin > boundsMin)
      params.set("minPrice", String(clampedMin));
    else params.delete("minPrice");
    if (options && clampedMax < boundsMax)
      params.set("maxPrice", String(clampedMax));
    else params.delete("maxPrice");
    if (inStock) params.set("inStock", "1");
    else params.delete("inStock");
    if (supplier) params.set("supplier", supplier);
    else params.delete("supplier");
    if (ecoOnly) params.set("eco", "1");
    else params.delete("eco");
    pushParams(params);
  }

  function reset() {
    setMinPrice(options ? String(options.priceMin) : "");
    setMaxPrice(options ? String(options.priceMax) : "");
    setInStock(false);
    setSupplier("");
    setEcoOnly(false);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("minPrice");
    params.delete("maxPrice");
    params.delete("inStock");
    params.delete("supplier");
    params.delete("eco");
    pushParams(params);
  }

  function setSliderMin(value: number) {
    const next = Math.min(value, clampedMax);
    setMinPrice(String(next));
  }

  function setSliderMax(value: number) {
    const next = Math.max(value, clampedMin);
    setMaxPrice(String(next));
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
        {options && boundsMax > boundsMin ? (
          <div className="mb-3 rounded-md border border-red-100 bg-red-50/50 px-3 py-3">
            <div className="mb-2 flex items-center justify-between text-[11px] font-semibold text-gray-700">
              <span>{clampedMin} €</span>
              <span>{clampedMax} €</span>
            </div>
            <div className="relative h-8">
              <div className="absolute top-1/2 h-1 w-full -translate-y-1/2 rounded-full bg-gray-200" />
              <div
                className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-[#cc1818]"
                style={{
                  left: `${((clampedMin - boundsMin) / Math.max(boundsMax - boundsMin, 1)) * 100}%`,
                  right: `${100 - ((clampedMax - boundsMin) / Math.max(boundsMax - boundsMin, 1)) * 100}%`,
                }}
              />
              <input
                type="range"
                min={boundsMin}
                max={boundsMax}
                step={sliderStep}
                value={clampedMin}
                onChange={(e) => setSliderMin(Number(e.target.value))}
                className="pointer-events-none absolute inset-0 h-8 w-full appearance-none bg-transparent [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-[#cc1818] [&::-webkit-slider-thumb]:shadow"
              />
              <input
                type="range"
                min={boundsMin}
                max={boundsMax}
                step={sliderStep}
                value={clampedMax}
                onChange={(e) => setSliderMax(Number(e.target.value))}
                className="pointer-events-none absolute inset-0 h-8 w-full appearance-none bg-transparent [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-[#111827] [&::-webkit-slider-thumb]:shadow"
              />
            </div>
          </div>
        ) : null}
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            min={0}
            placeholder="Min"
            value={minPrice}
            onChange={(e) => setMinPrice(e.target.value)}
            disabled={isLoading}
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs focus:border-[#cc1818] focus:outline-none focus:ring-1 focus:ring-[#cc1818]"
          />
          <span className="flex-none text-gray-400 text-xs">–</span>
          <input
            type="number"
            min={0}
            placeholder="Max"
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)}
            disabled={isLoading}
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs focus:border-[#cc1818] focus:outline-none focus:ring-1 focus:ring-[#cc1818]"
          />
        </div>
      </div>

      <div className="mb-3">
        <label className="mb-1 block text-xs font-medium text-gray-700">
          Fournisseur
        </label>
        <select
          value={supplier}
          onChange={(e) => setSupplier(e.target.value)}
          disabled={isLoading || !options || options.suppliers.length === 0}
          className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs text-gray-700 focus:border-[#cc1818] focus:outline-none focus:ring-1 focus:ring-[#cc1818] disabled:bg-gray-50"
        >
          <option value="">Tous les fournisseurs</option>
          {(options?.suppliers ?? []).map((item) => (
            <option key={item.value} value={item.value}>
              {item.value} ({item.count})
            </option>
          ))}
        </select>
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
      <label className="mb-4 flex cursor-pointer items-center gap-2 text-xs text-gray-700">
        <input
          type="checkbox"
          checked={ecoOnly}
          onChange={(e) => setEcoOnly(e.target.checked)}
          disabled={isLoading || !options || options.ecoCount === 0}
          className="h-3.5 w-3.5 rounded border-gray-300 accent-[#cc1818]"
        />
        Avec éco-participation
        {options && options.ecoCount > 0 ? ` (${options.ecoCount})` : ""}
      </label>

      {isLoading ? (
        <p className="mb-3 text-[10px] text-gray-400">
          Chargement des options…
        </p>
      ) : null}

      {/* Bouton appliquer */}
      <button
        onClick={apply}
        disabled={isPending || isLoading}
        className="w-full rounded bg-[#cc1818] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#aa1414] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? "Application…" : "Appliquer"}
      </button>

      {/* Badge filtres actifs */}
      {hasActiveFilters && (
        <p className="mt-2 text-center text-[10px] text-[#cc1818]">
          {[
            searchParams.get("minPrice") &&
              `≥ ${searchParams.get("minPrice")} €`,
            searchParams.get("maxPrice") &&
              `≤ ${searchParams.get("maxPrice")} €`,
            searchParams.get("inStock") === "1" && "En stock",
            searchParams.get("supplier") &&
              `Fournisseur: ${searchParams.get("supplier")}`,
            searchParams.get("eco") === "1" && "Éco-participation",
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}
    </div>
  );
}
