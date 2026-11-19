/**
 * Cercle 5, lignes 5.5 à 5.7 : les montants d'une demande (HT, TVA, TTC), calculés par le SITE et revérifiés par la Factory (docs/contracts/site_events_v2.md §3.2).
 * Module PUR : entiers `bigint` en centimes, jamais de `Number` pour un montant. Le taux de TVA est une chaîne « 20.00 » publiée par la boutique.
 * TVA d'une ligne = arrondi au centime, DEMI AU-DESSUS (0,005 → 0,01), ligne par ligne ; la livraison est une ligne de montant à part.
 */

const MONEY = /^(0|[1-9][0-9]{0,8})\.([0-9]{2})$/;
const RATE = /^(0|[1-9][0-9]?)\.([0-9]{2})$/;

export const DELIVERY_INCLUDED = "incluse";
export const DELIVERY_APPOINTMENT = "rendez_vous";
export type DeliveryOption = typeof DELIVERY_INCLUDED | typeof DELIVERY_APPOINTMENT;

export type Lot = { bought: number; free: number };

export const toCents = (money: string): bigint => {
  const found = MONEY.exec(money);
  if (found === null) throw new RangeError("montant mal écrit");
  return BigInt(found[1]!) * 100n + BigInt(found[2]!);
};
export const toMoney = (cents: bigint): string => `${(cents / 100n).toString()}.${(cents % 100n).toString().padStart(2, "0")}`;

/** Le taux « 20.00 » en centièmes de pour cent (2000n), ou `null` si la chaîne n'est pas un taux. */
export const rateBasisPoints = (rate: string): bigint | null => {
  const found = RATE.exec(rate);
  return found === null ? null : BigInt(found[1]!) * 100n + BigInt(found[2]!);
};

/** TVA d'un montant HT (centimes) : arrondi au centime, demi au-dessus. */
export function vatCents(htCents: bigint, rate: string): bigint {
  const basis = rateBasisPoints(rate);
  if (basis === null) throw new RangeError("taux de TVA mal écrit");
  return (htCents * basis + 5000n) / 10000n;
}

/** Une ligne en entrée : `unitHt` vaut `null` pour une ligne « prix sur devis ». */
export type AmountLine = { quantity: number; unitHt: string | null };
export type PricedLine = { unit_amount_ht: string | null; line_total_ht: string | null; line_tva: string | null };
export type Amounts = {
  currency: "EUR";
  tax_rate: string;
  total_ht: string;
  total_tva: string;
  total_ttc: string;
  excludes_quote_lines: boolean;
};
export type Delivery = { option: DeliveryOption; label: string; amount_ht: string; amount_tva: string };

/** La ligne chiffrée : `quantity × unit`, puis sa TVA. Une ligne sans prix reste sans aucun montant. */
export function priceLine(line: AmountLine, rate: string): PricedLine {
  if (line.unitHt === null) return { unit_amount_ht: null, line_total_ht: null, line_tva: null };
  const total = toCents(line.unitHt) * BigInt(line.quantity);
  return { unit_amount_ht: line.unitHt, line_total_ht: toMoney(total), line_tva: toMoney(vatCents(total, rate)) };
}

/** La livraison : « incluse » vaut 0,00 ; « sur rendez-vous » porte le montant réglé dans la boutique, sa TVA calculée de même. */
export function priceDelivery(option: DeliveryOption, label: string, appointmentHt: string, rate: string): Delivery {
  const ht = option === DELIVERY_APPOINTMENT ? toCents(appointmentHt) : 0n;
  return { option, label, amount_ht: toMoney(ht), amount_tva: toMoney(vatCents(ht, rate)) };
}

/** Les totaux : somme des lignes chiffrées + livraison (HT et TVA) ; TTC = HT + TVA. `excludes_quote_lines` dit qu'une ligne sur devis n'est pas comptée. */
export function totals(lines: readonly PricedLine[], delivery: Delivery, rate: string): Amounts {
  let ht = toCents(delivery.amount_ht);
  let tva = toCents(delivery.amount_tva);
  let excludes = false;
  for (const line of lines) {
    if (line.line_total_ht === null || line.line_tva === null) {
      excludes = true;
      continue;
    }
    ht += toCents(line.line_total_ht);
    tva += toCents(line.line_tva);
  }
  return { currency: "EUR", tax_rate: rate, total_ht: toMoney(ht), total_tva: toMoney(tva), total_ttc: toMoney(ht + tva), excludes_quote_lines: excludes };
}

/** « 10 achetés + 2 offerts » : la mention d'un lot, du panier jusqu'au PDF (ligne 5.7). */
export const lotText = (lot: Lot): string => `${lot.bought} acheté${lot.bought > 1 ? "s" : ""} + ${lot.free} offert${lot.free > 1 ? "s" : ""}`;
