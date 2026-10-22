// ADAPT (BC1-D) de components/product/price-grid.tsx @a985aca2 : même tableau
// (en-têtes, styles, mention HT) mais AUCUN calcul — chaque ligne est une
// fenêtre SELL publiée, affichée telle quelle. Calcul PBQ « fixed/percentage »
// et colonne « Économie » supprimés.
import { formatAmount, formatQuantityRange } from "@/lib/format";

export type PriceGridRow = {
  rate_id: string;
  layer: string;
  unit_amount: string;
  currency: string;
  tax_basis_or_status: string;
  quantity_min: number;
  quantity_max: number | null;
  state: "ACTIVE" | "FUTURE" | "EXPIRED";
  validity_label: string;
};

export function PriceGrid({ rows }: { rows: PriceGridRow[] }) {
  const visible = rows.filter((r) => r.state !== "EXPIRED");
  const unavailable = (
    <p className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
      Prix indisponible : aucune fenêtre de vente active pour cet article à cet instant.
    </p>
  );
  if (visible.length === 0) return unavailable;

  return (
    <div className="mt-4 mb-2">
      {!visible.some((r) => r.state === "ACTIVE") && unavailable}
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
        Tarifs par quantité (fenêtres de vente publiées)
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
                Validité
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr
                key={r.rate_id}
                data-rate-id={r.rate_id}
                data-state={r.state}
                className={[
                  "border-b border-gray-100 last:border-0",
                  r.layer === "PROMO" ? "bg-red-50" : "bg-white",
                ].join(" ")}
              >
                <td className="py-2 px-3 text-gray-700">
                  {formatQuantityRange(r.quantity_min, r.quantity_max)}
                  {r.state === "FUTURE" && r.layer !== "PROMO" && (
                    <span className="ml-2 inline-block rounded-full bg-gray-200 px-2 py-0.5 text-xs font-semibold text-gray-700">À venir</span>
                  )}
                  {r.layer === "PROMO" && (
                    <span
                      className={[
                        "ml-2 inline-block rounded-full px-2 py-0.5 text-xs font-semibold",
                        r.state === "ACTIVE" ? "bg-[#cc1818] text-white" : "bg-gray-200 text-gray-700",
                      ].join(" ")}
                    >
                      {r.state === "ACTIVE" ? "Promo active" : "Promo à venir"}
                    </span>
                  )}
                </td>
                <td
                  className={[
                    "py-2 px-3 text-right font-semibold",
                    r.state === "ACTIVE" ? "text-[#cc1818]" : "text-gray-400",
                  ].join(" ")}
                >
                  {formatAmount(r.unit_amount, r.currency, r.tax_basis_or_status)}
                </td>
                <td className="py-2 px-3 text-xs text-gray-500">
                  {r.validity_label}
                  <span className="block font-mono text-[10px] text-gray-400">{r.rate_id}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-1 text-xs text-gray-400">
        Prix unitaire HT tel que publié — TVA, port et remise non qualifiés dans ce spike.
      </p>
    </div>
  );
}
