/**
 * Vrai quand les visuels de la génération servie peuvent être montrés au public. Une génération marquée « données de test » ne publie que des
 * visuels synthétiques : la vitrine ne les montre jamais (état neutre « Visuel non disponible »). Module pur, utilisable côté serveur.
 */
export function imagesAllowed(dataLabel: string | null | undefined, env: Record<string, string | undefined> = process.env): boolean {
  if (dataLabel === undefined || dataLabel === null) return false;
  if (dataLabel !== "STAGING_FIXTURE") return true;
  return recetteShowsStagingImages(env);
}

/**
 * RECETTE SEULEMENT (branche e2e/commerce, issue #89) : une instance de recette PRIVÉE, en `SITE_ENV=staging`, dont l'opérateur a lui-même choisi les images,
 * peut les montrer malgré l'étiquette `STAGING_FIXTURE` du publieur de la Factory. Désactivé par défaut ; refusé hors staging ; ne change ni C0 ni l'étiquette.
 */
export function recetteShowsStagingImages(env: Record<string, string | undefined> = process.env): boolean {
  return env["SITE_RECETTE_SHOW_STAGING_IMAGES"] === "1" && env["SITE_ENV"] === "staging";
}
