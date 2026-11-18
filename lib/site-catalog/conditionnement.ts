/**
 * Axe « conditionnement » (lots, offres « X achetés + Y offerts ») publié par la Factory comme un axe ordinaire de la Famille : chaque conditionnement est un Item avec SA clé
 * publique, SON prix (celui du lot entier) et sa quantité comptée en lots. Le front ne déduit AUCUN prix unitaire d'un prix de lot : il détecte l'axe par sa CLÉ (jamais par un libellé,
 * les libellés « Unitaire », « Lot de N » sont proposés à l'Owner et peuvent changer), et s'en sert seulement pour ne pas appeler « prix à l'unité » le prix d'un lot et pour ranger les choix.
 * Fonctions pures.
 */
import { isShown } from "@/lib/site-catalog/variant-choice";

export const PACK_AXIS = "conditionnement";

/** Valeur de conditionnement d'un Item (jamais la valeur réservée « pas de valeur »), ou `null` si l'Item n'a pas cet axe. */
export function packValue(axes: Record<string, string> | undefined): string | null {
  const v = axes?.[PACK_AXIS];
  return isShown(v) ? v : null;
}

/**
 * Ordre PROPOSÉ des valeurs de l'axe « conditionnement » (porté au dossier Owner) : d'abord les valeurs sans chiffre, puis le premier entier lu dans la valeur, croissant
 * (« Lot de 11 » avant « Lot de 20 » ; « 3 achetés + 1 offert » se range à 3), puis l'ordre alphabétique. Ne s'applique qu'à cet axe.
 */
const firstInteger = (v: string): number | null => {
  const m = /\d+/.exec(v);
  return m ? Number(m[0]) : null;
};
export function comparePack(a: string, b: string): number {
  const x = firstInteger(a), y = firstInteger(b);
  if (x === null || y === null) return x === y ? a.localeCompare(b, "fr") : x === null ? -1 : 1;
  return x - y || a.localeCompare(b, "fr");
}

/** Les valeurs de l'axe dans l'ordre proposé. */
export const sortPackValues = (values: readonly string[]): string[] => [...values].sort(comparePack);

/**
 * Clé de l'Item présélectionné au départ : la première combinaison publiée dans l'ordre proposé de l'axe (tri stable : à conditionnement égal, l'ordre publié des Items). `undefined` si la Famille n'a
 * pas cet axe (le comportement d'avant reste : le premier Item). C0 impose l'ordre des Items par clé : l'ordre d'affichage est donc décidé ici, pas par la Factory.
 */
export function firstByPack<T extends { public_item_key: string; variant_axes: Record<string, string> }>(items: readonly T[]): string | undefined {
  if (!items.some((i) => packValue(i.variant_axes) !== null)) return undefined;
  const rank = (i: T) => packValue(i.variant_axes);
  const sorted = items.map((item, index) => ({ item, index })).sort((p, q) => {
    const a = rank(p.item), b = rank(q.item);
    const byPack = a === null || b === null ? (a === b ? 0 : a === null ? -1 : 1) : comparePack(a, b);
    return byPack || p.index - q.index;
  });
  return sorted[0]?.item.public_item_key;
}
