/** La caractéristique réservée « Pastille » (docs/site_filters_v1.md §4) : elle dessine la pastille et nourrit le filtre Coloris, et ne s'affiche jamais comme une caractéristique. */
export const PASTILLE_LABEL = "Pastille";

export const MULTICOLORE = "Multicolore";
export const NON_PRECISE = "Non précisé";
export const BICOLORE_SEPARATOR = " / ";

export const isPastilleLabel = (label: string): boolean => label.trim().toLowerCase() === PASTILLE_LABEL.toLowerCase();

/** La valeur de « Pastille » d'un porteur de caractéristiques (la sienne, sinon `undefined`). */
export function pastilleOf(carrier: { characteristics?: readonly { label: string; value: string }[] | undefined }): string | undefined {
  return carrier.characteristics?.find((c) => c.label === PASTILLE_LABEL)?.value;
}
