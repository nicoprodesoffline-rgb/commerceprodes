import type { Metadata } from "next";
import type { EditorialPage } from "./model";

/** Métadonnées du même jeu que le rendu ; robots reste hérité de la mise en page. */
export function editorialMetadata(page: Pick<EditorialPage, "title" | "seo_title" | "seo_description" | "canonical">, origin: string | undefined): Metadata {
  const metadata: Metadata = { title: page.seo_title || page.title };
  if (page.seo_description) metadata.description = page.seo_description;
  if (page.canonical && origin && origin.trim() === origin) {
    try {
      const url = new URL(origin);
      if ((url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password && url.pathname === "/" && !url.search && !url.hash) {
        metadata.alternates = { canonical: url.origin + page.canonical };
      }
    } catch { /* Origine absente ou invalide : aucune canonique inventée. */ }
  }
  return metadata;
}
