"use client";

/**
 * Cercle 5, 5.5 et 5.6 : total hors taxes, livraison, TVA et TOTAL TOUTES TAXES COMPRISES du panier, calculés avec les montants que le serveur a sélectionnés (aperçu) et le taux publié
 * par la boutique : TVA arrondie au centime, demi au-dessus, ligne par ligne. Le serveur refait ce calcul à l'envoi et refuse un total différent.
 * Une ligne « prix sur devis » ou sans prix n'est pas comptée, et le total le dit.
 */
import { useMemo } from "react";
import { money } from "@/components/site/format";
import { DELIVERY_APPOINTMENT, priceDelivery, priceLine, toCents, toMoney, totals, type DeliveryOption } from "@/lib/site-requests/amounts";
import type { PreviewJson } from "@/lib/site-business/client-types";
import type { PublicCommerce } from "@/lib/site-commerce/public";

export function taxAmounts(preview: PreviewJson, commerce: Extract<PublicCommerce, { ready: true }>, option: DeliveryOption) {
  const lines = preview.lines.map((l) => priceLine({ quantity: l.quantity, unitHt: l.accepted && l.selection ? l.selection.unit_amount : null }, commerce.tax_rate));
  const delivery = priceDelivery(option, option === DELIVERY_APPOINTMENT ? commerce.delivery.label : "Livraison incluse", commerce.delivery.amount_ht, commerce.tax_rate);
  return { lines, delivery, amounts: totals(lines, delivery, commerce.tax_rate) };
}

const rate = (tax: string): string => tax.replace(/\.00$/, "").replace(".", ",");

export function TaxTotals({ preview, commerce, option = "incluse" }: { preview: PreviewJson; commerce: Extract<PublicCommerce, { ready: true }>; option?: DeliveryOption }) {
  const { delivery, amounts } = useMemo(() => taxAmounts(preview, commerce, option), [preview, commerce, option]);
  return (
    <dl className="border-t border-line bg-surface px-3 py-3 text-sm" data-testid="tax-totals">
      <div className="flex justify-between gap-2"><dt>Total hors taxes (lignes)</dt><dd className="tabular" data-testid="total-ht-lines">{money(toMoney(toCents(amounts.total_ht) - toCents(delivery.amount_ht)))}</dd></div>
      <div className="flex justify-between gap-2">
        <dt>{delivery.label}</dt>
        <dd className="tabular" data-testid="delivery-line">{option === DELIVERY_APPOINTMENT ? `${money(delivery.amount_ht)} HT` : "incluse"}</dd>
      </div>
      <div className="flex justify-between gap-2"><dt>TVA ({rate(commerce.tax_rate)} %)</dt><dd className="tabular" data-testid="total-tva">{money(amounts.total_tva)}</dd></div>
      <div className="mt-1 flex justify-between gap-2 text-base font-semibold"><dt>Total toutes taxes comprises</dt><dd className="tabular" data-testid="total-ttc" aria-live="polite">{money(amounts.total_ttc)} TTC</dd></div>
      {amounts.excludes_quote_lines && <p className="mt-1 text-xs text-ink-2" data-testid="excludes-quote-lines">Hors lignes sur devis : leur prix n&apos;est pas compris dans ces totaux.</p>}
    </dl>
  );
}
