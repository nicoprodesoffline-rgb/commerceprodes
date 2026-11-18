/**
 * Le pli de la règle commune « site_filters.v1 » (docs/site_filters_v1.md §1) : la clé de comparaison d'un libellé ou d'une valeur.
 * Jamais affichée (« gris » donne `gri`) ; aucun synonyme n'est deviné. Sert à chercher la teinte d'un coloris dans le nuancier.
 * Le filtre de rubrique, lui, ne plie rien : il compare les valeurs à l'octet.
 */
export function fold(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(" ")
    .map((word) => (word.length > 3 && /[sx]$/.test(word) ? word.slice(0, -1) : word))
    .join(" ");
}
