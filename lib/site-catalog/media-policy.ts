/**
 * Vrai quand les visuels de la génération servie peuvent être montrés au public. Une génération marquée « données de test » ne publie que des
 * visuels synthétiques : la vitrine ne les montre jamais (état neutre « Visuel non disponible »). Module pur, utilisable côté serveur.
 */
export function imagesAllowed(dataLabel: string | null | undefined): boolean {
  return dataLabel !== undefined && dataLabel !== null && dataLabel !== "STAGING_FIXTURE";
}
