/**
 * Formatage d'affichage pur (client et serveur), sans arithmétique : les montants restent les chaînes Money
 * C0 (`^\d+\.\d{2}$`) reformatées en français. Le public ne voit jamais de jargon : « HT » n'est écrit que lorsque la génération
 * le DÉCLARE ; une base non déclarée n'est ni affirmée ni commentée (aucun suffixe), jamais un faux HT ni un faux TTC.
 */
export function money(amount: string): string {
  const m = /^(\d+)\.(\d{2})$/.exec(amount);
  if (!m) return "montant illisible";
  return `${m[1]!.replace(/\B(?=(\d{3})+(?!\d))/g, " ")},${m[2]} €`;
}

export function basisLabel(basis: string | null | undefined): string {
  if (basis === "HT") return "HT";
  return "";
}

/**
 * Friction 14 (V5.1) : la mention LOURDE « (base fiscale non précisée) » n'est plus répétée à chaque ligne quand TOUTES les lignes affichées d'un écran la partagent : elle est
 * dite UNE fois par le bandeau de l'écran (`BasisNotice`) et sur chaque total. Dès qu'une ligne a une autre base (HT, inconnue) ou qu'aucune ligne n'est chiffrée, CHAQUE ligne garde
 * sa propre mention. Une base qualifiée (« HT ») reste, elle, toujours écrite sur la ligne (courte et sans ambiguïté). La base fiscale n'est donc jamais masquée : elle est soit sur la
 * ligne, soit dans le bandeau de l'écran qui contient la ligne, et toujours sur le total.
 */
export type UniformBasis = { uniform: true; basis: "UNQUALIFIED" } | { uniform: false };

export function uniformBasis(bases: Iterable<string | null | undefined>): UniformBasis {
  const seen = new Set<string | null | undefined>(bases);
  if (seen.size === 1 && seen.has("UNQUALIFIED")) return { uniform: true, basis: "UNQUALIFIED" };
  return { uniform: false };
}

/** Le texte du bandeau d'écran. */
export function basisNoticeText(): string {
  return "";
}

/**
 * La base fiscale d'un TOTAL, toujours dite (réserve de revue f1) : celle des lignes chiffrées si elle est unique ; « non précisée » si aucune ligne chiffrée ne porte de base ;
 * sinon les bases RÉELLEMENT présentes, nommées (« HT et non précisée », « HT et inconnue »…). Aucune arithmétique, aucune interprétation.
 */
export function totalBasisLabel(bases: Iterable<string | null | undefined>): string {
  let all = 0;
  let ht = 0;
  for (const b of bases) {
    all += 1;
    if (b === "HT") ht += 1;
  }
  return all > 0 && ht === all ? "HT" : "";
}

export function price(amount: string, basis: string | null | undefined): string {
  return `${money(amount)} ${basisLabel(basis)}`.trimEnd();
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
