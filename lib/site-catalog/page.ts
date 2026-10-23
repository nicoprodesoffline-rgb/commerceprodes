/**
 * Accès des pages au catalogue.
 *
 * - `catalogForPage()` est dédoublonné PAR RENDU (React `cache`) : mise en page, page et métadonnées d'une
 *   même requête lisent UNE fois la génération (aucune mémoire entre deux requêtes).
 * - Indisponible : la page d'indisponibilité est servie en HTTP 503 par `proxy.ts` AVANT le rendu
 *   (`catalogAvailability()`). Si la génération disparaît entre ce contrôle et le rendu, l'erreur est consignée
 *   puis relancée : `app/error.tsx` s'affiche (jamais un catalogue vide).
 */
import { cache } from "react";
import { loadCatalog, type Catalog } from "./catalog";
import { ConfigInvalid, serverNowUtc } from "./clock";
import { CatalogUnavailable } from "./source";

const loadOnce = cache(async (): Promise<Catalog | CatalogUnavailable> => {
  try {
    return await loadCatalog();
  } catch (error) {
    if (error instanceof CatalogUnavailable) return error;
    throw error;
  }
});

export async function catalogForPage(): Promise<Catalog> {
  const r = await loadOnce();
  if (r instanceof CatalogUnavailable) {
    console.error(`[site-catalog] indisponible : ${r.reason} — ${r.message}`);
    throw new Error(`CATALOG_UNAVAILABLE:${r.reason}`);
  }
  return r;
}

/** Variante de `catalogForPage` pour la mise en page : `null` au lieu de lever. */
export async function catalogOrNull(): Promise<Catalog | null> {
  const r = await loadOnce();
  return r instanceof CatalogUnavailable ? null : r;
}

export type Availability = { ok: true } | { ok: false; kind: "CATALOG_UNAVAILABLE" | "CONFIG_INVALID"; reason: string };

/**
 * Contrôle de servabilité utilisé par `proxy.ts` avant le rendu d'une page boutique : horloge valide ET
 * génération servable (mêmes fonctions que les pages). La cause est consignée côté serveur seulement.
 */
export async function catalogAvailability(): Promise<Availability> {
  try {
    serverNowUtc();
  } catch (error) {
    if (error instanceof ConfigInvalid) {
      console.error(`[site-clock] configuration invalide : ${error.reason} — ${error.message}`);
      return { ok: false, kind: "CONFIG_INVALID", reason: error.reason };
    }
    throw error;
  }
  try {
    await loadCatalog();
    return { ok: true };
  } catch (error) {
    if (error instanceof CatalogUnavailable) {
      console.error(`[site-catalog] indisponible : ${error.reason} — ${error.message}`);
      return { ok: false, kind: "CATALOG_UNAVAILABLE", reason: error.reason };
    }
    throw error;
  }
}
