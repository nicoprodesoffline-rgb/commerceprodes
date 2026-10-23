// ADAPT (BC1-D puis W1/A2) de components/product/price-grid.tsx @a985aca2 : même tableau
// (en-têtes, styles) mais AUCUN calcul ni test local de date ou de quantité — chaque ligne est
// la sélection C0 `selectPrice` d'un palier publié à l'instant serveur (revue A2, F-04), ou le
// code C0 qui l'empêche. Le DTO C0 ne porte pas de couche PROMO/BASE : plus de badge promo.
import { formatAmount, formatQuantityRange } from "@/lib/format";

export type PriceGridRow = {
  tier_quantity: number;
  selected: boolean;
  error_codes: string[];
  rate_id: string | null;
  unit_amount: string | null;
  currency: string | null;
  tax_basis_or_status: string | null;
  quantity_min: number;
  quantity_max: number | null;
  validity_label: string | null;
};

export function PriceGrid({ rows }: { rows: PriceGridRow[] }) {
  if (!rows.some((r) => r.selected)) {
    return (
      <p className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900" data-testid="price-unavailable">
        Prix indisponible : aucun prix publié ne s&apos;applique à cet article à cet instant. Une demande de devis non chiffrée reste possible.
      </p>
    );
  }
  return (
    <div className="mt-4 mb-2">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
        Tarifs par quantité (prix retenus par le serveur maintenant)
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
            {rows.map((r) =>
              r.selected ? (
                <tr key={`t${r.tier_quantity}`} data-rate-id={r.rate_id ?? undefined} data-tier={r.tier_quantity} className="border-b border-gray-100 bg-white last:border-0">
                  <td className="py-2 px-3 text-gray-700">{formatQuantityRange(r.quantity_min, r.quantity_max)}</td>
                  <td className="py-2 px-3 text-right font-semibold text-[#cc1818]">
                    {formatAmount(r.unit_amount ?? "", r.currency ?? "EUR", r.tax_basis_or_status ?? "")}
                  </td>
                  <td className="py-2 px-3 text-xs text-gray-500">
                    {r.validity_label}
                    <span className="block font-mono text-[10px] text-gray-400">{r.rate_id}</span>
                  </td>
                </tr>
              ) : (
                <tr key={`t${r.tier_quantity}`} data-tier={r.tier_quantity} data-unavailable={r.error_codes.join(",")} className="border-b border-gray-100 bg-white last:border-0">
                  <td className="py-2 px-3 text-gray-700">À partir de {r.tier_quantity}</td>
                  <td className="py-2 px-3 text-right text-gray-400" colSpan={2}>
                    Prix indisponible pour cette quantité maintenant (devis non chiffré possible)
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-1 text-xs text-gray-400">
        Prix unitaire tel que publié (base indiquée : HT ou non qualifiée) — aucune TVA, aucun port, aucune remise calculés.
      </p>
    </div>
  );
}
