import type { MetadataRoute } from "next";
import { catalogOrNull } from "@/lib/site-catalog/page";
import { getEditorialSet } from "@/lib/site-content/source";
import { publicOrigin, sitemapUrls } from "@/lib/seo/seo";

export const dynamic = "force-dynamic";

/** `/sitemap.xml` (3.19, S09) : accueil, rubriques non vides et non masquées, familles publiées, pages publiées de la génération servie. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const catalog = await catalogOrNull();
  const pages = (await getEditorialSet())?.pages ?? [];
  return sitemapUrls(publicOrigin(process.env.SITE_PUBLIC_ORIGIN), catalog?.categories ?? [], catalog?.families ?? [], pages).map((url) => ({ url }));
}
