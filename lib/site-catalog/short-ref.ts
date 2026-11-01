import { decodeSequence, isKey, makeKey } from "@/c0/ts/src/identity";

/**
 * Référence courte affichée (décision Owner D6) : « PI- » + le nombre P que code la clé publique C0, en décimal, complété de zéros à gauche
 * jusqu'à 6 chiffres (au-delà de 999 999 les chiffres s'allongent, jamais tronqués). La clé longue (`PI-` + 9 caractères Crockford) reste dans les adresses,
 * les données et les échanges ; seul l'AFFICHAGE et la SAISIE passent par la forme courte. Fonctions pures : C0 n'est pas modifié.
 */
export const SHORT_REF_DIGITS = 6;
const SHORT_FORM = /^PI-?(\d{1,13})$/;

/** `PI-…` courte d'une clé d'Item valide ; toute autre valeur est rendue telle quelle (jamais de référence inventée). */
export function shortRef(key: string): string {
  if (!isKey(key, "item")) return key;
  return `PI-${String(decodeSequence(key, "item")).padStart(SHORT_REF_DIGITS, "0")}`;
}

/**
 * Clé longue d'une saisie : la clé longue valide est prise telle quelle (elle prime), sinon la forme courte `PI-000401` (ou `PI000401`, `pi-401`) est
 * convertie. `null` si la saisie n'est ni l'une ni l'autre. Une forme courte hors plage C0 (0 ou plus de 32^8 − 1) est refusée.
 */
export function itemKeyFromInput(input: string): string | null {
  const value = input.trim().toUpperCase().replace(/\s+/g, "");
  if (isKey(value, "item")) return value;
  const m = SHORT_FORM.exec(value);
  if (!m) return null;
  const sequence = Number(m[1]);
  if (!Number.isSafeInteger(sequence)) return null;
  try {
    return makeKey("item", sequence);
  } catch {
    return null;
  }
}
