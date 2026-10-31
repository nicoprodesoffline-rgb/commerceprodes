"use client";

import { BasisNotice } from "@/components/site/basis-notice";
import { axisValue, money, parisDate, price, totalBasisLabel, uniformBasis } from "@/components/site/format";

export const TEST_ORDER_NOTICE = "Commande de test : aucun paiement, aucune livraison, aucune facture, aucun e-mail.";

type ReceiptLine = { public_item_key: string; variant_axes: Record<string, string>; quantity: number; priced?: boolean; unit_amount?: string | null; tax_basis_or_status?: string | null; line_total?: string | null };
export type ReceiptData = { lines?: ReceiptLine[]; total_amount?: string | null; created_at_utc?: string; catalogue_sequence?: number | null };

/** Données figées renvoyées par le serveur, communes à l'envoi et à la consultation. Aucun total recalculé. */
export function ReceiptDetails({ receipt, isOrder }: { receipt: ReceiptData; isOrder: boolean }) {
  const lines = receipt.lines ?? [];
  const bases = lines.filter((l) => l.unit_amount).map((l) => l.tax_basis_or_status);
  const common = uniformBasis(bases);
  return (
    <div className="min-w-0 space-y-3" data-testid="receipt-details">
      {isOrder && <p className="font-medium">{TEST_ORDER_NOTICE}</p>}
      {receipt.created_at_utc && (
        <p className="text-sm text-ink-2">Reçue le <time dateTime={receipt.created_at_utc}>{parisDate(receipt.created_at_utc)}</time>.</p>
      )}
      {common.uniform && <BasisNotice basis={common.basis} />}
      <div role="region" aria-label="Lignes enregistrées, tableau défilant" tabIndex={0} className="relative max-w-full overflow-x-auto">
        <table className="tabular w-full text-sm">
          <caption className="sr-only">Lignes enregistrées par le serveur</caption>
          <thead>
            <tr className="border-b border-line-strong text-left text-xs text-ink-3">
              <th scope="col" className="py-2 pr-2 font-medium">Référence</th>
              <th scope="col" className="py-2 pr-2 font-medium">Variante</th>
              <th scope="col" className="py-2 pr-2 text-right font-medium">Quantité</th>
              <th scope="col" className="py-2 pr-2 text-right font-medium">Prix unitaire</th>
              {isOrder && <th scope="col" className="py-2 text-right font-medium">Total ligne</th>}
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={`${l.public_item_key}${JSON.stringify(l.variant_axes)}`} className="h-[34px] border-b border-line" data-testid="receipt-line">
                <td className="py-1 pr-2 font-mono text-xs">{l.public_item_key}</td>
                <td className="py-1 pr-2">{Object.entries(l.variant_axes).map(([k, v]) => `${axisValue(k.replace(/_/g, " "))} : ${axisValue(v)}`).join(" · ") || "Modèle unique"}</td>
                <td className="py-1 pr-2 text-right">{l.quantity}</td>
                <td className="py-1 pr-2 text-right">{l.unit_amount ? (common.uniform ? money(l.unit_amount) : price(l.unit_amount, l.tax_basis_or_status)) : "sans prix (à chiffrer)"}</td>
                {isOrder && <td className="py-1 text-right">{l.line_total ? (common.uniform ? money(l.line_total) : price(l.line_total, l.tax_basis_or_status)) : "—"}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {receipt.total_amount ? (
        <p className="text-right font-semibold" data-testid="receipt-total">
          Total {money(receipt.total_amount)} {totalBasisLabel(bases)} <span className="font-normal text-ink-2">— taxes et port non calculés</span>
        </p>
      ) : <p className="text-sm text-ink-2">Aucun total enregistré par le serveur pour cette demande de devis.</p>}
    </div>
  );
}
