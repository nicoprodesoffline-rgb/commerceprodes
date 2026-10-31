import { universeEntries } from "./pages";
import type { PagesSource, PublishedPage } from "./pages";

export function getPagesSource(): PagesSource {
  // Aucune page n'est publiée tant que le format `site_content.v1` n'est pas branché ; ne jamais afficher de page non publiée.
  return { listPublished: async () => [] };
}

export async function loadUniverse(source: PagesSource): Promise<PublishedPage[]> {
  try {
    return universeEntries(await source.listPublished());
  } catch {
    return [];
  }
}
