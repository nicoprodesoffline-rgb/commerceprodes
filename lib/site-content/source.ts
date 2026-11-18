import { cache } from "react";
import { catalogOrNull } from "@/lib/site-catalog/page";
import type { Catalog } from "@/lib/site-catalog/catalog";
import type { CatalogRefs, EditorialSet } from "./model";
import { readEditorialSet } from "./reader";
import { universeEntries } from "./pages";
import { editorialFromV2 } from "./v2";
import { getActiveContentV2 } from "./v2-source";
import type { PagesSource, PublishedPage } from "./pages";

const references = new WeakMap<Catalog, CatalogRefs>();

export const getEditorialSet = cache(async (): Promise<EditorialSet | null> => {
  // Cercle 3 : les contenus v2 reçus par le canal signé passent d'abord ; sans eux, le dossier partagé v1 (SITE_CONTENT_DIR) reste lu comme avant.
  const v2 = await getActiveContentV2();
  if (v2 !== null) return editorialFromV2(v2);
  try {
    const catalog = await catalogOrNull();
    if (!catalog) return null;
    let refs = references.get(catalog);
    if (!refs) {
      refs = {
        categoryKeys: new Set(catalog.categories.map(c => c.category_key)),
        familyKeys: new Set(catalog.families.map(f => f.public_family_key)),
        mediaShas: new Set(catalog.families.flatMap(f => [f.image_main_sha256, ...f.items.flatMap(i => i.public_media_refs)])),
        catalogSha256: catalog.meta.payload_sha256,
      };
      references.set(catalog, refs);
    }
    return await readEditorialSet(process.env.SITE_CONTENT_DIR, refs);
  } catch {
    console.warn("[site-content] SOURCE_UNAVAILABLE");
    return null;
  }
});

export function getPagesSource(): PagesSource {
  return { listPublished: async () => (await getEditorialSet())?.pages.map(p => ({ slug: p.slug === "/" ? "/" : p.slug.slice(1), title: p.title, order: p.nav.order, showInBar: p.nav.showInBar })) ?? [] };
}

export async function loadUniverse(source: PagesSource = getPagesSource()): Promise<PublishedPage[]> {
  try {
    return universeEntries(await source.listPublished());
  } catch {
    return [];
  }
}
