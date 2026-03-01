/**
 * Dictionnaire de synonymes métier PRODES.
 * Chaque groupe liste des termes considérés équivalents pour la recherche.
 * Modifier ce fichier pour enrichir les correspondances sans toucher au code.
 */
export const SYNONYM_GROUPS: string[][] = [
  ["banc public", "banc urbain", "banc extérieur", "banc de jardin", "banc de parc"],
  ["poubelle", "corbeille", "bac à déchets", "poubelle urbaine", "corbeille extérieure", "bac de propreté"],
  ["table pique-nique", "table picnic", "table de pique-nique", "table de plein air"],
  ["barrière", "barrière de sécurité", "barrière urbaine", "barrière de parc", "garde-corps"],
  ["abri vélo", "abri bicyclette", "abri cycliste", "parking vélo", "range vélo"],
  ["bac à sable", "aire de jeux sable", "carré de sable"],
  ["panneau", "panneau signalisation", "panneau indicateur", "panneau de signalisation"],
  ["poteau", "potelet", "borne", "borne d'accès"],
  ["mobilier urbain", "équipement urbain", "aménagement urbain"],
  ["siège", "fauteuil", "chaise", "assise"],
  ["table", "table de collectivité", "table cantine", "table scolaire"],
  ["vestiaire", "casier", "armoire vestiaire", "armoire de rangement"],
  ["jardinière", "bac à fleurs", "bac plantes", "pot extérieur"],
  ["fontaine", "fontaine à eau", "point d'eau", "borne d'eau"],
  ["cendrier", "cendrier urbain", "cendrier de sol", "poteau cendrier"],
  ["luminaire", "lampadaire", "éclairage urbain", "éclairage public"],
  ["abri bus", "abri voyageurs", "abribus"],
  ["clôture", "grillage", "grille", "palissade"],
  ["banquette", "banquette extérieure", "banquette de jardin"],
  ["toboggan", "glissière", "glissade", "toboggan de jeux"],
];

/** Normalise un terme : minuscules, sans accents, espaces nettoyés. */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Retourne le groupe de synonymes contenant le terme donné.
 * Si aucun groupe trouvé, retourne [term].
 */
export function getSynonymGroup(term: string): string[] {
  const normTerm = normalize(term);
  const group = SYNONYM_GROUPS.find((g) =>
    g.some((s) => {
      const ns = normalize(s);
      return ns === normTerm || ns.includes(normTerm) || normTerm.includes(ns);
    }),
  );
  return group ?? [term];
}

/**
 * Expand une requête en une liste de termes alternatifs pour la recherche.
 * Retourne { terms: string[], enriched: boolean }
 */
export function expandQuery(query: string): { terms: string[]; enriched: boolean } {
  const group = getSynonymGroup(query);
  const enriched = group.length > 1;
  return { terms: group, enriched };
}
