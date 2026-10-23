// ADAPT (BC1-D puis W1/A2) de components/product/price-grid.tsx @a985aca2 : même tableau
// (en-têtes, styles) mais AUCUN calcul — chaque ligne est une fenêtre SELL publiée par le DTO
// C0, affichée telle quelle. Le DTO C0 ne porte pas de couche PROMO/BASE : plus de badge promo.
import { formatAmount, formatQuantityRange } from "@/lib/format";

export type PriceGridRow = {
  rate_id: string;
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
      Prix indisponible : aucune fenêtre de vente active pour cet article à cet instant. Une demande de devis non chiffrée reste possible.
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
                className="border-b border-gray-100 bg-white last:border-0"
              >
                <td className="py-2 px-3 text-gray-700">
                  {formatQuantityRange(r.quantity_min, r.quantity_max)}
                  {r.state === "FUTURE" && (
                    <span className="ml-2 inline-block rounded-full bg-gray-200 px-2 py-0.5 text-xs font-semibold text-gray-700">À venir</span>
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
        Prix unitaire tel que publié (base indiquée : HT ou non qualifiée) — aucune TVA, aucun port, aucune remise calculés.
      </p>
    </div>
  );
}
