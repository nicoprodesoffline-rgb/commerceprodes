/**
 * Accès des pages au catalogue. Indisponible → l'erreur est consignée côté serveur puis
 * relancée : la page d'erreur (`app/error.tsx`, HTTP 500) s'affiche, jamais un catalogue vide.
 */
import { loadCatalog, type Catalog } from "./catalog";
import { CatalogUnavailable } from "./source";

export async function catalogForPage(): Promise<Catalog> {
  try {
    return await loadCatalog();
  } catch (error) {
    if (error instanceof CatalogUnavailable) {
      console.error(`[site-catalog] indisponible : ${error.reason} — ${error.message}`);
      throw new Error(`CATALOG_UNAVAILABLE:${error.reason}`);
    }
    throw error;
  }
}

/** Variante de `catalogForPage` pour la mise en page : `null` au lieu de lever. */
export async function catalogOrNull(): Promise<Catalog | null> {
  try {
    return await loadCatalog();
  } catch (error) {
    if (error instanceof CatalogUnavailable) return null;
    throw error;
  }
}
