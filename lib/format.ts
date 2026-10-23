/**
 * Formatage d'affichage pur (client et serveur). Aucune arithmétique sur
 * Number : on reformate la chaîne décimale.
 */
export function formatAmount(amount: string, currency = "EUR", basis = "HT"): string {
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(amount);
  if (!m) return "prix indisponible";
  const ent = m[1]!.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const dec = ((m[2] ?? "") + "00").slice(0, 2);
  const sym = currency === "EUR" ? "€" : currency;
  // C0 v1 : `HT` ou `UNQUALIFIED` (aucune taxe calculée ni affichée comme connue).
  const label = basis === "UNQUALIFIED" ? "(base fiscale non qualifiée)" : basis;
  return `${ent},${dec} ${sym} ${label}`.trim();
}

export function formatQuantityRange(min: number, max: number | null): string {
  if (max === null) return `${min} et plus`;
  if (min === max) return `${min}`;
  return `${min} à ${max}`;
}

export function formatAxisName(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export function axesLabel(axes: Record<string, string>): string {
  const parts = Object.entries(axes).map(([k, v]) => `${formatAxisName(k)} : ${v}`);
  return parts.length ? parts.join(" · ") : "Variante unique";
}
