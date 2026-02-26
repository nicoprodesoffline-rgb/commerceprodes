"use client";

import Link from "next/link";
import { useCompare } from "lib/compare/context";

export default function CompareBar() {
  const { compareList, removeFromCompare, clearCompare } = useCompare();

  if (compareList.length === 0) return null;

  const count = compareList.length;
  const canCompare = count >= 2;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-gray-200 bg-white shadow-lg">
      <div className="mx-auto flex max-w-screen-2xl items-center justify-between gap-4 px-4 py-3 lg:px-6">
        {/* Gauche — chips */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-gray-700 whitespace-nowrap">
            {canCompare
              ? `Comparer ${count} produits`
              : "Ajoutez au moins un autre produit"}
          </span>
          <div className="flex flex-wrap gap-1">
            {compareList.map((handle) => (
              <span
                key={handle}
                className="flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700"
              >
                <span className="max-w-[80px] truncate">{handle.replace(/-/g, " ")}</span>
                <button
                  onClick={() => removeFromCompare(handle)}
                  className="ml-0.5 text-gray-400 hover:text-gray-700 transition-colors"
                  aria-label={`Retirer ${handle}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>

        {/* Droite — actions */}
        <div className="flex items-center gap-2 flex-none">
          <button
            onClick={clearCompare}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:border-gray-400 transition-colors"
          >
            Effacer
          </button>
          {canCompare && (
            <Link
              href={`/compare?handles=${compareList.join(",")}`}
              className="rounded-lg bg-[#cc1818] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#b01414] transition-colors whitespace-nowrap"
            >
              Comparer maintenant →
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
