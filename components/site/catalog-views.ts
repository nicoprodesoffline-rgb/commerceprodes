/**
 * Projections d'affichage côté serveur sur le catalogue servi (aucune donnée hors DTO, aucun prix calculé,
 * aucun ordre inventé : l'ordre est celui du DTO, déjà normatif — C0 §8.1).
 */
import type { Catalog, Family } from "@/lib/site-catalog/catalog";
import { buildNavigation, type Navigation } from "@/lib/site-catalog/navigation";
import type { Crumb } from "@/components/layout/breadcrumbs";

const navigations = new WeakMap<Catalog, Navigation>();

/** Navigation (3 niveaux max, rubriques vides masquées) du catalogue servi, construite une fois par catalogue. */
export function navigationOf(catalog: Catalog): Navigation {
  let nav = navigations.get(catalog);
  if (!nav) {
    nav = buildNavigation(catalog.categories, catalog.families);
    navigations.set(catalog, nav);
  }
  return nav;
}

/** Fil d'Ariane de la catégorie `key` (ou de son ancêtre de niveau 3 si elle est plus profonde). Jamais plus de 3 maillons. */
export function categoryCrumbs(catalog: Catalog, key: string): Crumb[] {
  const nav = navigationOf(catalog);
  const anchor = nav.anchor(key);
  return anchor === null ? [] : nav.chain(anchor).map((c) => ({ label: c.name, href: `/categorie/${c.key}` }));
}

export type FamilyCardData = { slug: string; name: string; description: string; imageSha: string; variantCount: number };

export function familyCard(f: Family): FamilyCardData {
  return { slug: f.slug, name: f.name, description: f.description_short, imageSha: f.image_main_sha256, variantCount: f.items.length };
}

function fold(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("fr-FR").replace(/\s+/g, " ").trim();
}

export const SEARCH_MAX = 100;

/**
 * Recherche simple côté serveur (aucun index externe) : chaque mot de la requête doit figurer dans le nom ou le
 * slug de la Famille (insensible à la casse et aux accents) ; une référence `PI-…` publiée trouve sa Famille.
 * Ordre du DTO.
 */
export function searchFamilies(catalog: Catalog, raw: string): Family[] {
  const q = fold(raw.slice(0, SEARCH_MAX));
  if (q === "") return [];
  const ref = raw.trim().toUpperCase();
  if (/^PI-[0-9A-Z]{9}$/.test(ref)) {
    const r = catalog.resolveItem(ref);
    return r.kind === "PUBLISHED" ? [r.family] : [];
  }
  const words = q.split(" ");
  return catalog.families.filter((f) => {
    const hay = `${fold(f.name)} ${f.slug.replace(/-/g, " ")}`;
    return words.every((w) => hay.includes(w));
  });
}
