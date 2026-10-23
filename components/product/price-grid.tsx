/**
 * Paliers SELL de la variante choisie : CHAQUE ligne est la sélection C0 `selectPrice` d'un palier publié à
 * l'instant serveur (`priceRows`, lib/site-catalog/view.ts, revue A2 F-04), ou le code C0 qui l'empêche.
 * Aucun calcul, aucun test local de date ou de quantité. `selectedRateId` = fenêtre retenue par le SERVEUR pour la
 * quantité saisie (aperçu), jamais déduite localement. Attributs `data-rate-id` / `data-tier` / `data-unavailable`
 * conservés (tests A2).
 */
import { codeMessage } from "@/components/site/codes";
import { basisLabel, money, quantityRange } from "@/components/site/format";

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

export function PriceGrid({ rows, selectedRateId, caption }: { rows: PriceGridRow[]; selectedRateId?: string | null; caption: string }) {
  if (!rows.some((r) => r.selected)) {
    return (
      <p className="rounded-[9px] border border-caution bg-white p-3 text-sm" data-testid="price-unavailable">
        <strong className="font-semibold">Prix indisponible</strong> : aucun prix de vente publié ne s&apos;applique à cette variante en ce moment.
        Vous pouvez l&apos;ajouter au panier pour une demande de devis sans prix ; la commande n&apos;est pas possible.
      </p>
    );
  }
  return (
    <div className="relative overflow-x-auto">
      <table className="tabular w-full border-collapse text-sm">
        <caption className="mb-2 text-left text-sm font-semibold">{caption}</caption>
        <thead>
          <tr className="border-b border-line-strong text-left text-xs text-ink-3">
            <th scope="col" className="py-2 pr-3 font-medium">Quantité</th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">Prix unitaire</th>
            <th scope="col" className="hidden py-2 font-medium sm:table-cell">Validité</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const current = r.selected && r.rate_id !== null && r.rate_id === selectedRateId;
            return r.selected ? (
              <tr
                key={`t${r.tier_quantity}`}
                data-rate-id={r.rate_id ?? undefined}
                data-tier={r.tier_quantity}
                aria-current={current ? "true" : undefined}
                className={`h-[34px] border-b border-line ${current ? "bg-signal-subtle" : ""}`}
              >
                <td className={`py-1.5 pr-3 ${current ? "border-l-2 border-signal pl-2" : ""}`}>
                  {quantityRange(r.quantity_min, r.quantity_max)}
                  {current && <span className="ml-2 text-xs font-medium text-signal">quantité choisie</span>}
                </td>
                <td className="py-1.5 pr-3 text-right font-semibold whitespace-nowrap">
                  {money(r.unit_amount ?? "")} <span className="font-normal">{basisLabel(r.tax_basis_or_status)}</span>
                </td>
                <td className={`hidden py-1.5 text-xs sm:table-cell ${current ? "text-ink-2" : "text-ink-3"}`}>{r.validity_label}</td>
              </tr>
            ) : (
              <tr key={`t${r.tier_quantity}`} data-tier={r.tier_quantity} data-unavailable={r.error_codes.join(",")} className="h-[34px] border-b border-line">
                <td className="py-1.5 pr-3">À partir de {r.tier_quantity}</td>
                <td className="py-1.5 text-ink-2" colSpan={2}>
                  Prix indisponible pour cette quantité en ce moment
                  <span className="sr-only"> — {r.error_codes.map(codeMessage).join(" ")}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-ink-3">Prix de vente PRODES publiés, base indiquée sur chaque ligne. Taxes, port et remises : non calculés.</p>
    </div>
  );
}
