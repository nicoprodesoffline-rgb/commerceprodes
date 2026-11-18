/** Plus petit palier publié : aide à la saisie uniquement, le serveur reste l'autorité. */
export function minimumQuantity(rows: readonly { tier_quantity: number }[]): number {
  const tiers = rows.map((row) => row.tier_quantity).filter((n) => Number.isSafeInteger(n) && n >= 1);
  return tiers.length ? Math.min(...tiers) : 1;
}
