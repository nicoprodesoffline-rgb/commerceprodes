"use client";

import { formatAmount, formatQuantityRange, formatUtc, isWindowActive, isWindowFuture } from "lib/site-dto/pricing";
import type { PriceSelection, PriceWindow } from "lib/site-dto/types";

// BC1-B : affiche les fenêtres SELL du snapshot telles quelles (aucun calcul
// PBQ, aucune remise ni « économie » calculée). La ligne appliquée à la quantité
// courante est surlignée ; une PROMO future est annoncée avec ses dates UTC.
export function PriceGrid({
  windows,
  nowUtc,
  selected,
}: {
  windows: PriceWindow[];
  nowUtc: string;
  selected: PriceSelection | null;
}) {
  const active = windows.filter((w) => isWindowActive(w, nowUtc));
  const future = windows.filter((w) => isWindowFuture(w, nowUtc));
  if (active.length === 0 && future.length === 0) return null;

  const rows = [...active, ...future].sort(
    (a, b) => a.layer.localeCompare(b.layer) || a.quantity_min - b.quantity_min,
  );

  return (
    <div className="mt-4 mb-2">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
        Tarifs par quantité
      </h3>
      <div className="overflow-x-auto rounded-md border border-gray-200">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th scope="col" className="py-2 px-3 text-left font-medium text-gray-600 text-xs uppercase tracking-wide">
                Quantité
              </th>
              <th scope="col" className="py-2 px-3 text-right font-medium text-gray-600 text-xs uppercase tracking-wide">
                Prix unitaire
              </th>
              <th scope="col" className="py-2 px-3 text-left font-medium text-gray-600 text-xs uppercase tracking-wide">
                Tarif
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((w) => {
              const isFuture = isWindowFuture(w, nowUtc);
              const isSelected = selected?.rate_id === w.rate_id;
              return (
                <tr
                  key={w.rate_id}
                  aria-current={isSelected ? "true" : undefined}
                  className={[
                    "border-b border-gray-100 last:border-0",
                    isSelected ? "bg-red-50 font-semibold" : "bg-white",
                    isFuture ? "text-gray-400" : "",
                  ].join(" ")}
                >
                  <td className="py-2 px-3 text-gray-700">{formatQuantityRange(w)}</td>
                  <td className="py-2 px-3 text-right text-[#cc1818]">
                    {formatAmount(w.unit_amount, w.currency)} {w.tax_basis_or_status}
                  </td>
                  <td className="py-2 px-3 text-xs text-gray-500">
                    <span className="font-mono">{w.rate_id}</span>
                    {w.layer === "PROMO" && (
                      <span className={`ml-1 rounded px-1 py-0.5 text-[10px] font-bold ${isFuture ? "bg-gray-100 text-gray-500" : "bg-green-100 text-green-800"}`}>
                        PROMO {isFuture ? "à venir" : "active"}
                      </span>
                    )}
                    {w.layer === "PROMO" && (
                      <span className="block text-[10px]">
                        du {formatUtc(w.valid_from_utc)}
                        {w.valid_until_utc ? ` au ${formatUtc(w.valid_until_utc)} (exclu)` : ""}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-1 text-xs text-gray-400">
        Fenêtres SELL du snapshot à l&apos;instant {formatUtc(nowUtc)}. TVA et port non qualifiés.
      </p>
    </div>
  );
}
