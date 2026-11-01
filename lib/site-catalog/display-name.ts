/**
 * Nom de famille affiché en casse de phrase quand la donnée est ENTIÈREMENT en capitales (« TENTE DE JARDIN » → « Tente de jardin »). La donnée n'est pas modifiée :
 * seul l'affichage change ; un nom qui contient déjà une minuscule est rendu tel quel. Règle identique à celle de la Factory (même découpage en mots) : chaque mot
 * (lettres, chiffres, soulignés) reste en capitales s'il est « ABS », s'il porte un chiffre, ou s'il fait de 2 à 4 lettres sans voyelle (aeiouy, accents ignorés, y compris) ;
 * tout autre mot passe en minuscules ; puis la première lettre du nom prend la majuscule. Un tiret ou une apostrophe sépare deux mots (« ÉTÉ-24 » → « été-24 »).
 */
const KEEP = new Set(["ABS"]);
const VOWEL = /[aeiouy]/;

const plain = (s: string): string => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

function keepsCapitals(word: string): boolean {
  if (KEEP.has(word) || /\d/.test(word)) return true;
  return word.length >= 2 && word.length <= 4 && !VOWEL.test(plain(word));
}

const isAllCaps = (s: string) => /\p{L}/u.test(s) && s === s.toLocaleUpperCase("fr-FR") && s !== s.toLocaleLowerCase("fr-FR");

export function displayName(raw: string): string {
  if (!isAllCaps(raw)) return raw;
  const lowered = raw.replace(/[\p{L}\p{N}_]+/gu, (word) => (keepsCapitals(word) ? word : word.toLocaleLowerCase("fr-FR")));
  return lowered.charAt(0).toLocaleUpperCase("fr-FR") + lowered.slice(1);
}
