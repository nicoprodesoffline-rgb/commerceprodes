/**
 * Texte de la fiche affiché UNE seule fois : le texte court vit sous le prix ; l'onglet « Description » ne garde que ce que le long ajoute.
 * Rendu : le long moins les paragraphes qui répètent le court et moins le court placé en tête ; vide si le long n'ajoute rien (long = court).
 */
const norm = (s: string): string => s.replace(/\s+/g, " ").trim();

export function descriptionRest(short: string, long: string): string {
  const s = norm(short);
  const l = long.trim();
  if (l === "") return "";
  if (s === "") return l;
  const kept = l.split(/\n{2,}/).filter((paragraph) => norm(paragraph) !== s);
  let rest = kept.join("\n\n").trim();
  const flat = short.trim();
  if (rest.startsWith(flat) && (rest.length === flat.length || /\s/.test(rest[flat.length]!))) rest = rest.slice(flat.length).trim();
  return rest;
}
