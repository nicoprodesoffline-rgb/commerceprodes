/**
 * Formatage d'affichage pur (client et serveur), sans arithmétique : les montants restent les chaînes Money
 * C0 (`^\d+\.\d{2}$`) reformatées en français. Base fiscale toujours explicite (DA §3 : « jamais mélange HT/TTC
 * implicite ») : `HT` → « € HT », `UNQUALIFIED` → « € (base fiscale non précisée) ».
 */
export function money(amount: string): string {
  const m = /^(\d+)\.(\d{2})$/.exec(amount);
  if (!m) return "montant illisible";
  return `${m[1]!.replace(/\B(?=(\d{3})+(?!\d))/g, " ")},${m[2]} €`;
}

export function basisLabel(basis: string | null | undefined): string {
  if (basis === "HT") return "HT";
  if (basis === "UNQUALIFIED") return "(base fiscale non précisée)";
  return "(base inconnue)";
}

export function price(amount: string, basis: string | null | undefined): string {
  return `${money(amount)} ${basisLabel(basis)}`;
}

export function quantityRange(min: number, max: number | null): string {
  if (max === null) return `${min} et plus`;
  if (min === max) return `${min}`;
  return `${min} à ${max}`;
}

/** Valeur d'axe telle que publiée (aucune transformation de sens), première lettre en capitale. */
export function axisValue(v: string): string {
  return v.length === 0 ? v : v.charAt(0).toLocaleUpperCase("fr-FR") + v.slice(1);
}

export type AxisDisplay = { label: string; value: string };

export function axesText(axes: AxisDisplay[]): string {
  return axes.length === 0 ? "Modèle unique" : axes.map((a) => `${a.label} : ${axisValue(a.value)}`).join(" · ");
}

const PARIS = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", dateStyle: "long", timeStyle: "short" });

export function parisDate(utc: string): string {
  const d = new Date(utc);
  return Number.isNaN(d.getTime()) ? utc : `${PARIS.format(d)} (heure de Paris)`;
}
