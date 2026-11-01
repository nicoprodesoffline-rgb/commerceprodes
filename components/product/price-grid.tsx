/**
 * Paliers SELL de la variante choisie : CHAQUE ligne est la sélection C0 `selectPrice` d'un palier publié à
 * l'instant serveur (`priceRows`, lib/site-catalog/view.ts, revue A2 F-04), ou le code C0 qui l'empêche.
 * Aucun calcul, aucun test local de date ou de quantité. `selectedRateId` = fenêtre retenue par le SERVEUR pour la
 * quantité saisie (aperçu), jamais déduite localement. Attributs `data-rate-id` / `data-tier` / `data-unavailable`
 * conservés (tests A2).
 */
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

/** `showBasis` : chaque ligne porte sa base fiscale (défaut) ; faux = la base est dite UNE fois par le bandeau de la fiche (`BasisNotice`, friction 14). */
export function PriceGrid({ rows, selectedRateId, caption = "Prix selon la quantité", showBasis = true }: { rows: PriceGridRow[]; selectedRateId?: string | null; caption?: string; showBasis?: boolean }) {
  if (!rows.some((r) => r.selected)) {
    // « Prix sur devis » : l'étiquette près du prix et la phrase du bloc d'achat le disent déjà ; pas de troisième formulation ici.
    if (rows.length > 0 && rows.every((r) => r.error_codes.includes("QUOTE_ONLY"))) return null;
    return (
      <p className="border border-line bg-surface p-4 text-sm text-ink-2" data-testid="price-unavailable">
        <strong className="font-semibold text-ink">Prix sur demande :</strong> ajoutez ce produit à votre demande de devis.
      </p>
    );
  }
  return (
    <div className="min-w-0">
      <table className="tabular w-full border-collapse text-sm">
        <caption className="mb-3 text-left text-sm font-semibold">{caption}</caption>
        <thead>
          <tr className="border-b border-line-strong text-left text-xs text-ink-2">
            <th scope="col" className="py-3 pr-3 font-medium">Quantité</th>
            <th scope="col" className="py-3 text-right font-medium">Prix unitaire</th>
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
                className={`border-b border-line ${current ? "bg-signal-subtle" : ""}`}
              >
                <td className="py-3 pr-3">
                  {quantityRange(r.quantity_min, r.quantity_max)}
                  {current && <span className="mt-1 block text-xs font-medium text-signal">Quantité choisie</span>}
                </td>
                <td className="py-3 text-right font-semibold">
                  {money(r.unit_amount ?? "")}{showBasis && <> <span className="font-normal">{basisLabel(r.tax_basis_or_status)}</span></>}
                </td>
              </tr>
            ) : (
              <tr key={`t${r.tier_quantity}`} data-tier={r.tier_quantity} data-unavailable={r.error_codes.join(",")} className="border-b border-line">
                <td className="py-3 pr-3">{quantityRange(r.quantity_min, r.quantity_max)}</td>
                <td className="py-3 text-right text-ink-2">{r.error_codes.includes("QUOTE_ONLY") ? "Prix sur devis" : "Prix sur demande"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
